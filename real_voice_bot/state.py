from typing import TypedDict, Optional

class InterviewState(TypedDict):
    # Phase control
    phase: str                    
    # Candidate info
    candidate_info: dict          
    # Conversation history 
    messages: list
    # Technical phase
    questions: list               
    question_index: int           
    scores: list                 
    weak_topics: list           
    awaiting_followup: bool       
    followup_count: int         
    # I/O between graph and agent
    last_user_input: str         
    last_response: str
    # Persistence
    result_saved: Optional[bool]
    saved_result_id: Optional[str]
