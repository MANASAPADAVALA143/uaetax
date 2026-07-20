"""Utility helpers for resilient audit logging."""
from __future__ import annotations

import sys
from typing import Optional

from sqlalchemy.orm import Session

from models import AuditLog


def log_ai_audit(
    db: Session,
    *,
    company_id: Optional[int] = None,
    user_email: str = "system",
    action_type: str = "ai_call",
    feature: str,
    input_summary: str = "",
    output_summary: str = "",
    status: str = "success",
) -> Optional[AuditLog]:
    """Fire-and-forget audit log for Claude AI calls."""
    try:
        return log_audit_event(
            db=db,
            company_id=company_id,
            actor=user_email,
            entity_type=feature,
            action=action_type,
            before_state={
                "input_summary": (input_summary or "")[:500],
                "status": status,
            },
            after_state={
                "output_summary": (output_summary or "")[:500],
                "status": status,
            },
        )
    except Exception as exc:  # pragma: no cover
        print(f"AI audit logging failed: {exc}", file=sys.stderr)
        return None


def log_audit_event(
    db: Session,
    entity_type: str,
    action: str,
    entity_id: int = None,
    company_id: int = None,
    actor: str = "system",
    before_state: dict = None,
    after_state: dict = None,
) -> Optional[AuditLog]:
    """Persist an audit event without blocking primary request flow."""
    try:
        event = AuditLog(
            company_id=company_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor=actor,
            before_state=before_state,
            after_state=after_state,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception as exc:  # pragma: no cover - defensive path
        print(f"Audit logging failed: {exc}", file=sys.stderr)
        try:
            db.rollback()
        except Exception:
            pass
        return None
