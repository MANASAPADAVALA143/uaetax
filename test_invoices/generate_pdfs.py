"""Generate 6 realistic UAE VAT invoice PDFs for GulfTax AI demo."""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_CENTER, TA_LEFT
from reportlab.platypus import KeepTogether
import os

OUT = os.path.dirname(os.path.abspath(__file__))
W, H = A4

# ── Colour palette ─────────────────────────────────────────────────────────────
DARK   = colors.HexColor("#1a1a2e")
WHITE  = colors.white
GOLD   = colors.HexColor("#c9a84c")
GREEN  = colors.HexColor("#10b981")
AMBER  = colors.HexColor("#f59e0b")
RED    = colors.HexColor("#dc2626")
BLUE   = colors.HexColor("#0f4c81")
PURPLE = colors.HexColor("#4f1a6e")
SLATE  = colors.HexColor("#334155")
GRAY   = colors.HexColor("#6b7280")
LGRAY  = colors.HexColor("#f3f4f6")
ORANGE = colors.HexColor("#c2410c")


def styles():
    s = getSampleStyleSheet()
    base = dict(fontName="Helvetica", fontSize=9, leading=13, textColor=DARK)
    return {
        "h1":     ParagraphStyle("h1",   fontName="Helvetica-Bold", fontSize=18, textColor=WHITE, leading=22),
        "h2":     ParagraphStyle("h2",   fontName="Helvetica-Bold", fontSize=10, textColor=WHITE, leading=13),
        "sub":    ParagraphStyle("sub",  fontName="Helvetica",      fontSize=8,  textColor=colors.HexColor("#cccccc"), leading=11),
        "label":  ParagraphStyle("lbl",  fontName="Helvetica-Bold", fontSize=7,  textColor=GRAY, leading=10, spaceAfter=1),
        "val":    ParagraphStyle("val",  fontName="Helvetica-Bold", fontSize=9,  textColor=DARK, leading=12),
        "body":   ParagraphStyle("body", **base),
        "small":  ParagraphStyle("sm",   fontName="Helvetica", fontSize=7.5, textColor=GRAY, leading=11),
        "right":  ParagraphStyle("rt",   fontName="Helvetica", fontSize=9,  leading=12, alignment=TA_RIGHT),
        "bold":   ParagraphStyle("bd",   fontName="Helvetica-Bold", fontSize=9, leading=12, textColor=DARK),
        "tax":    ParagraphStyle("tax",  fontName="Helvetica-Bold", fontSize=11, textColor=WHITE, alignment=TA_CENTER, leading=14),
        "warn":   ParagraphStyle("warn", fontName="Helvetica-Bold", fontSize=7.5, textColor=colors.HexColor("#78350f"), leading=10),
        "flag":   ParagraphStyle("flag", fontName="Helvetica-Bold", fontSize=7.5, textColor=RED, leading=10),
        "status": ParagraphStyle("sts",  fontName="Helvetica-Bold", fontSize=8.5, textColor=DARK, leading=12),
    }


