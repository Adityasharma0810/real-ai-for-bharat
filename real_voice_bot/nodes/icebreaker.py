import logging
from nodes.utils import get_llm, build_messages, strip_tag
from state import InterviewState

logger = logging.getLogger("skillfit.icebreaker")

ICEBREAKER_PROMPT = """You are Priya, a warm, patient, and friendly interviewer for AI SkillFit,
a government skill assessment program in Karnataka.

You are conducting a VOICE interview over a phone call. This is very important to remember —
the candidate is SPEAKING to you, not typing. Behave exactly like a real human interviewer would.

RULES:
- Keep responses short — 1 to 2 sentences max.
- Be conversational, warm, and encouraging. Speak naturally.
- No bullet points, no markdown, no lists, no special formatting ever.
- Ask only ONE question at a time. Never ask two questions together.
- LISTEN carefully. If the candidate asks you to repeat something, or says "what?", "sorry?",
  "I didn't get that", "can you say that again", or anything similar — cheerfully repeat or
  rephrase your last question. Do NOT move forward.
- If the candidate gives a vague answer, gently ask for clarification. For example, if they say
  "I do electrical work" but haven't mentioned years, ask about years specifically.
- Acknowledge what the candidate says before asking the next thing. For example: "That's great!"
  or "Wonderful, thank you." — then ask your question.
- Never sound robotic or mechanical. Imagine you are sitting across from this person with a cup of tea.

Your job is to collect three things naturally through conversation:
1. The candidate's name
2. Their trade or profession
3. Their years of experience (as a number)

Once you have confirmed ALL THREE — name, trade, AND years of experience — end your response
with the tag: [ICEBREAKER_COMPLETE]
Do NOT add this tag unless all three are clearly confirmed in the conversation.
The tag is a system signal only — never explain or reference it to the candidate."""

def icebreaker_node(state: InterviewState) -> InterviewState:
    user_input = state["last_user_input"]

    # Add user message to history
    history = state["messages"] + [{"role": "user", "content": user_input}]

    messages = build_messages(ICEBREAKER_PROMPT, history)
    llm = get_llm(temperature=0.7, max_tokens=200)

    response = llm.invoke(messages)
    response_text = response.content

    tag_detected = "[ICEBREAKER_COMPLETE]" in response_text
    clean_response = strip_tag(response_text, "[ICEBREAKER_COMPLETE]")

    # Add assistant response to history (without the tag)
    history = history + [{"role": "assistant", "content": clean_response}]

    logger.info(f"[Icebreaker] Response: {clean_response[:80]} | Complete: {tag_detected}")

    return {
        **state,
        "messages": history,
        "last_response": clean_response,
        "phase": "extract_info" if tag_detected else "icebreaker",
    }


def extract_info_node(state: InterviewState) -> InterviewState:
    """Extracts name, trade, years_of_experience from conversation history."""
    history_text = "\n".join(
        f"{m['role']}: {m['content']}" for m in state["messages"]
    )

    llm = get_llm(temperature=0, max_tokens=200)

    prompt = f"""From this interview conversation, extract the candidate's info.
Return ONLY a JSON object with keys: name, trade, years_of_experience.
If any field is unclear, use "unknown". No explanation. No markdown. Just JSON.

Conversation:
{history_text}"""

    result = llm.invoke(prompt)

    import json
    import re
    try:
        clean = re.sub(r"```json|```", "", result.content).strip()
        candidate_info = json.loads(clean)
    except Exception:
        candidate_info = {"name": "unknown", "trade": "unknown", "years_of_experience": "unknown"}

    # Keep metadata injected from the LiveKit room, such as phone/email/job_id.
    # The LLM extraction only knows the spoken icebreaker history and should not
    # erase identifiers needed for saving and result lookup.
    candidate_info = {
        **state.get("candidate_info", {}),
        **candidate_info,
    }

    logger.info(f"[ExtractInfo] {candidate_info}")

    return {
        **state,
        "candidate_info": candidate_info,
        "phase": "experience",
        "messages": [],
    }
