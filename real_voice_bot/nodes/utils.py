import os
import json
import random
import re
from collections import defaultdict
from langchain_groq import ChatGroq

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = "llama-3.3-70b-versatile"

JSON_FILES = [
    "Blue-collar-Trades.json",
    "Polytechnic-Skilled-Roles.json",
    "Semi-Skilled-Workforce.json",
]

def get_llm(temperature=0.7, max_tokens=150):
    return ChatGroq(
        model=GROQ_MODEL,
        groq_api_key=GROQ_API_KEY,
        max_tokens=max_tokens,
        temperature=temperature,
    )

def build_messages(system_prompt: str, history: list) -> list:
    """Builds the message list for a Groq call — system + history."""
    return [{"role": "system", "content": system_prompt}] + history

def strip_tag(text: str, tag: str) -> str:
    """Removes a system tag from response text before speaking."""
    return text.replace(tag, "").strip()

def _normalise_trade_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()

def load_questions_for_trade(trade: str) -> list:
    """
    Loads all questions for a trade from the JSON files.
    Returns 10 questions spread across topics.
    """
    trade_data = None
    all_trade_data = []
    requested_trade = _normalise_trade_name(trade)

    for file in JSON_FILES:
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
            all_trade_data.extend(data.values())

            normalised_keys = {
                key: _normalise_trade_name(key)
                for key in data
            }

            # Prefer exact matches, then forgiving partial matches such as
            # "electrical work" -> "Electrician".
            for key, normalised_key in normalised_keys.items():
                if normalised_key == requested_trade:
                    trade_data = data[key]
                    break
            if not trade_data and requested_trade:
                for key, normalised_key in normalised_keys.items():
                    if requested_trade in normalised_key or normalised_key in requested_trade:
                        trade_data = data[key]
                        break
        except FileNotFoundError:
            continue
        if trade_data:
            break

    if not trade_data:
        # Keep the interview moving even when the extracted trade is vague
        # or absent. This is better than silently skipping the technical round.
        trade_data = {}
        for candidate_trade in all_trade_data:
            for topic, q_list in candidate_trade.items():
                trade_data.setdefault(topic, []).extend(q_list[:2])

    # Round-robin across topics for coverage
    topic_buckets = defaultdict(list)
    for topic, q_list in trade_data.items():
        for q in q_list:
            topic_buckets[topic].append({
                "topic": topic,
                "question": q["question"],
                "ideal_answer": q["ideal_answer"]
            })

    # Shuffle within each bucket
    for topic in topic_buckets:
        random.shuffle(topic_buckets[topic])

    selected = []
    topic_keys = list(topic_buckets.keys())
    i = 0
    while len(selected) < 10 and any(topic_buckets[t] for t in topic_keys):
        topic = topic_keys[i % len(topic_keys)]
        if topic_buckets[topic]:
            selected.append(topic_buckets[topic].pop(0))
        i += 1

    random.shuffle(selected)
    return selected
