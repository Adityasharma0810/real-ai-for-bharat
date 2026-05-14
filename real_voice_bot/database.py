"""
database.py — Supabase-only persistence for AI SkillFit.
SQLite is completely abandoned. All data goes to and comes from Supabase.
"""

import os
import json
import logging
import re
from datetime import datetime, timezone

logger = logging.getLogger("skillfit.database")


# ── Supabase client ──────────────────────────────────────────────────────────
def get_supabase():
    """Returns a Supabase service-role client. Raises if not configured."""
    from supabase import create_client
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")
    return create_client(url, key)


def _insert_interview_with_schema_fallback(client, payload: dict):
    """Insert an interview row while tolerating optional columns in evolving schemas."""
    removable_columns = {
        "scores",
        "score",
        "classification",
        "status",
        "started_at",
        "completed_at",
        "updated_at",
        "job_id",
        "admin_status",
        "livekit_room",
    }
    working_payload = dict(payload)

    while True:
        try:
            return client.table("interviews").insert(working_payload).execute()
        except Exception as exc:
            message = str(exc)
            match = re.search(r"Could not find the '([^']+)' column", message)
            if not match:
                match = re.search(r"column interviews\.([a-zA-Z0-9_]+) does not exist", message)

            missing_column = match.group(1) if match else None
            if missing_column and missing_column in removable_columns and missing_column in working_payload:
                logger.warning("[DB] Removing missing optional interviews.%s column and retrying insert.", missing_column)
                working_payload.pop(missing_column, None)
                continue

            raise


def _normalise_interview_row(row: dict) -> dict:
    row = dict(row)
    row["interview_date"] = row.pop("created_at", None)
    if row.get("average_score") is None and row.get("score") is not None:
        row["average_score"] = row.get("score")
    if row.get("fitment") is None and row.get("classification") is not None:
        row["fitment"] = row.get("classification")
    row.setdefault("scores", [])
    row.setdefault("weak_topics", [])
    row.setdefault("feedback", {})
    row.setdefault("transcript", [])
    return row


def _resolve_company_id(client, *, company_id: str | None = None, job_id: str | None = None) -> str | None:
    if company_id:
        return company_id
    if not job_id:
        return None

    resp = client.table("jobs").select("company_id").eq("id", job_id).limit(1).execute()
    if resp.data:
        return resp.data[0].get("company_id")
    return None


def create_started_interview(
    *,
    user_id: str | None,
    candidate_name: str,
    phone_number: str,
    trade: str,
    email: str | None = None,
    job_id: str | None = None,
    livekit_room: str | None = None,
) -> str:
    """Create the interview row when the room starts so it is linked before scoring."""
    client = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    resolved_user_id = user_id
    resolved_district = None

    if not resolved_user_id and email:
        try:
            resp = client.table("profiles").select("id, district").eq("email", email).limit(1).execute()
            if resp.data:
                resolved_user_id = resp.data[0]["id"]
                resolved_district = resp.data[0].get("district")
        except Exception as e:
            logger.warning(f"[DB] Start row profile lookup by email failed (non-fatal): {e}")

    if not resolved_user_id and phone_number:
        try:
            resp = client.table("profiles").select("id, district").eq("phone", phone_number).limit(1).execute()
            if resp.data:
                resolved_user_id = resp.data[0]["id"]
                resolved_district = resp.data[0].get("district")
        except Exception as e:
            logger.warning(f"[DB] Start row profile lookup by phone failed (non-fatal): {e}")

    payload = {
        "candidate_name": candidate_name,
        "phone_number": phone_number,
        "trade": trade,
        "status": "started",
        "started_at": now,
        "updated_at": now,
    }
    if resolved_user_id:
        payload["user_id"] = resolved_user_id
    if resolved_district:
        payload["district"] = resolved_district
    if job_id:
        payload["job_id"] = job_id
    if livekit_room:
        payload["livekit_room"] = livekit_room

    if livekit_room:
        resp = client.table("interviews").update(payload).eq("livekit_room", livekit_room).execute()
        if resp.data:
            return resp.data[0]["id"]

    resp = _insert_interview_with_schema_fallback(client, payload)
    if not resp.data:
        raise RuntimeError("Supabase started interview insert returned no data")
    return resp.data[0]["id"]


# ── Category detection ───────────────────────────────────────────────────────
_CATEGORY_MAP: dict[str, str] | None = None