def header_table(supplier, inv_no, inv_date, hdr_color):
    """Top header band with supplier info + invoice meta."""
    S = styles()
    left = [
        Paragraph(supplier["name"], S["h1"]),
        Spacer(1, 2),
        Paragraph(supplier.get("legal", ""), S["h2"]),
        Spacer(1, 4),
        Paragraph(supplier.get("addr", ""), S["sub"]),
    ]
    if supplier.get("trn"):
        left.append(Spacer(1, 4))
        left.append(Paragraph(f"TRN: {supplier['trn']}", S["h2"]))
    if supplier.get("trn_flag"):
        left.append(Paragraph(supplier["trn_flag"], ParagraphStyle("tf", fontName="Helvetica-Bold", fontSize=8, textColor=colors.HexColor("#fca5a5"), leading=11)))

    right = [
        Paragraph("TAX INVOICE", S["tax"]),
        Spacer(1, 8),
        Paragraph("Invoice Number", S["sub"]),
        Paragraph(inv_no, S["h2"]),
        Spacer(1, 6),
        Paragraph("Invoice Date", S["sub"]),
        Paragraph(inv_date, S["h2"]),
    ]

    t = Table([[left, right]], colWidths=[110*mm, 65*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), hdr_color),
        ("VALIGN",     (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING",  (0, 0), (0, 0), 8*mm),
        ("RIGHTPADDING", (1, 0), (1, 0), 6*mm),
        ("TOPPADDING",   (0, 0), (-1, -1), 6*mm),
        ("BOTTOMPADDING",(0, 0), (-1, -1), 6*mm),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    return t


def parties_table(supplier_addr, bill_to, po, due, period, label_color):
    S = styles()
    def block(title, lines, color):
        items = [Paragraph(title, ParagraphStyle("pl", fontName="Helvetica-Bold", fontSize=7, textColor=color, leading=10, spaceAfter=3))]
        for l in lines:
            items.append(Paragraph(l, S["body"]))
        return items

    left  = block("SUPPLIER",  supplier_addr, label_color)
    right = block("BILL TO",   bill_to,       label_color)
    meta  = [
        Paragraph("PERIOD",    ParagraphStyle("ml", fontName="Helvetica-Bold", fontSize=7, textColor=label_color, leading=10, spaceAfter=2)),
        Paragraph(period,      S["bold"]),
        Spacer(1, 6),
        Paragraph("PO REF",    ParagraphStyle("ml", fontName="Helvetica-Bold", fontSize=7, textColor=label_color, leading=10, spaceAfter=2)),
        Paragraph(po,          S["bold"]),
        Spacer(1, 6),
        Paragraph("DUE DATE",  ParagraphStyle("ml", fontName="Helvetica-Bold", fontSize=7, textColor=label_color, leading=10, spaceAfter=2)),
        Paragraph(due,         S["bold"]),
    ]

    t = Table([[left, right, meta]], colWidths=[65*mm, 65*mm, 45*mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0),(-1,-1), "TOP"),
        ("LEFTPADDING",  (0,0),(0,0), 2),
        ("RIGHTPADDING", (2,0),(2,0), 2),
        ("TOPPADDING",   (0,0),(-1,-1), 0),
    ]))
    return t


