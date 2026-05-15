"""
server.py — FastAPI backend for AI SkillFit.
All interview data is stored in and read from Supabase directly.
SQLite is no longer used.
"""

import os
import asyncio
import logging
from uuid import uuid4

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from livekit import api

from database import save_result, create_started_interview, get_results, get_result_by_phone, get_result_by_name, get_latest_result, get_result_by_email, update_interview_admin_status, get_blocked_candidates, block_candidate

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("skillfit.server")

LIVEKIT_URL = os.getenv("LIVEKIT_URL", "wss://voice-bot-szlvcdo4.livekit.cloud")
LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY")
LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET")

# Self-ping URL — set RENDER_EXTERNAL_URL in Render's environment variables
# e.g. https://your-service-name.onrender.com
# If not set, the keep-alive task is skipped silently.
RENDER_EXTERNAL_URL = os.getenv("RENDER_EXTERNAL_URL", "").rstrip("/")
KEEP_ALIVE_INTERVAL = 10 * 60  # 10 minutes


async def _keep_alive():
    """Pings /health every 10 minutes so Render's free tier doesn't spin down."""
    if not RENDER_EXTERNAL_URL:
        logger.info("[KeepAlive] RENDER_EXTERNAL_URL not set — skipping keep-alive task.")
        return
    url = f"{RENDER_EXTERNAL_URL}/health"
    logger.info(f"[KeepAlive] Starting — will ping {url} every {KEEP_ALIVE_INTERVAL // 60} min.")
    async with httpx.AsyncClient(timeout=10) as client:
        while True:
            await asyncio.sleep(KEEP_ALIVE_INTERVAL)
            try:
                resp = await client.get(url)
                logger.info(f"[KeepAlive] Ping → {resp.status_code}")
            except Exception as exc:
                logger.warning(f"[KeepAlive] Ping failed: {exc}")


app = FastAPI(
    title="AI SkillFit Backend",
    description="Government skill assessment platform — Supabase-backed",
    version="2.0.0",
)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(_keep_alive())

allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "").strip()
allowed_origins = [
    origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()
]
allow_credentials = True
if not allowed_origins:
    allowed_origins = ["*"]
    allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Schemas ──────────────────────────────────────────────────────────────────

class StartInterviewRequest(BaseModel):
    user_id: str = ""
    candidate_name: str
    trade: str
    phone_number: str
    email: str = ""
    job_id: str = ""


class StartInterviewResponse(BaseModel):
    token: str
    room: str
    url: str


class SaveResultRequest(BaseModel):
    user_id: str | None = None
    job_id: str | None = None
    livekit_room: str | None = None
    candidate_name: str
    phone_number: str
    trade: str
    scores: list
    weak_topics: list
    fitment: str
    average_score: float
    language: str = "English"
    district: str | None = None
    feedback: dict | None = None
    transcript: list | None = None
    email: str | None = None


class SaveResultResponse(BaseModel):
    status: str
    id: str  # Supabase UUID


class UpdateInterviewStatusRequest(BaseModel):
    admin_status: str | None = None


class BlockCandidateRequest(BaseModel):
    user_id: str
    job_id: str | None = None
    company_id: str | None = None
    livekit_room: str | None = None
    reason: str = "Interview stopped after 5 proctoring/OCR flags."


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/start-interview", response_model=StartInterviewResponse)
async def start_interview(req: StartInterviewRequest):
    short_id = uuid4().hex[:8]
    room_name = f"interview-{req.phone_number}-{short_id}"
    logger.info(f"[Server] Starting interview — room={room_name}, candidate={req.candidate_name}")

    try:
        lkapi = api.LiveKitAPI(url=LIVEKIT_URL, api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)

        import json as _json
        room_metadata = _json.dumps({
            "user_id": req.user_id,
            "candidate_name": req.candidate_name,
            "trade": req.trade,
            "phone_number": req.phone_number,
            "email": req.email,
            "job_id": req.job_id,
            "livekit_room": room_name,
        })

        await lkapi.room.create_room(
            api.CreateRoomRequest(
                name=room_name,
                empty_timeout=600,
                max_participants=2,
                metadata=room_metadata,
            )
        )

        create_started_interview(
            user_id=req.user_id or None,
            candidate_name=req.candidate_name,
            phone_number=req.phone_number,
            trade=req.trade,
            email=req.email,
            job_id=req.job_id or None,
            livekit_room=room_name,
        )

        await lkapi.agent_dispatch.create_dispatch(
            api.CreateAgentDispatchRequest(
                agent_name="skillfit-agent",
                room=room_name,
                metadata=room_metadata,
            )
        )

        token = (
            api.AccessToken(api_key=LIVEKIT_API_KEY, api_secret=LIVEKIT_API_SECRET)
            .with_identity(f"candidate-{req.phone_number}")
            .with_name(req.candidate_name)
            .with_grants(api.VideoGrants(room_join=True, room=room_name))
            .to_jwt()
        )

        await lkapi.aclose()
        return StartInterviewResponse(token=token, room=room_name, url=LIVEKIT_URL)

    except Exception as e:
        logger.error(f"[Server] Failed to start interview: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/save-result", response_model=SaveResultResponse)
