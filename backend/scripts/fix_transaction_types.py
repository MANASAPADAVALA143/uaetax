"""One-time correction: fix transaction_type from invoice prefix."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import SessionLocal
from models import Transaction

SALE_PREFIXES = ("SI-", "IC-", "DS-", "BD-")
PURCHASE_PREFIXES = ("PI-", "AP-", "CT-")

db = SessionLocal()
transactions = db.query(Transaction).all()
updated = 0

for t in transactions:
    inv = (t.invoice_number or "").upper().strip()
    if any(inv.startswith(p) for p in SALE_PREFIXES):
        if t.transaction_type != "sale":
            t.transaction_type = "sale"
            updated += 1
    elif any(inv.startswith(p) for p in PURCHASE_PREFIXES):
        if t.transaction_type != "purchase":
            t.transaction_type = "purchase"
            updated += 1

db.commit()
db.close()
print(f"Updated {updated} transactions")
