"""Generate realistic UAE business test data for GulfTax AI"""
import csv
import random
from datetime import date, timedelta
from typing import List, Dict

# UAE business names
UAE_VENDORS = [
    "Al Futtaim LLC",
    "Emirates Trading Company",
    "Dubai Properties Group",
    "Emaar Properties",
    "Nakheel Properties",
    "Dubai Islamic Bank",
    "Emirates NBD",
    "ADNOC Distribution",
    "ENOC",
    "Carrefour UAE",
    "Lulu Hypermarket",
    "Sharaf DG",
    "Jumbo Electronics",
    "Virgin Megastore",
    "Dubai Duty Free",
]

UAE_CUSTOMERS = [
    "Saudi Trader Co.",
    "Kuwait Trading Group",
    "Qatar Business Solutions",
    "Oman Commercial LLC",
    "Bahrain Trading House",
    "Al Rajhi Bank",
    "SABIC",
    "Aramco Trading",
]

INTERNATIONAL_VENDORS = [
    "Microsoft Ireland Operations Ltd",
    "Amazon Web Services (Ireland)",
    "Google Cloud EMEA",
    "Oracle Corporation",
    "Salesforce.com EMEA",
    "Adobe Systems Ireland",
    "Zoom Video Communications",
    "Slack Technologies",
]

# Transaction templates
STANDARD_RATED_SALES = [
    ("Office furniture supply", "Al Futtaim LLC"),
    ("Consulting services - Tax advisory", "Deloitte UAE"),
    ("Trading goods - Electronics", "Sharaf DG"),
    ("Marketing services", "Publicis Groupe UAE"),
    ("Legal services", "Al Tamimi & Company"),
    ("IT support services", "Emirates Computers"),
    ("Office supplies", "Office Depot UAE"),
    ("Equipment rental", "Al Tayer Rentals"),
    ("Professional services", "PwC Middle East"),
    ("Software license - Local", "Emirates Software Solutions"),
    ("Trading goods - Textiles", "Dubai Textile Trading"),
    ("Warehouse services", "DP World Logistics"),
    ("Cleaning services", "Emirates Cleaning Services"),
    ("Security services", "G4S UAE"),
    ("Catering services", "Emirates Flight Catering"),
]

ZERO_RATED_SALES = [
    ("Export to Saudi Arabia - Electronics", "Saudi Trader Co."),
    ("Export to Kuwait - Textiles", "Kuwait Trading Group"),
    ("Export to Qatar - Machinery", "Qatar Business Solutions"),
    ("International freight - Sea", "DP World Shipping"),
    ("International freight - Air", "Emirates SkyCargo"),
    ("Export to Oman - Consumer goods", "Oman Commercial LLC"),
    ("Export to Bahrain - Electronics", "Bahrain Trading House"),
    ("International transport services", "DHL Express UAE"),
]

EXEMPT_SALES = [
    ("Bare land rental - Dubai", "Dubai Properties Group"),
    ("Bare land rental - Abu Dhabi", "Aldar Properties"),
    ("Local passenger transport", "Dubai Taxi Corporation"),
    ("Local passenger transport", "Careem UAE"),
    ("Financial services - Margin based", "Dubai Islamic Bank"),
]

STANDARD_RATED_PURCHASES = [
    ("Office rent - Dubai Marina", "Emaar Properties"),
    ("Office rent - Business Bay", "Dubai Properties Group"),
    ("Electricity bill", "DEWA"),
    ("Water bill", "DEWA"),
    ("Internet services", "Etisalat"),
    ("Telephone services", "du Telecom"),
    ("Supplier invoice - Raw materials", "Al Futtaim LLC"),
    ("Supplier invoice - Trading goods", "Emirates Trading Company"),
    ("Marketing agency services", "Publicis Groupe UAE"),
    ("Accounting services", "Deloitte UAE"),
]

REVERSE_CHARGE = [
    ("Microsoft Azure subscription", "Microsoft Ireland Operations Ltd"),
    ("AWS cloud services", "Amazon Web Services (Ireland)"),
    ("Google Workspace subscription", "Google Cloud EMEA"),
    ("Oracle database license", "Oracle Corporation"),
    ("Salesforce CRM subscription", "Salesforce.com EMEA"),
    ("Adobe Creative Cloud", "Adobe Systems Ireland"),
    ("Zoom Business subscription", "Zoom Video Communications"),
    ("Slack Enterprise subscription", "Slack Technologies"),
]

