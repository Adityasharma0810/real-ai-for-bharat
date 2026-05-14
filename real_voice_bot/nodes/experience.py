import logging
from nodes.utils import get_llm, build_messages, strip_tag
from state import InterviewState

logger = logging.getLogger("skillfit.experience")

EXPERIENCE_PROMPT = """You are Priya, a warm and empathetic interviewer for AI SkillFit.

You are conducting a VOICE interview. The candidate is SPEAKING to you, not typing.
Behave exactly like a real human interviewer sitting across the table.

You are now exploring the candidate's work experience and background.

RULES:
- Keep responses to 1 to 2 sentences max.
- Ask only ONE question at a time. Never combine multiple questions.
- Be genuinely curious about their work. React to what they say — show interest!
  For example: "Oh that's interesting!", "I see, that must have been challenging."
- If the candidate asks you to repeat something, or says "what?", "sorry?",
  "can you repeat that?" — cheerfully repeat or rephrase your last question.
  Do NOT move forward or ask a new question.
- If the candidate gives a very short or vague answer, gently probe deeper.
  For example: "Could you tell me a bit more about that?" or
  "That's interesting — what kind of projects were those?"
- Ask 2 to 3 experience questions total. Don't rush — let the conversation breathe.
- No bullet points, no markdown, no lists, no special formatting ever.
- Sound warm, patient, and human. Never robotic.

Once you feel you have enough context about their work experience (after 2-3 good exchanges),
end your response with: [EXPERIENCE_COMPLETE]
The tag is a system signal only — never explain or reference it to the candidate."""

def experience_node(state: InterviewState) -> InterviewState:
    user_input = state["last_user_input"]
    candidate_info = state["candidate_info"]

    history = state["messages"]

    # On first turn of experience phase, prime the LLM with candidate context
    if not history:
        priming = (
            f"The candidate's name is {candidate_info.get('name')}, "
            f"they are a {candidate_info.get('trade')} "
            f"with {candidate_info.get('years_of_experience')} of experience. "
            f"Ask one warm contextual question about their work background."
        )
        history = [{"role": "user", "content": priming}]
        messages = build_messages(EXPERIENCE_PROMPT, history)
        llm = get_llm(temperature=0.7, max_tokens=200)
        response = llm.invoke(messages)
        response_text = response.content
        clean_response = strip_tag(response_text, "[EXPERIENCE_COMPLETE]")
        history = history + [{"role": "assistant", "content": clean_response}]

        logger.info(f"[Experience] Opener: {clean_response[:80]}")

        return {
            **state,
            "messages": history,
            "last_response": clean_response,
            "phase": "experience",
        }

    # Normal experience turn
    history = history + [{"role": "user", "content": user_input}]
    messages = build_messages(EXPERIENCE_PROMPT, history)
    llm = get_llm(temperature=0.7, max_tokens=200)
    response = llm.invoke(messages)
    response_text = response.content

    tag_detected = "[EXPERIENCE_COMPLETE]" in response_text
    candidate_turns = sum(
        1
        for message in history
        if message.get("role") == "user"
        and not str(message.get("content", "")).startswith("The candidate's name is")
    )
    if candidate_turns >= 2:
        tag_detected = True

    clean_response = strip_tag(response_text, "[EXPERIENCE_COMPLETE]")
    history = history + [{"role": "assistant", "content": clean_response}]

    logger.info(f"[Experience] Response: {clean_response[:80]} | Complete: {tag_detected}")

    return {
        **state,
        "messages": history,
        "last_response": clean_response,
        "phase": "load_questions" if tag_detected else "experience",
    }