def line_items_table(rows, hdr_color):
    """rows: list of (description, qty, unit_price, amount)"""
    S = styles()
    header = ["#", "Description", "Qty", "Unit Price (AED)", "Amount (AED)"]
    data   = [header]
    for i, (desc, qty, unit, amt) in enumerate(rows, 1):
        data.append([
            str(i),
            Paragraph(desc, S["body"]),
            str(qty),
            f"{unit:,.2f}",
            f"{amt:,.2f}",
        ])

    col_w = [8*mm, 88*mm, 14*mm, 30*mm, 30*mm]
    t = Table(data, colWidths=col_w, repeatRows=1)
    t.setStyle(TableStyle([
        # Header
        ("BACKGROUND",   (0,0), (-1,0), hdr_color),
        ("TEXTCOLOR",    (0,0), (-1,0), WHITE),
        ("FONTNAME",     (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTSIZE",     (0,0), (-1,0), 7.5),
        ("TOPPADDING",   (0,0), (-1,0), 5),
        ("BOTTOMPADDING",(0,0), (-1,0), 5),
        # Body
        ("FONTNAME",     (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE",     (0,1), (-1,-1), 8.5),
        ("TOPPADDING",   (0,1), (-1,-1), 5),
        ("BOTTOMPADDING",(0,1), (-1,-1), 5),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, colors.HexColor("#f9fafb")]),
        ("LINEBELOW",    (0,0), (-1,-1), 0.3, colors.HexColor("#e5e7eb")),
        # Align numbers right
        ("ALIGN",        (0,0), (0,-1), "CENTER"),
        ("ALIGN",        (2,0), (-1,-1), "RIGHT"),
        ("VALIGN",       (0,0), (-1,-1), "MIDDLE"),
    ]))
    return t


def totals_table(subtotal, vat, total, vat_label="VAT @ 5%", hdr_color=DARK, extra_rows=None):
    S = styles()
    rows = [
        ["Subtotal (excl. VAT)", f"AED {subtotal:,.2f}"],
    ]
    if extra_rows:
        rows.extend(extra_rows)
    rows.append([vat_label, f"AED {vat:,.2f}"])
    rows.append(["TOTAL AMOUNT DUE", f"AED {total:,.2f}"])

    n = len(rows)
    t = Table(rows, colWidths=[75*mm, 40*mm])
    style = [
        ("FONTNAME",     (0,0), (-1,-2), "Helvetica"),
        ("FONTSIZE",     (0,0), (-1,-2), 8.5),
        ("FONTNAME",     (0,-1),(-1,-1), "Helvetica-Bold"),
        ("FONTSIZE",     (0,-1),(-1,-1), 10),
        ("TEXTCOLOR",    (0,-1),(-1,-1), hdr_color),
        ("LINEABOVE",    (0,-1),(-1,-1), 1.2, hdr_color),
        ("LINEBELOW",    (0,0), (-1,-2), 0.3, colors.HexColor("#e5e7eb")),
        ("TOPPADDING",   (0,0), (-1,-1), 4),
        ("BOTTOMPADDING",(0,0), (-1,-1), 4),
        ("ALIGN",        (1,0), (1,-1), "RIGHT"),
        ("FONTNAME",     (0,-2),(-1,-2), "Helvetica-Bold"),
        ("TEXTCOLOR",    (0,-2),(-1,-2), hdr_color),
    ]
    t.setStyle(TableStyle(style))
    return t


def footer_table(bank_lines, notes_lines, label_color):
    S = styles()
    def col(title, lines):
        items = [Paragraph(title, ParagraphStyle("fl", fontName="Helvetica-Bold", fontSize=7, textColor=label_color, leading=10, spaceAfter=4))]
        for l in lines:
            items.append(Paragraph(l, S["small"]))
        return items
    left  = col("PAYMENT DETAILS", bank_lines)
    right = col("NOTES",           notes_lines)
    t = Table([[left, right]], colWidths=[88*mm, 87*mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0,0),(-1,-1), "TOP"),
        ("TOPPADDING", (0,0),(-1,-1), 0),
    ]))
    return t


def risk_bar(text, bg_color, text_color):
    S = styles()
    p = Paragraph(text, ParagraphStyle("rb", fontName="Helvetica-Bold", fontSize=8.5,
                                        textColor=text_color, alignment=TA_CENTER, leading=12))
    t = Table([[p]], colWidths=[175*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",   (0,0),(-1,-1), bg_color),
        ("TOPPADDING",   (0,0),(-1,-1), 5),
        ("BOTTOMPADDING",(0,0),(-1,-1), 5),
        ("LINEABOVE",    (0,0),(-1,-1), 2, text_color),
    ]))
    return t


def warning_box(lines, bg, border, text_color):
    S = styles()
    items = []
    for l in lines:
        items.append(Paragraph(l, ParagraphStyle("wb", fontName="Helvetica", fontSize=8,
                                                  textColor=text_color, leading=12)))
    t = Table([[[*items]]], colWidths=[175*mm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), bg),
        ("BOX",           (0,0),(-1,-1), 1, border),
        ("TOPPADDING",    (0,0),(-1,-1), 6),
        ("BOTTOMPADDING", (0,0),(-1,-1), 6),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
        ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ]))
    return t