def _build_category_map() -> dict[str, str]:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    mapping = {
        "Blue-collar-Trades.json": "Blue-collar Trades",
        "Polytechnic-Skilled-Roles.json": "Polytechnic-Skilled Roles",
        "Semi-Skilled-Workforce.json": "Semi-Skilled Workforce",
    }
    result: dict[str, str] = {}
    for filename, category in mapping.items():
        path = os.path.join(base_dir, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            for trade_key in data:
                result[trade_key.lower().strip()] = category
        except FileNotFoundError:
            logger.warning(f"[DB] Question bank not found: {filename}")
    return result


def get_category_for_trade(trade: str) -> str:
    global _CATEGORY_MAP
    if _CATEGORY_MAP is None:
        _CATEGORY_MAP = _build_category_map()

    normalised = trade.lower().strip()

    # Direct match first
    if normalised in _CATEGORY_MAP:
        return _CATEGORY_MAP[normalised]

    # Alias fallback for common shorthand values from old onboarding
    _ALIASES: dict[str, str] = {
        "mechanical engineer": "Polytechnic-Skilled Roles",
        "civil engineer": "Polytechnic-Skilled Roles",
        "electrical engineer": "Polytechnic-Skilled Roles",
        "electronics engineer": "Polytechnic-Skilled Roles",
        "computer science engineer": "Polytechnic-Skilled Roles",
        "automobile engineer": "Polytechnic-Skilled Roles",
        "mechatronics engineer": "Polytechnic-Skilled Roles",
        "qc engineer": "Polytechnic-Skilled Roles",
        "mechanic": "Blue-collar Trades",
        "automobile technician": "Blue-collar Trades",
        "driver": "Blue-collar Trades",
        "construction": "Blue-collar Trades",
    }
    return _ALIASES.get(normalised, "Unknown")


# ── Scoring helpers ──────────────────────────────────────────────────────────
def calculate_confidence_score(scores: list, weak_topics: list) -> int:
    """Returns 0-100 confidence score as integer (Supabase column is INTEGER)."""
    if not scores:
        return 0

    avg = sum(scores) / len(scores)
    avg_pct = (avg / 10.0) * 100

    mean = avg
    variance = sum((s - mean) ** 2 for s in scores) / len(scores)
    consistency_pct = max(0.0, 100.0 - (variance / 25.0) * 100.0)

    total = len(scores)
    weak_count = len(weak_topics)
    coverage_pct = max(0.0, ((total - weak_count) / total) * 100.0) if total > 0 else 100.0

    confidence = (avg_pct * 0.60) + (consistency_pct * 0.25) + (coverage_pct * 0.15)
    return int(round(min(100.0, max(0.0, confidence))))


def check_integrity_flag(scores: list, average_score: float) -> bool:
    if not scores or len(scores) < 3:
        return False
    if len(set(scores)) == 1:
        return True
    if average_score >= 9.5:
        return True
    mean = sum(scores) / len(scores)
    std_dev = (sum((s - mean) ** 2 for s in scores) / len(scores)) ** 0.5
    if std_dev > 3.5:
        return True
    return False


# ── Save result ──────────────────────────────────────────────────────────────
def save_result(
    candidate_name: str,
    phone_number: str,
    trade: str,
    scores: list,
    weak_topics: list,
    fitment: str,
    average_score: float,
    language: str = "English",
    district: str | None = None,
    feedback: dict | None = None,
    transcript: list | None = None,
    email: str | None = None,
    job_id: str | None = None,
    user_id: str | None = None,
    livekit_room: str | None = None,
) -> str:
    """
    Saves interview result directly to Supabase.
    Returns the Supabase UUID of the inserted row.
    Uses email as the primary identifier for profile lookup (unique & always filled).
    Falls back to phone_number if email is not provided.
    """
    client = get_supabase()

    category = get_category_for_trade(trade)
    confidence_score = calculate_confidence_score(scores, weak_topics)
    integrity_flag = check_integrity_flag(scores, average_score)

    # Look up user profile — email first (unique & always filled), then phone fallback
    resolved_user_id = user_id
    resolved_district = district
    if not resolved_user_id and email:
        try:
            resp = client.table("profiles").select("id, district").eq("email", email).limit(1).execute()
            if resp.data:
                resolved_user_id = resp.data[0]["id"]
                if not resolved_district:
                    resolved_district = resp.data[0].get("district")
                logger.info(f"[DB] Profile found by email: {email} → user_id={resolved_user_id}")
        except Exception as e:
            logger.warning(f"[DB] Profile lookup by email failed (non-fatal): {e}")

    if not resolved_user_id and phone_number:
        try:
            resp = client.table("profiles").select("id, district").eq("phone", phone_number).limit(1).execute()
            if resp.data:
                resolved_user_id = resp.data[0]["id"]
                if not resolved_district:
                    resolved_district = resp.data[0].get("district")
                logger.info(f"[DB] Profile found by phone: {phone_number} → user_id={resolved_user_id}")
        except Exception as e:
            logger.warning(f"[DB] Profile lookup by phone failed (non-fatal): {e}")

    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "candidate_name": candidate_name,
        "phone_number": phone_number,
        "trade": trade,
        "status": "completed",
        "language": language,
        "district": resolved_district,
        "category": category,
        "scores": scores,
        "weak_topics": weak_topics,
        "fitment": fitment,
        "classification": fitment,
        "average_score": float(average_score),
        "confidence_score": confidence_score,
        "integrity_flag": integrity_flag,
        "feedback": feedback or {},
        "transcript": transcript or [],
        "completed_at": now,
        "updated_at": now,
    }

    if resolved_user_id:
        payload["user_id"] = resolved_user_id

    if job_id:
        payload["job_id"] = job_id
        logger.info(f"[DB] Linking interview to job_id={job_id}")

    if livekit_room:
        payload["livekit_room"] = livekit_room
        try:
            existing = (
                client.table("interviews")
                .select("admin_status")
                .eq("livekit_room", livekit_room)
                .limit(1)
                .execute()
            )
            if existing.data and existing.data[0].get("admin_status") == "blocked":
                payload["integrity_flag"] = True
        except Exception as e:
            logger.warning(f"[DB] Existing interview status lookup failed (non-fatal): {e}")

    try:
        if livekit_room:
            resp = client.table("interviews").update(payload).eq("livekit_room", livekit_room).execute()
            if not resp.data:
                resp = _insert_interview_with_schema_fallback(client, payload)
        else:
            resp = _insert_interview_with_schema_fallback(client, payload)
    except Exception as e:
        err_str = str(e)
        # If fitment constraint blocks "Requires Manual Verification",
        # fall back to "Requires Significant Upskilling" until SQL migration is run
        if "interviews_fitment_check" in err_str and fitment == "Requires Manual Verification":
            logger.warning("[DB] Fitment constraint blocks 'Requires Manual Verification' — run fix_rls_policies.sql in Supabase. Saving as 'Requires Significant Upskilling' temporarily.")
            payload["fitment"] = "Requires Significant Upskilling"
            payload["classification"] = payload["fitment"]
            resp = _insert_interview_with_schema_fallback(client, payload)
        else:
            raise

    if not resp.data:
        raise RuntimeError("Supabase insert returned no data")

    inserted_id = resp.data[0]["id"]
    logger.info(
        f"[DB] Saved to Supabase — ID={inserted_id}, "
        f"candidate={candidate_name}, email={email}, fitment={fitment}, "
        f"score={average_score}, confidence={confidence_score}%"
    )
    return inserted_id