OUT_OF_SCOPE = [
    ("Salary payment - January 2025", "Payroll Batch"),
    ("Salary payment - February 2025", "Payroll Batch"),
    ("Salary payment - March 2025", "Payroll Batch"),
    ("Dividend payment to shareholders", "Shareholder Distribution"),
    ("Intercompany loan repayment", "Parent Company LLC"),
    ("Intercompany loan interest", "Parent Company LLC"),
    ("Bank interest received", "Emirates NBD"),
]


def generate_date_in_period(start: date, end: date) -> date:
    """Generate random date within period"""
    days_between = (end - start).days
    random_days = random.randint(0, days_between)
    return start + timedelta(days=random_days)


def generate_transaction(
    description: str,
    vendor: str,
    transaction_type: str,
    vat_treatment: str,
    period_start: date,
    period_end: date,
    amount_range: tuple = (500, 250000)
) -> Dict:
    """Generate a single transaction"""
    amount = random.randint(amount_range[0], amount_range[1])
    
    # Round to 2 decimal places
    amount = round(amount + random.random(), 2)
    
    # Calculate VAT amount
    if vat_treatment == "standard_rated":
        vat_amount = round(amount * 0.05, 2)
    elif vat_treatment == "zero_rated":
        vat_amount = 0.0
    elif vat_treatment == "exempt":
        vat_amount = 0.0
    elif vat_treatment == "reverse_charge":
        vat_amount = round(amount * 0.05, 2)
    else:  # out_of_scope
        vat_amount = 0.0
    
    trans_date = generate_date_in_period(period_start, period_end)
    invoice_number = f"INV-{trans_date.strftime('%Y%m%d')}-{random.randint(1000, 9999)}"
    
    return {
        "date": trans_date.strftime("%Y-%m-%d"),
        "description": description,
        "vendor_or_customer": vendor,
        "invoice_number": invoice_number,
        "amount_aed": amount,
        "vat_treatment": vat_treatment,
        "vat_amount_aed": vat_amount,
        "transaction_type": transaction_type,
    }


def generate_mainland_transactions() -> List[Dict]:
    """Generate transactions for mainland company"""
    period_start = date(2025, 1, 1)
    period_end = date(2025, 3, 31)
    transactions = []
    
    # 15 standard-rated sales
    for i in range(15):
        desc, vendor = random.choice(STANDARD_RATED_SALES)
        trans = generate_transaction(
            desc, vendor, "sale", "standard_rated", period_start, period_end
        )
        transactions.append(trans)
    
    # 8 zero-rated sales
    for i in range(8):
        desc, vendor = random.choice(ZERO_RATED_SALES)
        trans = generate_transaction(
            desc, vendor, "sale", "zero_rated", period_start, period_end
        )
        transactions.append(trans)
    
    # 5 exempt sales
    for i in range(5):
        desc, vendor = random.choice(EXEMPT_SALES)
        trans = generate_transaction(
            desc, vendor, "sale", "exempt", period_start, period_end
        )
        transactions.append(trans)
    
    # 10 standard-rated purchases
    for i in range(10):
        desc, vendor = random.choice(STANDARD_RATED_PURCHASES)
        trans = generate_transaction(
            desc, vendor, "purchase", "standard_rated", period_start, period_end
        )
        transactions.append(trans)
    
    # 5 reverse charge
    for i in range(5):
        desc, vendor = random.choice(REVERSE_CHARGE)
        trans = generate_transaction(
            desc, vendor, "purchase", "reverse_charge", period_start, period_end,
            amount_range=(2000, 50000)  # Smaller amounts for subscriptions
        )
        transactions.append(trans)
    
    # 7 out of scope
    for i in range(7):
        desc, vendor = random.choice(OUT_OF_SCOPE)
        trans = generate_transaction(
            desc, vendor, "sale", "out_of_scope", period_start, period_end,
            amount_range=(10000, 200000)  # Larger amounts for salaries/dividends
        )
        transactions.append(trans)
    
    return transactions