def build(filename, elements):
    path = os.path.join(OUT, filename)
    doc = SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=15*mm, rightMargin=15*mm,
        topMargin=12*mm, bottomMargin=12*mm,
    )
    doc.build(elements)
    print(f"  OK: {filename}")
    return path


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 1 — LOW RISK — e& (Etisalat) Telecom
# ══════════════════════════════════════════════════════════════════════════════
def inv01():
    S = styles()
    e = []
    supplier = dict(name="e& enterprise", legal="Emirates Integrated Telecommunications Co. PJSC",
                    addr="e& Tower, Khalifa Park, Abu Dhabi, UAE  |  Tel: +971 2 628 3333  |  enterprise@etisalat.ae",
                    trn="TRN: 100239410000003")
    e.append(header_table(supplier, "INV-ET-2025-04821", "14 April 2025", PURPLE))
    e.append(Spacer(1, 6*mm))
    e.append(parties_table(
        ["Emirates Integrated Telecom. Co. PJSC", "e& Tower, Khalifa Park, Abu Dhabi"],
        ["Horizon Capital Management LLC", "Suite 1201, Burj Daman Tower, DIFC, Dubai", "TRN: 100487230000015"],
        "PO-HCM-2025-0312", "14 May 2025", "April 1–30, 2025", PURPLE
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("Dedicated Fibre Internet (1 Gbps) – Monthly Service", 1, 4200.00, 4200.00),
        ("Managed SD-WAN – Primary Link – Monthly",             1, 2800.00, 2800.00),
        ("Business Voice Lines × 10 – Monthly",                10,  185.00, 1850.00),
        ("Cloud Backup – 2TB – Monthly",                        1,  950.00,  950.00),
    ], PURPLE))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(9800, 490, 10290, hdr_color=PURPLE)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 5*mm))
    e.append(footer_table(
        ["Bank: Emirates NBD", "Account: e& Enterprise LLC", "IBAN: AE07 0260 0010 2645 2130 201", "Payment Terms: Net 30 Days"],
        ["Computer-generated tax invoice. No signature required.",
         "Queries: enterprise-billing@etisalat.ae",
         "Subject to UAE VAT Federal Decree-Law No. 8 of 2017."]
    , PURPLE))
    e.append(Spacer(1, 5*mm))
    e.append(risk_bar("✓  AI RISK SCORE: ~12/100 — CLEAR  ·  Known recurring vendor · Valid TRN · VAT maths exact · PO matched · 30-day terms  →  AUTO-APPROVED into VAT Classifier",
                       colors.HexColor("#d1fae5"), colors.HexColor("#065f46")))
    build("01_LOW_RISK_Etisalat_Telecom.pdf", e)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 2 — LOW RISK — Emaar Facilities Management
# ══════════════════════════════════════════════════════════════════════════════
def inv02():
    S = styles()
    e = []
    supplier = dict(name="EMAAR", legal="Emaar Facilities Management LLC",
                    addr="Emaar Square, Building 3, Downtown Dubai, UAE  |  Tel: +971 4 367 3000  |  fm@emaar.ae",
                    trn="TRN: 100231890000078")
    e.append(header_table(supplier, "INV-EFM-2025-1182", "01 April 2025", BLUE))
    e.append(Spacer(1, 6*mm))
    e.append(parties_table(
        ["Emaar Facilities Management LLC", "Emaar Square, Bldg 3, Downtown Dubai"],
        ["Nexus Financial Advisory FZ-LLC", "Office 704, One Central, DWTC, Dubai", "TRN: 100553670000042"],
        "PO-NFA-0041", "01 May 2025", "Q2 Apr–Jun 2025", BLUE
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("Office Cleaning – Daily (Weekdays) × 65 sessions",        65,  210.00, 13650.00),
        ("HVAC Preventive Maintenance – Quarterly Service",           1, 8500.00,  8500.00),
        ("Pest Control – Monthly Treatment (3 floors)",               3,  750.00,  2250.00),
        ("Security Guard Services – 24/7 Coverage × 3 months",       3, 4800.00, 14400.00),
        ("Consumables & Janitorial Supplies",                         1, 1200.00,  1200.00),
    ], BLUE))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(40000, 2000, 42000, hdr_color=BLUE)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 5*mm))
    e.append(footer_table(
        ["Bank: Abu Dhabi Commercial Bank", "Account: Emaar Facilities Management LLC",
         "IBAN: AE42 0030 0000 0009 3451 900", "Payment Terms: Net 30 Days"],
        ["Payment due within 30 days. Late payments subject to 2% monthly charge.",
         "Valid tax invoice per UAE Federal Decree-Law No. 8 of 2017."]
    , BLUE))
    e.append(Spacer(1, 5*mm))
    e.append(risk_bar("✓  AI RISK SCORE: ~18/100 — CLEAR  ·  Established vendor (Emaar Group) · Both TRNs valid · VAT exact · Contract matched · 30-day terms  →  AUTO-APPROVED",
                       colors.HexColor("#d1fae5"), colors.HexColor("#065f46")))
    build("02_LOW_RISK_Emaar_Facilities.pdf", e)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 3 — MEDIUM RISK — Pinnacle Consulting DMCC