# ── Fetch results ────────────────────────────────────────────────────────────
def get_results(
    trade: str | None = None,
    fitment: str | None = None,
    category: str | None = None,
    language: str | None = None,
    district: str | None = None,
    min_score: float | None = None,
    max_score: float | None = None,
    integrity_flag: bool | None = None,
    user_id: str | None = None,
    phone_number: str | None = None,
) -> list[dict]:
    """Fetches interview results from Supabase with optional filters. Newest first."""
    client = get_supabase()

    query = client.table("interviews").select("*").order("created_at", desc=True)

    if trade:
        query = query.ilike("trade", f"%{trade}%")
    if fitment:
        query = query.ilike("fitment", f"%{fitment}%")
    if category:
        query = query.ilike("category", f"%{category}%")
    if language:
        query = query.ilike("language", f"%{language}%")
    if district:
        query = query.ilike("district", f"%{district}%")
    if min_score is not None:
        query = query.gte("average_score", min_score)
    if max_score is not None:
        query = query.lte("average_score", max_score)
    if integrity_flag is not None:
        query = query.eq("integrity_flag", integrity_flag)
    if user_id:
        query = query.eq("user_id", user_id)
    if phone_number:
        query = query.eq("phone_number", phone_number)

    resp = query.execute()
    results = resp.data or []

    return [_normalise_interview_row(r) for r in results]