def generate_freezone_transactions() -> List[Dict]:
    """Generate transactions for free zone company"""
    period_start = date(2025, 1, 1)
    period_end = date(2025, 3, 31)
    transactions = []
    
    # Free zone specific transaction types
    freezone_templates = [
        # Mainland to free zone (zero-rated export from mainland perspective)
        ("Supply from mainland - Office equipment", "Al Futtaim LLC", "purchase", "zero_rated"),
        ("Supply from mainland - Trading goods", "Emirates Trading Company", "purchase", "zero_rated"),
        ("Supply from mainland - Raw materials", "Dubai Trading House", "purchase", "zero_rated"),
        
        # Free zone to free zone (same designated zone - out of scope)
        ("Supply to DMCC company - Same zone", "DMCC Trading LLC", "sale", "out_of_scope"),
        ("Supply to DMCC company - Same zone", "DMCC Services FZE", "sale", "out_of_scope"),
        ("Supply from DMCC company - Same zone", "DMCC Logistics FZE", "purchase", "out_of_scope"),
        
        # Free zone to free zone (different zones - check designation)
        ("Supply to JAFZA company", "JAFZA Trading LLC", "sale", "standard_rated"),
        ("Supply from DIFC company", "DIFC Financial Services", "purchase", "standard_rated"),
        
        # Free zone to mainland (standard-rated)
        ("Supply to mainland - Trading goods", "Al Futtaim LLC", "sale", "standard_rated"),
        ("Supply to mainland - Services", "Emirates Trading Company", "sale", "standard_rated"),
        
        # Exports (zero-rated)
        ("Export to Saudi Arabia", "Saudi Trader Co.", "sale", "zero_rated"),
        ("Export to Kuwait", "Kuwait Trading Group", "sale", "zero_rated"),
        ("Export to Qatar", "Qatar Business Solutions", "sale", "zero_rated"),
        
        # Standard rated sales within free zone (to non-designated)
        ("Service to mainland company", "Dubai Properties Group", "sale", "standard_rated"),
        ("Trading goods to mainland", "Emaar Properties", "sale", "standard_rated"),
        
        # Standard rated purchases
        ("Office rent - DMCC", "DMCC Properties", "purchase", "standard_rated"),
        ("Utilities - DEWA", "DEWA", "purchase", "standard_rated"),
        ("Internet services", "Etisalat", "purchase", "standard_rated"),
        
        # Reverse charge (international)
        ("AWS cloud services", "Amazon Web Services (Ireland)", "purchase", "reverse_charge"),
        ("Microsoft Azure", "Microsoft Ireland Operations Ltd", "purchase", "reverse_charge"),
        
        # Out of scope
        ("Salary payment", "Payroll Batch", "sale", "out_of_scope"),
        ("Dividend payment", "Shareholder Distribution", "sale", "out_of_scope"),
    ]
    
    # Generate 30 transactions
    for i in range(30):
        template = random.choice(freezone_templates)
        desc, vendor, trans_type, vat_treatment = template
        
        # Vary amounts
        if "rent" in desc.lower() or "utilities" in desc.lower():
            amount_range = (5000, 50000)
        elif "salary" in desc.lower() or "dividend" in desc.lower():
            amount_range = (20000, 150000)
        elif "subscription" in desc.lower() or "cloud" in desc.lower():
            amount_range = (1000, 30000)
        else:
            amount_range = (1000, 200000)
        
        trans = generate_transaction(
            desc, vendor, trans_type, vat_treatment, period_start, period_end, amount_range
        )
        transactions.append(trans)
    
    return transactions