# ══════════════════════════════════════════════════════════════════════════════
def inv03():
    S = styles()
    e = []
    supplier = dict(name="PINNACLE BUSINESS SOLUTIONS", legal="Pinnacle Business Solutions DMCC",
                    addr="Unit 2204, JBC 5, Cluster W, JLT, Dubai, UAE  |  Tel: +971 4 551 7834  |  billing@pinnacleuae.com",
                    trn="TRN: 100671230000009")
    e.append(header_table(supplier, "INV-PBS-2025-0071", "28 April 2025", SLATE))
    e.append(Spacer(1, 4*mm))
    e.append(warning_box(
        ["⚠  FIRST TRANSACTION WITH THIS VENDOR  ·  DMCC Free Zone Entity  ·  No Purchase Order — verbal CFO approval only (15 Apr 2025). PO to be raised retrospectively."],
        colors.HexColor("#fffbeb"), colors.HexColor("#fcd34d"), colors.HexColor("#78350f")
    ))
    e.append(Spacer(1, 4*mm))
    e.append(parties_table(
        ["Pinnacle Business Solutions DMCC", "Unit 2204, JBC 5, JLT, Dubai", "DMCC Free Zone Entity"],
        ["Horizon Capital Management LLC", "Suite 1201, Burj Daman Tower, DIFC, Dubai", "TRN: 100487230000015"],
        "NOT PROVIDED", "13 May 2025 (Net 15)", "Apr 15–28, 2025", SLATE
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("Strategy & Finance Transformation – Senior Consultant",  8, 3500.00, 28000.00),
        ("ERP System Assessment & Gap Analysis Report",            4, 3200.00, 12800.00),
        ("Management Reporting Framework Design",                  2, 2800.00,  5600.00),
        ("Travel & Accommodation Reimbursement",                   1, 3440.00,  3440.00),
    ], SLATE))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(49840, 2492, 52332, hdr_color=SLATE)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 5*mm))
    e.append(footer_table(
        ["Bank: Mashreq Bank PSC", "Account: Pinnacle Business Solutions DMCC",
         "IBAN: AE27 0330 0000 0110 7285 334", "Payment Terms: Net 15 Days"],
        ["Services per LOE dated 14 April 2025. Full deliverables submitted 28 April 2025.",
         "Travel costs supported by original receipts available on request.",
         "Free zone VAT treatment per Art. 30 UAE VAT Law."]
    , SLATE))
    e.append(Spacer(1, 5*mm))
    e.append(risk_bar("⚠  AI RISK SCORE: ~44/100 — MEDIUM  ·  New vendor (no history) · DMCC free zone · No PO on AED 52K · 15-day terms · Travel reimbursement  →  SENT TO AP REVIEW QUEUE",
                       colors.HexColor("#fef9c3"), colors.HexColor("#78350f")))
    build("03_MEDIUM_RISK_Pinnacle_Consulting.pdf", e)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 4 — MEDIUM RISK — Desert Rose Catering