async def save_result_endpoint(req: SaveResultRequest):
    """Saves interview result directly to Supabase. Called by the agent."""
    try:
        inserted_id = save_result(
            candidate_name=req.candidate_name,
            phone_number=req.phone_number,
            trade=req.trade,
            scores=req.scores,
            weak_topics=req.weak_topics,
            fitment=req.fitment,
            average_score=req.average_score,
            language=req.language,
            district=req.district,
            feedback=req.feedback,
            transcript=req.transcript,
            email=req.email,
            job_id=req.job_id,
            user_id=req.user_id,
            livekit_room=req.livekit_room,
        )
        logger.info(f"[Server] Saved — ID={inserted_id}, candidate={req.candidate_name}")
        return SaveResultResponse(status="saved", id=str(inserted_id))
    except Exception as e:
        logger.error(f"[Server] Save failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results")
async def get_results_endpoint(
    trade: str | None = Query(default=None),
    fitment: str | None = Query(default=None),
    category: str | None = Query(default=None),
    language: str | None = Query(default=None),
    district: str | None = Query(default=None),
    min_score: float | None = Query(default=None),
    max_score: float | None = Query(default=None),
    integrity_flag: bool | None = Query(default=None),
    user_id: str | None = Query(default=None),
    phone: str | None = Query(default=None),
):
    """Returns all interview results from Supabase, newest first."""
    try:
        return get_results(
            trade=trade, fitment=fitment, category=category,
            language=language, district=district,
            min_score=min_score, max_score=max_score,
            integrity_flag=integrity_flag,
            user_id=user_id,
            phone_number=phone,
        )
    except Exception as e:
        logger.error(f"[Server] get_results failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/candidate/{phone_number}")
async def get_by_phone(phone_number: str):
    """Most recent result for a candidate by phone number."""
    try:
        result = get_result_by_phone(phone_number)
        if not result:
            raise HTTPException(status_code=404, detail="No result found for this phone number.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/latest")
async def get_latest(
    after: str | None = Query(default=None, description="ISO timestamp — only return results saved after this time"),
    phone: str | None = Query(default=None, description="Filter by phone number"),
    email: str | None = Query(default=None, description="Filter by candidate email"),
):
    """
    Returns the single most recent interview result.
    Primary lookup used by the mobile app after an interview ends.
    Pass ?phone=<number>&after=<ISO> to get the result for a specific candidate's latest interview.
    """
    try:
        result = get_latest_result(after_timestamp=after, phone_number=phone, email=email)
        if not result:
            if after or phone or email:
                return JSONResponse(
                    status_code=202,
                    content={"status": "pending", "detail": "Result not ready yet."},
                )
            raise HTTPException(status_code=404, detail="No result found.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/by-name/{candidate_name}")
async def get_by_name(candidate_name: str, after: str | None = Query(default=None)):
    """
    Most recent result for a candidate by name.
    Optional ?after=ISO_TIMESTAMP to only return results newer than that time.
    """
    try:
        result = get_result_by_name(candidate_name, after_timestamp=after)
        if not result:
            raise HTTPException(status_code=404, detail="No result found for this candidate.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/results/candidate/by-email/{email}")
async def get_by_email(email: str, after: str | None = Query(default=None)):
    """
    Most recent result for a candidate by email.
    Primary lookup method — email is unique and always filled.
    """
    try:
        result = get_result_by_email(email, after_timestamp=after)
        if not result:
            raise HTTPException(status_code=404, detail="No result found for this email.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/results/{interview_id}/admin-status")
async def update_admin_status(interview_id: str, req: UpdateInterviewStatusRequest):
    """Updates interviewer/admin decision status for an interview."""
    try:
        return update_interview_admin_status(interview_id, req.admin_status)
    except Exception as e:
        logger.error(f"[Server] update_admin_status failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/blocked-candidates")
async def block_candidate_endpoint(req: BlockCandidateRequest):
    """Blocks a candidate for a company and marks the active interview for admin review."""
    try:
        return block_candidate(
            user_id=req.user_id,
            job_id=req.job_id,
            company_id=req.company_id,
            livekit_room=req.livekit_room,
            reason=req.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Server] block_candidate failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/blocked-candidates")
async def get_blocked_candidates_endpoint(
    company_id: str | None = Query(default=None),
    user_id: str | None = Query(default=None),
):
    """Returns blocked candidates from Supabase."""
    try:
        return get_blocked_candidates(company_id=company_id, user_id=user_id)
    except Exception as e:
        logger.error(f"[Server] get_blocked_candidates failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "healthy", "service": "AI SkillFit", "db": "supabase"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
