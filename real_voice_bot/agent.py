import logging
import asyncio
import os
import re
import json
import time
from dotenv import load_dotenv

from livekit import rtc
from livekit.agents import JobContext, WorkerOptions, cli, AutoSubscribe
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam

from nodes.icebreaker import icebreaker_node, extract_info_node
from nodes.experience import experience_node
from nodes.technical import (
    load_questions_node,
    technical_ask_node,
    technical_score_node,
    close_interview_node,
    persist_interview_result,
)
from nodes.utils import get_llm
from state import InterviewState

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("skillfit-voice")

LANGUAGE_OPTIONS = {
    "english": ("en-IN", "English"),
    "hindi": ("hi-IN", "Hindi"),
    "bengali": ("bn-IN", "Bengali"),
    "bangla": ("bn-IN", "Bengali"),
    "tamil": ("ta-IN", "Tamil"),
    "telugu": ("te-IN", "Telugu"),
    "gujarati": ("gu-IN", "Gujarati"),
    "kannada": ("kn-IN", "Kannada"),
    "malayalam": ("ml-IN", "Malayalam"),
    "marathi": ("mr-IN", "Marathi"),
    "punjabi": ("pa-IN", "Punjabi"),
    "odia": ("od-IN", "Odia"),
    "oriya": ("od-IN", "Odia"),
}


def detect_language_preference(user_text: str) -> tuple[str, str] | None:
    normalized = re.sub(r"[^a-z\s-]", " ", user_text.lower())
    words = set(normalized.split())

    for language, language_config in LANGUAGE_OPTIONS.items():
        if language in words or language.replace("-", " ") in normalized:
            return language_config

    return None


def translate_for_tts(text: str, language_name: str) -> str:
    if language_name == "English":
        return text

    llm = get_llm(temperature=0, max_tokens=250)
    prompt = f"""Translate this spoken interview response into {language_name}.
Keep it natural, respectful, and conversational.
Return only the translated sentence or sentences.
No markdown, no explanation.

Text:
{text}"""
    return llm.invoke(prompt).content.strip()

def get_initial_state() -> InterviewState:
    return {
        "phase": "icebreaker",
        "candidate_info": {},
        "messages": [],
        "questions": [],
        "question_index": 0,
        "scores": [],
        "weak_topics": [],
        "awaiting_followup": False,
        "followup_count": 0,
        "last_user_input": "",
        "last_response": "",
        "result_saved": False,
        "saved_result_id": None,
    }


def run_interview_step(state: InterviewState) -> InterviewState:
    """
    Simple phase-based dispatcher.
    Runs the correct node(s) based on state['phase'] and chains
    transitions until the graph needs to pause for user input.
    """
    MAX_STEPS = 15  # safety limit to prevent infinite loops

    for _ in range(MAX_STEPS):
        phase = state["phase"]
        logger.info(f"[Dispatcher] Phase: {phase}")

        if phase == "icebreaker":
            state = icebreaker_node(state)
            if state["phase"] == "extract_info":
                continue
            return state

        elif phase == "extract_info":
            state = extract_info_node(state)
            continue

        elif phase == "experience":
            state = experience_node(state)
            if state["phase"] == "load_questions":
                continue
            return state

        elif phase == "load_questions":
            state = load_questions_node(state)
            continue

        elif phase == "technical_ask":
            state = technical_ask_node(state)
            return state

        elif phase == "technical_listen":
            state = technical_score_node(state)
            if state["phase"] == "technical_listen":
                return state  
            continue

        elif phase == "close":
            state = close_interview_node(state)
            return state

        elif phase == "done":
            return state

        else:
            logger.error(f"[Dispatcher] Unknown phase: {phase}")
            return state

    logger.error("[Dispatcher] Hit max steps — breaking out")
    return state


TRANSCRIPT_TOPIC = "interview-transcript"