# ══════════════════════════════════════════════════════════════════════════════
def inv04():
    S = styles()
    e = []
    supplier = dict(name="DESERT ROSE CATERING", legal="Desert Rose Hospitality & Catering Services LLC",
                    addr="Al Quoz Industrial Area 3, Unit 14, Dubai, UAE  |  Tel: +971 4 347 2289  |  invoices@desertrosecat.ae",
                    trn="TRN: 100388940000031")
    e.append(header_table(supplier, "INV-DRC-2025-3318", "22 May 2025", ORANGE))
    e.append(Spacer(1, 4*mm))
    e.append(warning_box(
        ["⚠  VAT RECOVERABILITY WARNING:  Catering and hospitality services for staff entertainment may be subject to input VAT recovery restrictions under Art. 54(1)(c) UAE VAT Law.",
         "Recovery should be confirmed by your tax adviser before claiming input tax."],
        colors.HexColor("#fef3c7"), colors.HexColor("#fcd34d"), colors.HexColor("#78350f")
    ))
    e.append(Spacer(1, 4*mm))
    e.append(parties_table(
        ["Desert Rose Hospitality & Catering LLC", "Al Quoz Industrial 3, Unit 14, Dubai"],
        ["Horizon Capital Management LLC", "Suite 1201, Burj Daman Tower, DIFC, Dubai", "TRN: 100487230000015"],
        "PO-HCM-0078", "29 May 2025 (Net 7)", "Event: 21 May 2025", ORANGE
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("3-Course Dinner Buffet per Person [ENTERTAINMENT FLAG]",  85,  165.00, 14025.00),
        ("Premium Beverages Package – Soft Drinks & Juices [ENTERTAINMENT]", 85, 45.00, 3825.00),
        ("Venue Setup, Decoration & Linen Service",                  1, 1800.00,  1800.00),
        ("Waitstaff Service (6 Staff × 4 Hours)",                   24,   75.00,  1800.00),
    ], ORANGE))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(21450, 1072.50, 22522.50,
                                    vat_label="VAT @ 5% (⚠ Art.54 recovery restriction)",
                                    hdr_color=ORANGE)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 5*mm))
    e.append(footer_table(
        ["Bank: Commercial Bank of Dubai", "Account: Desert Rose Hospitality & Catering",
         "IBAN: AE09 0230 0000 0016 3471 701", "Payment Terms: Net 7 Days"],
        ["Input VAT on entertainment/food for employees may not be recoverable per UAE VAT",
         "Executive Regulations Art. 53. Confirm with tax adviser before recovering."]
    , ORANGE))
    e.append(Spacer(1, 5*mm))
    e.append(risk_bar("⚠  AI RISK SCORE: ~51/100 — MEDIUM  ·  Entertainment VAT recovery restriction (Art. 54) · Staff dinner · VAT may be blocked · 7-day terms  →  SENT TO AP REVIEW QUEUE",
                       colors.HexColor("#fef9c3"), colors.HexColor("#78350f")))
    build("04_MEDIUM_RISK_Desert_Rose_Catering.pdf", e)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 5 — HIGH RISK — Al Fajr Trading URGENT