def save_to_csv(transactions: List[Dict], filename: str):
    """Save transactions to CSV file"""
    if not transactions:
        return
    
    fieldnames = [
        "date",
        "description",
        "vendor_or_customer",
        "invoice_number",
        "amount_aed",
        "vat_treatment",
        "vat_amount_aed",
        "transaction_type",
    ]
    
    with open(filename, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(transactions)
    
    print(f"[OK] Saved {len(transactions)} transactions to {filename}")


def calculate_summary(transactions: List[Dict], company_name: str):
    """Calculate and print summary statistics"""
    print(f"\n{'='*60}")
    print(f"Summary for {company_name}")
    print(f"{'='*60}")
    
    total_transactions = len(transactions)
    print(f"Total Transactions: {total_transactions}")
    
    # Separate sales and purchases
    sales = [t for t in transactions if t["transaction_type"] == "sale"]
    purchases = [t for t in transactions if t["transaction_type"] == "purchase"]
    
    # Calculate by VAT treatment
    breakdown = {
        "standard_rated_sales": [],
        "zero_rated_sales": [],
        "exempt_sales": [],
        "standard_rated_purchases": [],
        "reverse_charge": [],
        "out_of_scope": [],
    }
    
    for t in transactions:
        if t["transaction_type"] == "sale":
            if t["vat_treatment"] == "standard_rated":
                breakdown["standard_rated_sales"].append(t)
            elif t["vat_treatment"] == "zero_rated":
                breakdown["zero_rated_sales"].append(t)
            elif t["vat_treatment"] == "exempt":
                breakdown["exempt_sales"].append(t)
            elif t["vat_treatment"] == "out_of_scope":
                breakdown["out_of_scope"].append(t)
        elif t["transaction_type"] == "purchase":
            if t["vat_treatment"] == "standard_rated":
                breakdown["standard_rated_purchases"].append(t)
            elif t["vat_treatment"] == "reverse_charge":
                breakdown["reverse_charge"].append(t)
    
    # Calculate FTA boxes
    box1 = sum(t["amount_aed"] for t in breakdown["standard_rated_sales"])
    box2 = box1 * 0.05  # Output VAT
    box3 = sum(t["amount_aed"] for t in breakdown["zero_rated_sales"])
    box4 = sum(t["amount_aed"] for t in breakdown["exempt_sales"])
    box5 = box1 + box3 + box4
    box6 = sum(t["amount_aed"] for t in breakdown["standard_rated_purchases"])
    box7 = box6 * 0.05  # Input VAT
    box8 = box2 - box7  # Net VAT
    
    print(f"\nVAT Breakdown:")
    print(f"  Standard Rated Sales: {len(breakdown['standard_rated_sales'])} transactions, AED {box1:,.2f}")
    print(f"  Zero Rated Sales: {len(breakdown['zero_rated_sales'])} transactions, AED {box3:,.2f}")
    print(f"  Exempt Sales: {len(breakdown['exempt_sales'])} transactions, AED {box4:,.2f}")
    print(f"  Standard Rated Purchases: {len(breakdown['standard_rated_purchases'])} transactions, AED {box6:,.2f}")
    print(f"  Reverse Charge: {len(breakdown['reverse_charge'])} transactions")
    print(f"  Out of Scope: {len(breakdown['out_of_scope'])} transactions")
    
    print(f"\nFTA VAT Return Boxes (Q1 2025):")
    print(f"  Box 1 (Standard Rated Supplies): AED {box1:,.2f}")
    print(f"  Box 2 (Output VAT 5%): AED {box2:,.2f}")
    print(f"  Box 3 (Zero Rated Supplies): AED {box3:,.2f}")
    print(f"  Box 4 (Exempt Supplies): AED {box4:,.2f}")
    print(f"  Box 5 (Total Taxable Supplies): AED {box5:,.2f}")
    print(f"  Box 6 (Taxable Expenses): AED {box6:,.2f}")
    print(f"  Box 7 (Input VAT 5%): AED {box7:,.2f}")
    print(f"  Box 8 (VAT Payable/Refundable): AED {box8:,.2f}")
    
    if box8 > 0:
        print(f"\n  -> VAT Payable to FTA: AED {box8:,.2f}")
    else:
        print(f"\n  -> VAT Refundable from FTA: AED {abs(box8):,.2f}")


def main():
    """Main function to generate test data"""
    print("Generating UAE Business Test Data for GulfTax AI")
    print("=" * 60)
    
    # Set random seed for reproducibility
    random.seed(42)
    
    # Generate mainland company transactions
    print("\n1. Generating transactions for Al Baraka Trading LLC (Mainland)...")
    mainland_transactions = generate_mainland_transactions()
    save_to_csv(mainland_transactions, "backend/scripts/test_transactions.csv")
    calculate_summary(mainland_transactions, "Al Baraka Trading LLC")
    
    # Generate free zone company transactions
    print("\n\n2. Generating transactions for Dubai Digital FZE (Free Zone)...")
    freezone_transactions = generate_freezone_transactions()
    save_to_csv(freezone_transactions, "backend/scripts/test_transactions_freezone.csv")
    calculate_summary(freezone_transactions, "Dubai Digital FZE")
    
    print("\n" + "=" * 60)
    print("Test data generation complete!")
    print("=" * 60)
    print("\nFiles created:")
    print("  - backend/scripts/test_transactions.csv")
    print("  - backend/scripts/test_transactions_freezone.csv")
    print("\nYou can now upload these files to the VAT Classifier for testing.")


if __name__ == "__main__":
    main()
