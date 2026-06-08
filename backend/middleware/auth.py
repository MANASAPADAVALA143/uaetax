"""FastAPI auth middleware for Supabase JWT + company tenancy checks.

Every user-facing route should depend on either:
  - get_current_user  — just verify the token
  - get_current_company_id  — verify token AND company ownership

n8n webhook routes (HMAC-signed) must NOT use these deps.
"""
import os
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import UserCompany, Company

# ── Role hierarchy ──────────────────────────────────────────────
ROLE_ORDER = {"member": 0, "admin": 1, "owner": 2}


# ── JWT verification ────────────────────────────────────────────
def _verify_jwt(token: str) -> dict:
    """
    Verify a Supabase-issued JWT via the Supabase Auth REST API.

    Supabase has migrated from legacy HS256 secrets to new ECDSA signing keys,
    so local JWT verification is unreliable. We always verify via the Supabase
    API which works regardless of signing algorithm.
    """
    # Support both SUPABASE_URL and NEXT_PUBLIC_SUPABASE_URL env var names
    supabase_url = (
        os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or ""
    ).strip().rstrip("/")
    # Anon JWT works for /auth/v1/user; sb_secret_* keys need the legacy service_role JWT
    service_key = (
        os.getenv("SUPABASE_ANON_KEY")
        or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()

    if not supabase_url:
        raise HTTPException(
            status_code=500,
            detail="Auth not configured — set SUPABASE_URL in backend environment variables",
        )

    try:
        import httpx
        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": service_key,
            },
            timeout=5,
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        data = resp.json()
        return {"user_id": data.get("id", ""), "email": data.get("email", "")}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Auth service unreachable: {exc}") from exc


# ── FastAPI dependencies ─────────────────────────────────────────

async def get_current_user(
    authorization: Optional[str] = Header(default=None),
) -> dict:
    """Dependency: extract and verify Bearer token. Returns {user_id, email}."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Empty bearer token")
    return _verify_jwt(token)


_LOCAL_DEV = os.getenv("LOCAL_DEV", "").lower() in ("1", "true", "yes")


async def get_current_company_id(
    x_company_id: Optional[str] = Header(default=None, alias="X-Company-ID"),
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> int:
    """
    Dependency: verify token, then confirm user belongs to the requested company.
    Returns company_id as int.

    LOCAL_DEV=true  → skips JWT; trusts X-Company-ID directly (first company
    in DB used as fallback). Safe because this mode is never set in production.
    """
    # ── Local dev bypass ─────────────────────────────────────────
    if _LOCAL_DEV:
        if x_company_id:
            try:
                return int(x_company_id)
            except ValueError:
                pass
        # Fallback: use the first company in the database
        first = db.query(Company).order_by(Company.id).first()
        if first:
            return first.id
        raise HTTPException(status_code=400, detail="No company found — run setup-company first")

    # ── Production: full JWT + membership check ───────────────────
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    user = _verify_jwt(token)

    if not x_company_id:
        raise HTTPException(status_code=400, detail="Missing X-Company-ID header")
    try:
        cid = int(x_company_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="X-Company-ID must be an integer")

    membership = (
        db.query(UserCompany)
        .filter(UserCompany.user_id == user["user_id"], UserCompany.company_id == cid)
        .first()
    )
    if not membership:
        raise HTTPException(status_code=403, detail="Access denied: not a member of this company")
    return cid


def require_role(minimum_role: str):
    """
    Dependency factory: require at least `minimum_role` in the active company.
    Usage: some_val = Depends(require_role("admin"))
    """
    min_level = ROLE_ORDER.get(minimum_role, 0)

    async def _check(
        x_company_id: Optional[str] = Header(default=None, alias="X-Company-ID"),
        user: dict = Depends(get_current_user),
        db: Session = Depends(get_db),
    ) -> dict:
        if not x_company_id:
            raise HTTPException(status_code=400, detail="Missing X-Company-ID header")
        try:
            cid = int(x_company_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Company-ID")
        membership = (
            db.query(UserCompany)
            .filter(UserCompany.user_id == user["user_id"], UserCompany.company_id == cid)
            .first()
        )
        if not membership:
            raise HTTPException(status_code=403, detail="Access denied")
        if ROLE_ORDER.get(membership.role, 0) < min_level:
            raise HTTPException(
                status_code=403,
                detail=f"Requires '{minimum_role}' role (you are '{membership.role}')",
            )
        return {"user": user, "company_id": cid, "role": membership.role}

    return Depends(_check)