# ══════════════════════════════════════════════════════════════════════════════
def inv05():
    S = styles()
    e = []
    supplier = dict(name="AL FAJR GENERAL TRADING", legal="Al Fajr General Trading Company LLC",
                    addr="Shop 14, Al Ras Market, Deira, Dubai, UAE  |  Tel: +971 55 847 3921  |  alfajrtrade@gmail.com",
                    trn_flag="⛔ TRN: NOT REGISTERED — Charging VAT illegally (FTA Art. 40)")
    e.append(header_table(supplier, "INV-AFT-2025-0412", "28 May 2025", colors.HexColor("#374151")))
    e.append(Spacer(1, 4*mm))

    # Risk flags box
    flags = [
        "🚨  RISK FLAGS DETECTED BY GULFTAX AI:",
        "🔴  Supplier TRN NOT REGISTERED — charging VAT is illegal, input tax not recoverable (Art. 40)",
        "🔴  DUPLICATE INVOICE NUMBER — INV-AFT-2025-0412 matches prior submission dated 18 Apr 2025 for same amount",
        "🔴  URGENCY PRESSURE — 'Pay within 2 days or penalty applies' — documented fraud indicator",
        "🟡  Gmail email address — inconsistent with AED 78,750 transaction from a company",
        "🟡  Round number amounts — AED 35K + 25K + 15K exact round figures on bulk supply invoice",
    ]
    e.append(warning_box(flags, colors.HexColor("#fef2f2"), RED, colors.HexColor("#7f1d1d")))
    e.append(Spacer(1, 4*mm))

    # Urgency note
    e.append(warning_box(
        ['URGENT NOTICE FROM SUPPLIER: "Dear Accounts Team — Please process this payment IMMEDIATELY. Our director has confirmed this order verbally with your CEO. Payment MUST be received within 2 DAYS or we will apply a 15% late penalty and cancel the contract. Do not delay — this is time-sensitive."'],
        colors.HexColor("#fef2f2"), RED, colors.HexColor("#7f1d1d")
    ))
    e.append(Spacer(1, 4*mm))

    e.append(parties_table(
        ["Al Fajr General Trading Company LLC", "Shop 14, Al Ras Market, Deira, Dubai", "⛔ TRN: NOT REGISTERED"],
        ["Horizon Capital Management LLC", "Suite 1201, Burj Daman Tower, DIFC, Dubai", "TRN: 100487230000015"],
        "NONE — VERBAL ONLY", "30 May 2025 (2 DAYS)", "May 2025", colors.HexColor("#374151")
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("Office Furniture & Equipment – Bulk Supply (Various Items)", 1, 35000.00, 35000.00),
        ("IT Hardware – Laptops, Monitors, Accessories (Per Agreement)", 1, 25000.00, 25000.00),
        ("Installation & Delivery (Lump Sum)",                         1, 15000.00, 15000.00),
    ], colors.HexColor("#374151")))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(75000, 3750, 78750,
                                    vat_label="VAT @ 5% (⚠ INVALID — supplier unregistered)",
                                    hdr_color=RED)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 5*mm))
    e.append(warning_box(
        ["IMPORTANT: Do NOT process payment. This invoice is HARD BLOCKED by GulfTax AI.",
         "Finance Manager override with documented reason required before any payment."],
        colors.HexColor("#fef2f2"), RED, colors.HexColor("#7f1d1d")
    ))
    e.append(Spacer(1, 4*mm))
    e.append(risk_bar("🚨  AI RISK SCORE: ~87/100 — HIGH RISK  ·  Unregistered TRN (VAT illegal) · Duplicate invoice · Urgency pressure · Gmail · Round numbers · No PO  →  HARD BLOCKED",
                       colors.HexColor("#fee2e2"), RED))
    build("05_HIGH_RISK_AlFajr_Trading_URGENT.pdf", e)