def get_result_by_phone(phone_number: str) -> dict | None:
    """Fetches the most recent result for a candidate by phone number."""
    client = get_supabase()
    resp = (
        client.table("interviews")
        .select("*")
        .eq("phone_number", phone_number)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not resp.data:
        return None
    return _normalise_interview_row(resp.data[0])


def get_result_by_name(candidate_name: str, after_timestamp: str | None = None) -> dict | None:
    """
    Fetches the most recent result for a candidate by name.
    Optionally filters to results saved after a given ISO timestamp.
    """
    client = get_supabase()
    query = (
        client.table("interviews")
        .select("*")
        .ilike("candidate_name", candidate_name)
        .order("created_at", desc=True)
        .limit(1)
    )
    if after_timestamp:
        query = query.gte("created_at", after_timestamp)

    resp = query.execute()
    if not resp.data:
        return None
    return _normalise_interview_row(resp.data[0])


def get_result_by_email(email: str, after_timestamp: str | None = None) -> dict | None:
    """
    Fetches the most recent interview result for a candidate by email.
    Looks up the user_id from profiles table, then finds their latest interview.
    """
    client = get_supabase()

    # 1. Resolve email → user_id via profiles
    try:
        profile_resp = client.table("profiles").select("id").eq("email", email).limit(1).execute()
        if not profile_resp.data:
            return None
        user_id = profile_resp.data[0]["id"]
    except Exception as e:
        logger.warning(f"[DB] Profile lookup by email failed: {e}")
        return None

    # 2. Fetch latest interview for this user_id
    query = (
        client.table("interviews")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(1)
    )
    if after_timestamp:
        query = query.gte("created_at", after_timestamp)

    resp = query.execute()
    if not resp.data:
        return None
    return _normalise_interview_row(resp.data[0])


def get_latest_result(
    after_timestamp: str | None = None,
    phone_number: str | None = None,
    email: str | None = None,
) -> dict | None:
    """
    Fetches the single most recent interview result.
    - If phone_number is provided, filters by that phone number.
    - If after_timestamp is provided, only returns results saved after that time.
    This is the most reliable way to get the result right after an interview ends.
    """
    client = get_supabase()
    user_id = None

    if email:
        try:
            profile_resp = client.table("profiles").select("id").eq("email", email).limit(1).execute()
            if profile_resp.data:
                user_id = profile_resp.data[0]["id"]
        except Exception as e:
            logger.warning(f"[DB] Latest result profile lookup by email failed: {e}")

    def build_query(include_after: bool):
        query = (
            client.table("interviews")
            .select("*")
            .eq("status", "completed")
            .gte("average_score", 0)
            .order("created_at", desc=True)
            .limit(1)
        )
        if user_id:
            query = query.eq("user_id", user_id)
        elif phone_number:
            query = query.eq("phone_number", phone_number)
        if include_after and after_timestamp:
            query = query.gte("created_at", after_timestamp)
        return query

    resp = build_query(include_after=True).execute()
    if not resp.data:
        return None
    return _normalise_interview_row(resp.data[0])


def update_interview_admin_status(interview_id: str, admin_status: str | None) -> dict:
    client = get_supabase()
    resp = (
        client.table("interviews")
        .update({"admin_status": admin_status, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", interview_id)
        .execute()
    )
    if not resp.data:
        raise RuntimeError("No interview row updated")
    return _normalise_interview_row(resp.data[0])


def get_blocked_candidates(company_id: str | None = None, user_id: str | None = None) -> list[dict]:
    client = get_supabase()
    query = client.table("blocked_candidates").select("*").order("created_at", desc=True)
    if company_id:
        query = query.eq("company_id", company_id)
    if user_id:
        query = query.eq("user_id", user_id)
    resp = query.execute()
    return resp.data or []


def block_candidate(
    *,
    user_id: str,
    reason: str,
    job_id: str | None = None,
    company_id: str | None = None,
    livekit_room: str | None = None,
) -> dict:
    """Add a candidate to blocked_candidates and mark their active interview as blocked."""
    if not user_id:
        raise ValueError("user_id is required to block a candidate")

    client = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    resolved_company_id = _resolve_company_id(client, company_id=company_id, job_id=job_id)
    if not resolved_company_id:
        raise ValueError("company_id or a job_id linked to a company is required")

    existing = (
        client.table("blocked_candidates")
        .select("*")
        .eq("company_id", resolved_company_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        blocked_row = existing.data[0]
    else:
        insert_resp = (
            client.table("blocked_candidates")
            .insert({
                "company_id": resolved_company_id,
                "user_id": user_id,
                "reason": reason,
                "created_at": now,
            })
            .execute()
        )
        if not insert_resp.data:
            raise RuntimeError("Supabase blocked_candidates insert returned no data")
        blocked_row = insert_resp.data[0]

    interview_payload = {
        "admin_status": "blocked",
        "integrity_flag": True,
        "completed_at": now,
        "updated_at": now,
    }

    interview_resp = None
    if livekit_room:
        interview_resp = (
            client.table("interviews")
            .update(interview_payload)
            .eq("livekit_room", livekit_room)
            .execute()
        )
    if (not interview_resp or not interview_resp.data) and job_id:
        latest = (
            client.table("interviews")
            .select("id")
            .eq("user_id", user_id)
            .eq("job_id", job_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if latest.data:
            interview_resp = (
                client.table("interviews")
                .update(interview_payload)
                .eq("id", latest.data[0]["id"])
                .execute()
            )
    if (not interview_resp or not interview_resp.data):
        latest = (
            client.table("interviews")
            .select("id")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if latest.data:
            interview_resp = (
                client.table("interviews")
                .update(interview_payload)
                .eq("id", latest.data[0]["id"])
                .execute()
            )

    return {
        "blocked": blocked_row,
        "interview": _normalise_interview_row(interview_resp.data[0]) if interview_resp and interview_resp.data else None,
    }
