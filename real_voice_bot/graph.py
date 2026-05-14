from langgraph.graph import StateGraph, END
from state import InterviewState
from nodes.icebreaker import icebreaker_node, extract_info_node
from nodes.experience import experience_node
from langgraph.checkpoint.memory import MemorySaver
from nodes.technical import (
    load_questions_node,
    technical_ask_node,
    technical_score_node,
    close_interview_node,
)

def route_from_icebreaker(state: InterviewState) -> str:
    return state["phase"]

def route_from_experience(state: InterviewState) -> str:
    return state["phase"]

def route_from_technical_score(state: InterviewState) -> str:
    return state["phase"]

def build_graph():
    graph = StateGraph(InterviewState)

    # All nodes
    graph.add_node("icebreaker", icebreaker_node)
    graph.add_node("extract_info", extract_info_node)
    graph.add_node("experience", experience_node)
    graph.add_node("load_questions", load_questions_node)
    graph.add_node("technical_ask", technical_ask_node)
    graph.add_node("technical_score", technical_score_node)
    graph.add_node("close", close_interview_node)

    # Entry point
    graph.set_entry_point("icebreaker")

    # Icebreaker edges
    graph.add_conditional_edges(
        "icebreaker",
        route_from_icebreaker,
        {
            "icebreaker": "icebreaker",
            "extract_info": "extract_info",
        }
    )

    graph.add_edge("extract_info", "experience")

    # Experience edges
    graph.add_conditional_edges(
        "experience",
        route_from_experience,
        {
            "experience": "experience",
            "load_questions": "load_questions",
        }
    )

    # After loading questions always ask first question
    graph.add_edge("load_questions", "technical_ask")

    graph.add_edge("technical_ask", END)

    # Score node routes to ask next or close
    graph.add_conditional_edges(
        "technical_score",
        route_from_technical_score,
        {
            "technical_ask": "technical_ask",
            "technical_listen": END,   
            "close": "close",
        }
    )

    graph.add_edge("close", END)

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)

interview_graph = build_graph()