# ══════════════════════════════════════════════════════════════════════════════
# INVOICE 6 — HIGH RISK — Opulent Events Gala
# ══════════════════════════════════════════════════════════════════════════════
def inv06():
    S = styles()
    e = []
    supplier = dict(name="OPULENT EVENTS & HOSPITALITY", legal="Luxury Corporate Events · Dubai · Abu Dhabi",
                    addr="The Opus by Zaha Hadid, Business Bay, Dubai, UAE  |  events@opulentevents.ae  |  +971 50 921 4477",
                    trn_flag="⛔ TRN: NOT PROVIDED — Cannot legally charge UAE VAT")
    e.append(header_table(supplier, "INV-OEH-2025-0089", "30 May 2025", DARK))
    e.append(Spacer(1, 4*mm))
    flags = [
        "🚨  RISK FLAGS DETECTED BY GULFTAX AI (Score: 79/100 — HIGH):",
        "🔴  Supplier has NO UAE VAT registration — charging VAT is illegal, input tax CANNOT be recovered",
        "🔴  ALL line items are CLIENT ENTERTAINMENT — input VAT fully blocked under Art. 54(1)(c) UAE VAT Law",
        "🔴  No written PO or contract — verbal Managing Director approval only for AED 134,750",
        "🟡  5-day payment terms on AED 134,750 — unusually short for corporate event spend",
    ]
    e.append(warning_box(flags, colors.HexColor("#fef2f2"), RED, colors.HexColor("#7f1d1d")))
    e.append(Spacer(1, 4*mm))
    e.append(warning_box(
        ['APPROVAL NOTE: "This event was approved verbally by the Managing Director on 25 May 2025. A retrospective PO will be raised by the PA. Please process urgently as the vendor has requested immediate payment post-event."'],
        colors.HexColor("#fef3c7"), AMBER, colors.HexColor("#78350f")
    ))
    e.append(Spacer(1, 4*mm))
    e.append(parties_table(
        ["Opulent Events & Hospitality LLC", "The Opus, Business Bay, Dubai", "⛔ TRN: NOT PROVIDED"],
        ["Horizon Capital Management LLC", "Suite 1201, Burj Daman Tower, DIFC, Dubai", "TRN: 100487230000015"],
        "NONE — VERBAL MD APPROVAL", "04 Jun 2025 (5 days)", "Event: 29 May 2025", DARK
    ))
    e.append(Spacer(1, 5*mm))
    e.append(line_items_table([
        ("Private Ballroom Hire – Atlantis The Palm (6 Hours) [ENTERTAINMENT]",  1, 45000.00, 45000.00),
        ("Gala Dinner – 5-Course Menu per Head × 120 Guests [ENTERTAINMENT]",  120,   380.00, 45600.00),
        ("Premium Open Bar – International Beverages × 120 [ENTERTAINMENT]",    120,   220.00, 26400.00),
        ("Live Entertainment – Jazz Band (3 Hours) [ENTERTAINMENT]",              1,  8000.00,  8000.00),
        ("Flowers, Décor, Photography & Event Coordination",                      1,  3333.33,  3333.33),
    ], DARK))
    e.append(Spacer(1, 4*mm))
    tot = Table([["", totals_table(128333.33, 6416.67, 134750,
                                    vat_label="VAT @ 5% (⚠ Unregistered + Art.54 blocked)",
                                    hdr_color=RED)]], colWidths=[90*mm, 85*mm])
    tot.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP")]))
    e.append(tot)
    e.append(Spacer(1, 4*mm))
    e.append(warning_box(
        ["HARD BLOCKED: (1) Supplier not VAT-registered — VAT charged illegally. (2) All entertainment items blocked under Art. 54. (3) AED 134,750 with no written approval or PO.",
         "Finance Manager override with full written justification required before payment."],
        colors.HexColor("#fef2f2"), RED, colors.HexColor("#7f1d1d")
    ))
    e.append(Spacer(1, 4*mm))
    e.append(risk_bar("🚨  AI RISK SCORE: ~79/100 — HIGH RISK  ·  Unregistered supplier · All entertainment (Art. 54 blocked) · No PO on AED 134K · Verbal approval only  →  HARD BLOCKED",
                       colors.HexColor("#fee2e2"), RED))
    build("06_HIGH_RISK_Luxury_Events_Gala.pdf", e)


if __name__ == "__main__":
    print("Generating UAE VAT Invoice PDFs...")
    inv01()
    inv02()
    inv03()
    inv04()
    inv05()
    inv06()
    print("\nDone! 6 PDF invoices saved to:", OUT)
    print("\nUpload order for LinkedIn demo:")
    print("  1. 01_LOW_RISK_Etisalat  → auto-approved in seconds")
    print("  2. 02_LOW_RISK_Emaar     → auto-approved in seconds")
    print("  3. 03_MEDIUM_Pinnacle    → lands in AP Review Queue")
    print("  4. 05_HIGH_AlFajr        → HARD BLOCKED immediately")
