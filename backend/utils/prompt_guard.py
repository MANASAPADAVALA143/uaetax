"""Sanitize user text before sending to Claude API."""
from __future__ import annotations

import logging
import re

from fastapi import HTTPException

logger = logging.getLogger(__name__)

INJECTION_PATTERNS = [
    r"ignore previous",
    r"ignore all previous",
    r"system prompt",
    r"jailbreak",
    r"act as",
    r"forget instructions",
    r"new role",
    r"you are now",
    r"disregard",
    r"override instructions",
    r"pretend you",
    r"roleplay as",
]

MAX_INPUT_LENGTH = 5000


def sanitize_input(text: str, field_name: str = "input") -> str:
    """
    Sanitize user input before sending to Claude API.
    Raises HTTPException if injection attempt detected.
    """
    if not text:
        return text

    if len(text) > MAX_INPUT_LENGTH:
        text = text[:MAX_INPUT_LENGTH]
        logger.warning("Input truncated to %s chars in %s", MAX_INPUT_LENGTH, field_name)

    text = re.sub(r"<[^>]+>", "", text)

    text_lower = text.lower()
    for pattern in INJECTION_PATTERNS:
        if re.search(pattern, text_lower):
            logger.warning("Prompt injection attempt blocked in %s: %s", field_name, pattern)
            raise HTTPException(
                status_code=400,
                detail=(
                    "Input rejected: contains disallowed content. "
                    "Please enter a valid transaction description."
                ),
            )

    return text.strip()


def sanitize_transaction_description(description: str) -> str:
    return sanitize_input(description, "transaction_description")


def sanitize_company_name(name: str) -> str:
    return sanitize_input(name, "company_name")
