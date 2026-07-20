"""Validate AI VAT outputs and VAT return box arithmetic."""
from __future__ import annotations

import logging
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

UAE_VAT_RATE = 0.05
TOLERANCE = 0.02


class ValidationError(Exception):
    """Raised when AI output fails validation."""


def validate_vat_amount(
    amount_aed: float,
    vat_amount: float,
    treatment: str,
    tolerance: float = TOLERANCE,
) -> dict:
    """Validate that AI-assigned VAT amount matches UAE rules."""
    treatment_lower = (treatment or "").lower()

    if "standard" in treatment_lower:
        expected_vat = round(amount_aed * UAE_VAT_RATE, 2)
        if abs(vat_amount - expected_vat) > tolerance:
            return {
                "valid": False,
                "expected": expected_vat,
                "actual": vat_amount,
                "reason": (
                    f"Standard rated VAT should be {expected_vat} "
                    f"(5% of {amount_aed}), got {vat_amount}"
                ),
            }

    elif any(t in treatment_lower for t in ["zero", "exempt", "out_of_scope", "out of scope"]):
        if abs(vat_amount) > tolerance:
            return {
                "valid": False,
                "expected": 0,
                "actual": vat_amount,
                "reason": f"{treatment} supply should have 0 VAT, got {vat_amount}",
            }

    elif "reverse" in treatment_lower:
        expected_vat = round(amount_aed * UAE_VAT_RATE, 2)
        if abs(vat_amount - expected_vat) > tolerance:
            return {
                "valid": False,
                "expected": expected_vat,
                "actual": vat_amount,
                "reason": f"Reverse charge VAT should be {expected_vat}, got {vat_amount}",
            }

    elif "entertainment" in treatment_lower:
        expected_vat = round(amount_aed * UAE_VAT_RATE, 2)
        if abs(vat_amount - expected_vat) > tolerance:
            return {
                "valid": False,
                "expected": expected_vat,
                "actual": vat_amount,
                "reason": (
                    f"Entertainment VAT gross should be {expected_vat} "
                    f"(50% recoverable per Art.54)"
                ),
            }

    return {"valid": True}


def validate_trn_format(trn: str) -> bool:
    """UAE TRN must be 15 digits."""
    if not trn:
        return False
    digits_only = "".join(filter(str.isdigit, trn))
    return len(digits_only) == 15


def validate_vat_return_boxes(boxes: Dict[str, Any]) -> List[str]:
    """
    Validate VAT return box calculations before saving.
    Returns list of warnings (empty = all good).
    """
    errors: List[str] = []

    box2 = float(boxes.get("box2_vat_on_supplies", 0) or 0)
    box6 = float(boxes.get("box6_taxable_expenses", 0) or 0)
    box7 = float(boxes.get("box7_vat_on_expenses", 0) or 0)
    box8 = float(boxes.get("box8_vat_payable_or_refundable", 0) or 0)

    # Box 7 should be ~5% of Box 6 (import VAT edge cases use 1 AED tolerance)
    if box6 > 0:
        expected_box7 = round(box6 * UAE_VAT_RATE, 2)
        if abs(box7 - expected_box7) > 1.0:
            errors.append(
                f"Box 7 ({box7}) should be ~5% of Box 6 ({box6}) = {expected_box7}"
            )

    expected_box8 = round(box2 - box7, 2)
    if abs(box8 - expected_box8) > 1.0:
        errors.append(
            f"Box 8 ({box8}) should equal Box 2 - Box 7 = {expected_box8}"
        )

    return errors