class VoiceAgent(Agent):
    def __init__(self, room: rtc.Room, initial_candidate_info: dict | None = None):
        super().__init__(
            instructions="You are Priya, a warm interviewer for AI SkillFit.",
            stt=sarvam.STT(
                language="unknown",
                model="saaras:v3",
                mode="translate",
                flush_signal=True,
            ),
            llm=None,
            tts=sarvam.TTS(
                target_language_code="en-IN",
                model="bulbul:v3",
                speaker="ritu",
            ),
        )
        self.state = get_initial_state()
        # Pre-populate candidate_info from room metadata (phone_number, trade)
        if initial_candidate_info:
            self.state["candidate_info"].update(initial_candidate_info)
        self.language_selected = False
        self.preferred_language_code = "en-IN"
        self.preferred_language_name = "English"
        self.room = room

    async def publish_transcript(self, speaker: str, text: str):
        if not text or not text.strip():
            return

        payload = json.dumps(
            {
                "id": f"{speaker}-{int(time.time() * 1000)}",
                "speaker": speaker,
                "text": text.strip(),
                "timestamp": int(time.time() * 1000),
            },
            ensure_ascii=False,
        ).encode("utf-8")

        try:
            await self.room.local_participant.publish_data(
                payload,
                reliable=True,
                topic=TRANSCRIPT_TOPIC,
            )
        except Exception as exc:
            logger.warning(f"[Transcript] Failed to publish transcript event: {exc}")

    def set_tts_language(self, language_code: str, language_name: str):
        self.preferred_language_code = language_code
        self.preferred_language_name = language_name
        self._tts.update_options(target_language_code=language_code)
        logger.info(f"[Language] TTS set to {language_name} ({language_code})")

    async def say_in_preferred_language(self, text: str):
        spoken_text = translate_for_tts(text, self.preferred_language_name)
        await self.publish_transcript("assistant", spoken_text)
        await self.session.say(spoken_text)

    async def on_enter(self):
        greeting = (
            "Hello! Welcome to AI SkillFit. I'm Priya, your interviewer today. "
            "Which language would you prefer for this interview? You can say English, Hindi, Kannada, Tamil, Telugu, Marathi, Bengali, Gujarati, Malayalam, Punjabi, or Odia."
        )
        await self.publish_transcript("assistant", greeting)
        await self.session.say(greeting)

    async def on_exit(self):
        if self.state.get("result_saved"):
            return
        # Fix 2: Always attempt to save on exit — persist_interview_result now
        # handles the zero-score case (interview dropped before technical round)
        # by saving a "Requires Manual Verification" partial record.
        logger.info("[Agent exit] Attempting to save interview result before shutdown.")
        self.state = persist_interview_result(self.state, partial=True)

    async def on_user_turn_completed(self, turn_ctx, new_message):
        user_text = new_message.text_content
        if not user_text or not user_text.strip():
            return

        await self.publish_transcript("user", user_text)

        if not self.language_selected:
            language = detect_language_preference(user_text)
            if not language:
                retry = (
                    "Sorry, I could not clearly understand the language. "
                    "Please say one language, for example Hindi, Kannada, Tamil, or English."
                )
                await self.publish_transcript("assistant", retry)
                await self.session.say(retry)
                return

            language_code, language_name = language
            self.set_tts_language(language_code, language_name)
            self.language_selected = True

            greeting = (
                f"Great, we will continue in {language_name}. "
                "Could you please start by telling me your name?"
            )
            self.state["messages"] = [
                {"role": "assistant", "content": greeting}
            ]
            # Store language in candidate_info so it gets saved with results
            self.state["candidate_info"]["language"] = language_name
            await self.say_in_preferred_language(greeting)
            return

        if self.state.get("phase") == "done":
            return

        logger.info(f"[User | Phase: {self.state['phase']}] {user_text}")

        self.state["last_user_input"] = user_text

        loop = asyncio.get_event_loop()
        self.state = await loop.run_in_executor(
            None,
            lambda: run_interview_step(self.state),
        )

        response = self.state.get("last_response", "")
        if response:
            logger.info(f"[Agent speaking] {response[:80]}")
            await self.say_in_preferred_language(response)


async def entrypoint(ctx: JobContext):
    # Connect to the LiveKit room — audio only, no video
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    logger.info(f"Room connected: {ctx.room.name}")

    # Parse room metadata to pre-populate candidate info
    # This ensures phone_number is saved even if the candidate says a different name
    initial_candidate_info = {}
    try:
        metadata_str = ctx.room.metadata or ""
        if metadata_str:
            metadata = json.loads(metadata_str)
            phone = metadata.get("phone_number", "")
            trade = metadata.get("trade", "")
            email = metadata.get("email", "")
            job_id = metadata.get("job_id", "")
            user_id = metadata.get("user_id", "")
            livekit_room = metadata.get("livekit_room", ctx.room.name)
            if user_id:
                initial_candidate_info["user_id"] = user_id
                logger.info(f"[Entrypoint] Pre-populated user_id from metadata: {user_id}")
            if phone:
                initial_candidate_info["phone_number"] = phone
                logger.info(f"[Entrypoint] Pre-populated phone_number from metadata: {phone}")
            if trade:
                initial_candidate_info["trade"] = trade
                logger.info(f"[Entrypoint] Pre-populated trade from metadata: {trade}")
            if email:
                initial_candidate_info["email"] = email
                logger.info(f"[Entrypoint] Pre-populated email from metadata: {email}")
            if job_id:
                initial_candidate_info["job_id"] = job_id
                logger.info(f"[Entrypoint] Pre-populated job_id from metadata: {job_id}")
            if livekit_room:
                initial_candidate_info["livekit_room"] = livekit_room
    except Exception as e:
        logger.warning(f"[Entrypoint] Could not parse room metadata: {e}")

    agent = VoiceAgent(ctx.room, initial_candidate_info=initial_candidate_info)
    session = AgentSession(min_endpointing_delay=1.5)
    await session.start(agent=agent, room=ctx.room)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, agent_name="skillfit-agent"))
