"use client";

import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { apiClient } from "@/lib/api";
import { useCompanyId } from "@/hooks/useAuth";

/** Mirrors `scripts/generate_einvoicing_n8n.py` → `UAE_EInvoicing_Readiness.json` Code node. */
type IntegrationStatus = "not_started" | "planning" | "testing" | "live";

function computeReadinessEngine(params: {
  revenue: number;
  asp: boolean;
  fmt: string;
  integration: IntegrationStatus;
  masterClean: string;
  budget: boolean;
  invPm: number;
  business: "B2B" | "B2G" | "B2C";
}) {
  const { revenue, asp, fmt, integration, masterClean, budget, invPm, business } = params;

  let phase: "out_of_scope" | "phase_1" | "phase_2" = "out_of_scope";
  let phaseLabel = "Out of scope / not in Phase 1 mandate";
  if (revenue >= 50_000_000) {
    phase = "phase_1";
    phaseLabel = "Phase 1 (Revenue ≥ AED 50M) — CRITICAL";
  } else if (revenue >= 1) {
    phase = "phase_2";
    phaseLabel = "Phase 2 (other businesses)";
  }

  let score = 100;
  const gaps: { level: "critical" | "high" | "medium"; text: string }[] = [];
  if (!asp) {
    score -= 35;
    gaps.push({ level: "critical", text: "No accredited ASP appointed" });
  }
  if (["PDF", "Paper", "Email"].includes(fmt)) {
    score -= 25;
    gaps.push({ level: "high", text: "Invoice format not Peppol / PINT AE ready" });
  }
  if (integration === "not_started") {
    score -= 15;
    gaps.push({ level: "high", text: "ERP / ASP integration not started" });
  }
  if (masterClean === "NO" || masterClean === "PARTIAL") {
    score -= 12;
    gaps.push({ level: "high", text: "Master data not clean for e-invoicing" });
  }
  if (!budget) {
    score -= 8;
    gaps.push({ level: "medium", text: "ERP upgrade budget not confirmed" });
  }
  if (invPm > 500 && integration !== "live") {
    score -= 5;
    gaps.push({ level: "medium", text: "High invoice volume without live integration" });
  }
  if (business === "B2C" && revenue < 50_000_000) {
    score -= 5;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const aspDeadline = new Date("2026-07-31T23:59:59Z");
  const goLive =
    revenue >= 50_000_000
      ? new Date("2027-01-01T00:00:00Z")
      : new Date("2027-07-01T00:00:00Z");
  const today = new Date();
  const daysAsp = Math.ceil((aspDeadline.getTime() - today.getTime()) / 86400000);
  const daysLive = Math.ceil((goLive.getTime() - today.getTime()) / 86400000);

  let costLow = 150000;
  let costHigh = 400000;
  if (revenue >= 50_000_000) {
    costLow = 650000;
    costHigh = 1850000;
  } else if (revenue >= 10_000_000) {
    costLow = 350000;
    costHigh = 950000;
  }

  const penaltyExposure = !asp && revenue >= 50_000_000 ? 60000 : 5000;

  let urgency: "RED" | "AMBER" | "GREEN" = "GREEN";
  if (phase === "phase_1" && score < 40) urgency = "RED";
  else if (phase === "phase_1" || score < 55) urgency = "AMBER";

  return {
    phase,
    phaseLabel,
    score,
    urgency,
    gaps,
    daysAsp,
    daysLive,
    costLow,
    costHigh,
    penaltyExposure,
  };
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

type TxType = "B2B" | "B2G" | "B2C";

function computeScope(args: { revenue: number; tx: TxType; entity: string }) {
  const { revenue, tx, entity } = args;
  const phase1 = revenue >= 50_000_000;
  const aspDeadline = new Date("2026-07-31T23:59:59+04:00");
  const goLiveP1 = new Date("2027-01-01T00:00:00+04:00");
  const goLiveP2 = new Date("2027-07-01T00:00:00+04:00");
  const goLive = phase1 ? goLiveP1 : goLiveP2;
  const now = Date.now();
  const daysAsp = Math.ceil((aspDeadline.getTime() - now) / 86400000);
  const daysMandate = Math.ceil((goLive.getTime() - now) / 86400000);

  let light: "RED" | "AMBER" | "GREEN" = "GREEN";
  if (revenue >= 50_000_000) {
    if (daysAsp <= 60 || daysMandate <= 180) light = "RED";
    else if (daysAsp <= 180 || daysMandate <= 365) light = "AMBER";
    else light = "GREEN";
  } else if (revenue > 0) {
    if (tx === "B2B" || tx === "B2G") light = "AMBER";
    else light = "GREEN";
  }

  return {
    phaseLabel: phase1
      ? "Phase 1 — large taxpayers (revenue ≥ AED 50M)"
      : revenue > 0
        ? "Phase 2 — below AED 50M threshold"
        : "Enter revenue to determine phase",
    phase1,
    aspDeadline,
    goLive,
    daysAsp,
    daysMandate,
    light,
    entityNote: entity,
    aspRule: "Accredited ASP appointment — 31 Jul 2026 (Phase 1 cohort)",
    goLiveRule: phase1
      ? "Statutory e-invoicing go-live — 1 Jan 2027 (Phase 1)"
      : "Planned go-live — 1 Jul 2027 (Phase 2, illustrative)",
  };
}

type FieldCheck = { id: string; label: string; ok: boolean; hint: string };
type ReadinessLevel = "not_ready" | "partial" | "ready";

interface AssessmentRecord {
  id: number;
  company_id: number;
  assessed_at: string;
  overall_score: number;
  readiness_level: ReadinessLevel;
  gap_areas: unknown[];
  recommendations: unknown[];
}

type LoadState = "idle" | "loading" | "ok" | "error";
type ToastState = { kind: "success" | "error"; message: string } | null;

function validatePintAePaste(raw: string): FieldCheck[] {
  const t = raw.toLowerCase();

  const hasSellerTrn =
    /(?:seller|supplier|vendor|s\s*v\s*)[^\n]{0,50}?(?:trn|tin)\D{0,12}(\d{15})/i.test(raw) ||
    (/(?:trn|tin)\s*[:#]?\s*(\d{15})/i.test(raw) && /seller|supplier|vendor/i.test(raw));
  const hasBuyerTrn =
    /(?:buyer|customer|purchaser)[^\n]{0,50}?(?:trn|tin)\D{0,12}(\d{15})/i.test(raw) ||
    (/(?:trn|tin)/i.test(raw) && /buyer|customer/i.test(raw) && /\d{15}/.test(raw));

  const hasSellerName =
    /(?:seller|supplier|vendor)[^\n]{0,40}?(?:name|company|legal)/i.test(t) ||
    /(?:^|\n)\s*(?:from|supplier)\s*[:\-]/im.test(raw);
  const hasBuyerName =
    /(?:buyer|customer|bill\s*to)[^\n]{0,40}?(?:name|company)/i.test(t) ||
    /(?:^|\n)\s*to\s*[:\-]/im.test(raw);

  const hasInvoiceNo =
    /invoice\s*(?:no|number|#|id)\s*[:\-]?\s*\S+/i.test(t) ||
    /(?:document|tax\s*invoice)\s*(?:no|number)/i.test(t);

  const hasDate =
    /(?:invoice|issue|supply)\s*date/i.test(t) ||
    /\d{4}-\d{2}-\d{2}/.test(raw) ||
    /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(raw);

  const hasTax =
    /(?:vat|tax)\s*(?:amount|total|payable)/i.test(t) ||
    /(?:total\s*vat|taxable\s*value)/i.test(t);

  const hasLines =
    /line\s*(items?|no|number)/i.test(t) ||
    (/(?:description|item\s*name|qty|quantity|unit\s*price)/i.test(t) &&
      raw.split(/\n/).length >= 4);

  return [
    {
      id: "seller_trn",
      label: "Seller TRN / TIN (UAE-style 15 digits)",
      ok: hasSellerTrn,
      hint: "Include a line like Seller TRN: 100123456700003",
    },
    {
      id: "buyer_trn",
      label: "Buyer TRN / TIN (where applicable)",
      ok: hasBuyerTrn,
      hint: "Add Buyer TRN / Customer TIN for B2B/B2G context",
    },
    {
      id: "seller_name",
      label: "Seller legal name",
      ok: hasSellerName,
      hint: "Add Supplier name: … or From: …",
    },
    {
      id: "buyer_name",
      label: "Buyer legal name",
      ok: hasBuyerName,
      hint: "Add Buyer name: … or Bill-to party",
    },
    {
      id: "invoice_number",
      label: "Invoice / document number",
      ok: hasInvoiceNo,
      hint: "Invoice No: …",
    },
    {
      id: "invoice_date",
      label: "Invoice / issue date",
      ok: hasDate,
      hint: "Issue date: YYYY-MM-DD or DD/MM/YYYY",
    },
    {
      id: "tax_amount",
      label: "Tax / VAT totals",
      ok: hasTax,
      hint: "VAT amount or Tax total line",
    },
    {
      id: "line_items",
      label: "Line items (description, qty, amounts)",
      ok: hasLines,
      hint: "Table or multiple lines with description / quantity / unit price",
    },
  ];
}

const ROADMAP_PHASES = [
  {
    days: "1–15",
    title: "Mobilise & data discovery",
    owner: "CFO sponsor",
    milestones: [
      "Confirm Phase 1 vs 2 position and mandate dates",
      "Inventory ERP, billing, and credit-note flows",
      "Nominate steering group and weekly cadence",
    ],
  },
  {
    days: "16–30",
    title: "ASP selection & contracting",
    owner: "Procurement + Tax",
    milestones: [
      "RFP to ≥2 accredited ASPs (Peppol PINT AE)",
      "Security / DPA review and SOW sign-off",
      "Kick-off workshop with short-listed ASP",
    ],
  },
  {
    days: "31–45",
    title: "Technical design & master data",
    owner: "IT + Finance ops",
    milestones: [
      "TRN / legal entity mapping and GL cost centres",
      "VAT codes → Peppol tax category mapping sheet",
      "Sandbox connectivity and certificate plan",
    ],
  },
  {
    days: "46–60",
    title: "Build, map, and UAT",
    owner: "IT + ASP",
    milestones: [
      "UBL / CIUS PINT AE sample invoices end-to-end",
      "Negative tests: credit notes, allowances, rounding",
      "Performance test at peak invoice / month volume",
    ],
  },
  {
    days: "61–75",
    title: "Cutover rehearsal",
    owner: "Programme office",
    milestones: [
      "Parallel-run checklist with Treasury sign-off",
      "Hypercare roster and escalation matrix",
      "FTA EmaraTax / MoF portal readiness checks",
    ],
  },
  {
    days: "76–90",
    title: "Production & stabilisation",
    owner: "Head of Tax",
    milestones: [
      "Go-live decision log and rollback triggers",
      "First-month reconciliation VAT vs e-invoice totals",
      "Post-implementation lessons + runbook handover",
    ],
  },
] as const;

export default function EInvoicingPage() {
  const companyId = useCompanyId();
  const [tab, setTab] = useState(0);
  const [summaryState, setSummaryState] = useState<LoadState>("loading");
  const [historyState, setHistoryState] = useState<LoadState>("loading");
  const [latestAssessment, setLatestAssessment] = useState<AssessmentRecord | null>(null);
  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerDisabledUntil, setTriggerDisabledUntil] = useState<number | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  /* Tab 1 */
  const [revInput, setRevInput] = useState("");
  const [txType, setTxType] = useState<TxType>("B2B");
  const [entityType, setEntityType] = useState("mainland");
  const [scopeResult, setScopeResult] = useState<ReturnType<typeof computeScope> | null>(null);

  /* Tab 2 */
  const [gapRevenue, setGapRevenue] = useState("");
  const [erpStage, setErpStage] = useState<IntegrationStatus>("not_started");
  const [invFormat, setInvFormat] = useState("PDF");
  const [invPm, setInvPm] = useState("");
  const [aspYes, setAspYes] = useState(false);
  const [masterQ, setMasterQ] = useState<"YES" | "PARTIAL" | "NO">("PARTIAL");
  const [budgetYes, setBudgetYes] = useState(true);
  const [gapTx, setGapTx] = useState<TxType>("B2B");
  const [gapRun, setGapRun] = useState<ReturnType<typeof computeReadinessEngine> | null>(null);

  /* Tab 3 */
  const [paste, setPaste] = useState("");
  const [validated, setValidated] = useState<FieldCheck[] | null>(null);

  const onScopeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const revenue = parseFloat(String(revInput).replace(/,/g, "")) || 0;
    setScopeResult(computeScope({ revenue, tx: txType, entity: entityType }));
  };

  const onGapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const revenue = parseFloat(String(gapRevenue).replace(/,/g, "")) || 0;
    const inv = parseInt(String(invPm).replace(/,/g, ""), 10) || 0;
    setGapRun(
      computeReadinessEngine({
        revenue,
        asp: aspYes,
        fmt: invFormat,
        integration: erpStage,
        masterClean: masterQ,
        budget: budgetYes,
        invPm: inv,
        business: gapTx,
      })
    );
  };

  const onValidate = () => {
    setValidated(validatePintAePaste(paste));
  };

  const gapCostLabel = useMemo(() => {
    if (!gapRun) return "";
    return `${fmtAed(gapRun.costLow)} – ${fmtAed(gapRun.costHigh)}`;
  }, [gapRun]);

  const triggerCooldownSeconds = useMemo(() => {
    if (!triggerDisabledUntil) return 0;
    return Math.max(0, Math.ceil((triggerDisabledUntil - Date.now()) / 1000));
  }, [triggerDisabledUntil, isTriggering]);

  const isTriggerDisabled = isTriggering || triggerCooldownSeconds > 0;

  const toStringList = (value: unknown[]): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
  };

  const fetchAssessments = async () => {
    setSummaryState("loading");
    setHistoryState("loading");
    setExpandedId(null);
    try {
      const [latestRes, historyRes] = await Promise.all([
        apiClient.get<AssessmentRecord[]>(`/api/automations/assessments`, {
          params: { limit: 1 },
          timeout: 15000,
        } as Parameters<typeof apiClient.get>[1]),
        apiClient.get<AssessmentRecord[]>(`/api/automations/assessments`, {
          params: { limit: 10 },
          timeout: 15000,
        } as Parameters<typeof apiClient.get>[1]),
      ]);
      setLatestAssessment(latestRes.data[0] ?? null);
      setHistory(historyRes.data ?? []);
      setSummaryState("ok");
      setHistoryState("ok");
    } catch {
      setLatestAssessment(null);
      setHistory([]);
      setSummaryState("error");
      setHistoryState("error");
    }
  };

  useEffect(() => {
    fetchAssessments();
  }, [apiUrl]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!triggerDisabledUntil) return;
    if (triggerDisabledUntil <= Date.now()) {
      setTriggerDisabledUntil(null);
      return;
    }
    const timer = window.setInterval(() => {
      if (triggerDisabledUntil <= Date.now()) {
        setTriggerDisabledUntil(null);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [triggerDisabledUntil]);

  const onRequestAssessment = async () => {
    setIsTriggering(true);
    try {
      await apiClient.post(`/api/automations/trigger/${companyId}`, undefined, {
        timeout: 15000,
      } as Parameters<typeof apiClient.post>[2]);
      setToast({
        kind: "success",
        message: "Assessment requested — results will appear shortly",
      });
      setTriggerDisabledUntil(Date.now() + 60_000);
      await fetchAssessments();
    } catch {
      setToast({
        kind: "error",
        message: "Failed to trigger — check n8n connection",
      });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <>
      {toast && (
        <div
          className={`mb-4 rounded-[10px] border px-4 py-3 text-sm ${
            toast.kind === "success"
              ? "border-green/40 bg-[rgba(45,212,160,0.1)] text-green"
              : "border-red/40 bg-[rgba(255,107,107,0.1)] text-red"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // E-Invoicing
        </div>
        <h2 className="font-playfair text-[26px] font-bold">UAE Peppol / PINT AE readiness</h2>
        <p className="text-[13px] text-muted mt-1 max-w-3xl">
          Client-side shell aligned to Ministerial Decisions 243/244 (2025) timelines in the n8n
          template. No API calls; backend wiring comes later.
        </p>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Readiness assessment</h3>
            <p className="text-[13px] text-muted mt-1">
              Latest e-invoicing workflow outcome for your company.
            </p>
          </div>
          <button
            type="button"
            onClick={onRequestAssessment}
            disabled={isTriggerDisabled}
            className="px-5 py-2.5 rounded-[10px] text-sm font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isTriggering
              ? "Requesting..."
              : triggerCooldownSeconds > 0
                ? `Request Assessment (${triggerCooldownSeconds}s)`
                : "Request Assessment"}
          </button>
        </div>

        {summaryState === "loading" && (
          <div className="space-y-3">
            <div className="h-12 rounded-lg bg-[rgba(78,168,255,0.08)] animate-pulse" />
            <div className="h-20 rounded-lg bg-[rgba(78,168,255,0.08)] animate-pulse" />
          </div>
        )}

        {summaryState === "error" && (
          <div className="rounded-lg border border-red/30 bg-[rgba(255,107,107,0.08)] px-4 py-3 text-sm text-red">
            Could not load assessment data.
          </div>
        )}

        {summaryState === "ok" && !latestAssessment && (
          <div className="rounded-xl border border-border bg-[rgba(4,12,30,0.45)] p-5 text-sm text-muted">
            No assessment on file. Click Request Assessment to trigger the readiness workflow.
          </div>
        )}

        {summaryState === "ok" && latestAssessment && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`text-xs font-mono uppercase px-3 py-1 rounded-full border ${
                  latestAssessment.readiness_level === "not_ready"
                    ? "bg-[rgba(255,107,107,0.15)] border-red text-red"
                    : latestAssessment.readiness_level === "partial"
                      ? "bg-[rgba(255,169,64,0.12)] border-amber text-amber"
                      : "bg-[rgba(45,212,160,0.1)] border-green text-green"
                }`}
              >
                {latestAssessment.readiness_level.replace("_", " ")}
              </span>
              <span className="text-sm text-muted">
                Assessed{" "}
                {new Date(latestAssessment.assessed_at).toLocaleString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Dubai",
                })}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between text-[12px] text-muted2 uppercase tracking-wide mb-2">
                <span>Overall score</span>
                <span className="font-mono text-gold-lt">{latestAssessment.overall_score}%</span>
              </div>
              <div className="h-2 bg-[rgba(255,255,255,0.08)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-gold to-gold-lt transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, latestAssessment.overall_score))}%` }}
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-5">
              <div>
                <h4 className="text-sm text-white font-semibold mb-2">Gaps identified</h4>
                <ul className="list-disc list-inside text-[13px] text-muted space-y-1">
                  {toStringList(latestAssessment.gap_areas).length > 0 ? (
                    toStringList(latestAssessment.gap_areas).map((gap, idx) => (
                      <li key={`${gap}-${idx}`}>{gap}</li>
                    ))
                  ) : (
                    <li>No major gaps identified.</li>
                  )}
                </ul>
              </div>
              <div>
                <h4 className="text-sm text-white font-semibold mb-2">Recommended actions</h4>
                <ol className="list-decimal list-inside text-[13px] text-muted space-y-1">
                  {toStringList(latestAssessment.recommendations).length > 0 ? (
                    toStringList(latestAssessment.recommendations).map((item, idx) => (
                      <li key={`${item}-${idx}`}>{item}</li>
                    ))
                  ) : (
                    <li>No recommendations available.</li>
                  )}
                </ol>
              </div>
            </div>
          </div>
        )}

        <div className="pt-3 border-t border-border">
          <h4 className="text-sm text-white font-semibold mb-3">Assessment history</h4>
          {historyState === "loading" && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="h-10 rounded bg-[rgba(78,168,255,0.08)] animate-pulse" />
              ))}
            </div>
          )}
          {historyState === "error" && (
            <p className="text-sm text-red">Unable to load assessment history.</p>
          )}
          {historyState === "ok" && history.length === 0 && (
            <p className="text-sm text-muted">No assessments yet.</p>
          )}
          {historyState === "ok" && history.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[rgba(4,12,30,0.9)] text-muted2 uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Readiness Level</th>
                    <th className="px-4 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => {
                    const isExpanded = expandedId === row.id;
                    const gaps = toStringList(row.gap_areas);
                    const recs = toStringList(row.recommendations);
                    return (
                      [
                        <tr
                          key={row.id}
                          className="border-t border-border text-muted cursor-pointer hover:bg-[rgba(20,50,100,0.25)]"
                          onClick={() => setExpandedId((prev) => (prev === row.id ? null : row.id))}
                        >
                          <td className="px-4 py-2 text-white">
                            {new Date(row.assessed_at).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              timeZone: "Asia/Dubai",
                            })}
                          </td>
                          <td className="px-4 py-2 font-mono">{row.overall_score}%</td>
                          <td className="px-4 py-2">{row.readiness_level.replace("_", " ")}</td>
                          <td className="px-4 py-2 text-gold-lt">
                            {isExpanded ? "Hide details" : "View details"}
                          </td>
                        </tr>,
                        ...(isExpanded
                          ? [
                              <tr key={`expanded-${row.id}`} className="border-t border-border">
                                <td colSpan={4} className="px-4 py-3 bg-[rgba(4,12,30,0.4)]">
                                  <div className="grid md:grid-cols-2 gap-4">
                                    <div>
                                      <h5 className="text-xs uppercase text-muted2 mb-1.5">
                                        Gaps identified
                                      </h5>
                                      <ul className="list-disc list-inside text-[13px] text-muted space-y-1">
                                        {gaps.length > 0 ? (
                                          gaps.map((gap, idx) => (
                                            <li key={`${row.id}-gap-${idx}`}>{gap}</li>
                                          ))
                                        ) : (
                                          <li>No major gaps identified.</li>
                                        )}
                                      </ul>
                                    </div>
                                    <div>
                                      <h5 className="text-xs uppercase text-muted2 mb-1.5">
                                        Recommended actions
                                      </h5>
                                      <ol className="list-decimal list-inside text-[13px] text-muted space-y-1">
                                        {recs.length > 0 ? (
                                          recs.map((item, idx) => (
                                            <li key={`${row.id}-rec-${idx}`}>{item}</li>
                                          ))
                                        ) : (
                                          <li>No recommendations available.</li>
                                        )}
                                      </ol>
                                    </div>
                                  </div>
                                </td>
                              </tr>,
                            ]
                          : []),
                      ]
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {["Scope checker", "Gap assessment", "Invoice validator", "Roadmap"].map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(i)}
            className={`px-4 py-2 rounded-[10px] text-[13px] font-medium transition-all ${
              tab === i
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white border border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <form onSubmit={onScopeSubmit} className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Annual revenue (AED)
              </label>
              <input
                value={revInput}
                onChange={(e) => setRevInput(e.target.value)}
                className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="decimal"
                placeholder="e.g. 52000000"
              />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Transaction profile
              </label>
              <select
                value={txType}
                onChange={(e) => setTxType(e.target.value as TxType)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="B2B">B2B</option>
                <option value="B2G">B2G</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Entity type
              </label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="mainland">Mainland taxable person</option>
                <option value="fz">Designated zone / free zone</option>
                <option value="gov">Government / authority</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g hover:opacity-95"
              >
                Assess scope
              </button>
            </div>
          </form>

          {scopeResult && (
            <div className="border border-border rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-xs font-mono uppercase px-3 py-1 rounded-full border ${
                    scopeResult.light === "RED"
                      ? "bg-[rgba(255,107,107,0.15)] border-red text-red"
                      : scopeResult.light === "AMBER"
                        ? "bg-[rgba(255,169,64,0.12)] border-amber text-amber"
                        : "bg-[rgba(45,212,160,0.1)] border-green text-green"
                  }`}
                >
                  {scopeResult.light}
                </span>
                <span className="text-sm text-white">{scopeResult.phaseLabel}</span>
              </div>
              <p className="text-[13px] text-muted">{scopeResult.goLiveRule}</p>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-[rgba(4,12,30,0.6)] border border-border p-4">
                  <div className="text-muted2 text-[11px] uppercase mb-1">ASP deadline</div>
                  <div className="font-mono text-gold-lt text-lg">{scopeResult.daysAsp} days</div>
                  <div className="text-muted text-[12px] mt-1">{scopeResult.aspRule}</div>
                </div>
                <div className="rounded-lg bg-[rgba(4,12,30,0.6)] border border-border p-4">
                  <div className="text-muted2 text-[11px] uppercase mb-1">Go-live countdown</div>
                  <div className="font-mono text-gold-lt text-lg">
                    {scopeResult.daysMandate} days
                  </div>
                  <div className="text-muted text-[12px] mt-1">
                    To {scopeResult.goLive.toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-muted2">
                Entity profile ({scopeResult.entityNote}) is contextual only in this shell; phase
                bands follow revenue from the build plan.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 1 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <form onSubmit={onGapSubmit} className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Annual revenue (AED)
              </label>
              <input
                value={gapRevenue}
                onChange={(e) => setGapRevenue(e.target.value)}
                className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="decimal"
                placeholder="Same as intake sheet — drives phase & cost band"
              />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                ERP / integration stage
              </label>
              <select
                value={erpStage}
                onChange={(e) => setErpStage(e.target.value as IntegrationStatus)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="not_started">Not started</option>
                <option value="planning">Planning / vendor selection</option>
                <option value="testing">Integration testing</option>
                <option value="live">Live with ASP</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Current invoice format
              </label>
              <select
                value={invFormat}
                onChange={(e) => setInvFormat(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="Peppol XML">Peppol BIS / XML</option>
                <option value="UBL">UBL 2.1 (non-Peppol)</option>
                <option value="PDF">PDF</option>
                <option value="Paper">Paper</option>
                <option value="Email">Email / unstructured</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Invoices / month
              </label>
              <input
                value={invPm}
                onChange={(e) => setInvPm(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="numeric"
                placeholder="e.g. 1200"
              />
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Accredited ASP appointed
              </label>
              <select
                value={aspYes ? "yes" : "no"}
                onChange={(e) => setAspYes(e.target.value === "yes")}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Master data quality
              </label>
              <select
                value={masterQ}
                onChange={(e) => setMasterQ(e.target.value as typeof masterQ)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="YES">Clean (TRN, addresses aligned)</option>
                <option value="PARTIAL">Partially clean</option>
                <option value="NO">Not clean</option>
              </select>
            </div>
            <div className="flex items-center gap-3 md:col-span-2">
              <input
                id="budget"
                type="checkbox"
                checked={budgetYes}
                onChange={(e) => setBudgetYes(e.target.checked)}
                className="rounded border-border w-4 h-4 accent-gold"
              />
              <label htmlFor="budget" className="text-[13px] text-muted cursor-pointer">
                ERP upgrade / programme budget confirmed (matches n8n intake flag)
              </label>
            </div>
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Business type (for B2C adjustment)
              </label>
              <select
                value={gapTx}
                onChange={(e) => setGapTx(e.target.value as TxType)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                <option value="B2B">B2B</option>
                <option value="B2G">B2G</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g hover:opacity-95"
              >
                Calculate readiness
              </button>
            </div>
          </form>

          {gapRun && (
            <div className="space-y-4 border-t border-border pt-6">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <div className="text-muted2 text-[11px] uppercase">Readiness score</div>
                  <div className="text-4xl font-mono text-white">{gapRun.score}</div>
                </div>
                <div>
                  <div className="text-muted2 text-[11px] uppercase">Engine urgency</div>
                  <div
                    className={`text-sm font-mono ${
                      gapRun.urgency === "RED"
                        ? "text-red"
                        : gapRun.urgency === "AMBER"
                          ? "text-amber"
                          : "text-green"
                    }`}
                  >
                    {gapRun.urgency}
                  </div>
                </div>
                <div>
                  <div className="text-muted2 text-[11px] uppercase">Est. programme cost</div>
                  <div className="text-sm text-gold-lt">{gapCostLabel}</div>
                </div>
                <div>
                  <div className="text-muted2 text-[11px] uppercase">Penalty exposure (demo)</div>
                  <div className="text-sm text-muted">{fmtAed(gapRun.penaltyExposure)}</div>
                </div>
              </div>
              <p className="text-sm text-muted">{gapRun.phaseLabel}</p>
              <p className="text-[12px] text-muted2">
                Days to ASP deadline:{" "}
                <span className="text-white font-mono">{gapRun.daysAsp}</span> · Days to go-live:{" "}
                <span className="text-white font-mono">{gapRun.daysLive}</span>
              </p>

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-[rgba(4,12,30,0.9)] text-muted2 uppercase text-[11px]">
                    <tr>
                      <th className="px-4 py-2">Severity</th>
                      <th className="px-4 py-2">Gap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gapRun.gaps.map((g, i) => (
                      <tr key={i} className="border-t border-border text-muted">
                        <td className="px-4 py-2 font-mono text-xs text-gold-lt">{g.level}</td>
                        <td className="px-4 py-2 text-white">{g.text}</td>
                      </tr>
                    ))}
                    {gapRun.gaps.length === 0 && (
                      <tr>
                        <td colSpan={2} className="px-4 py-3 text-muted">
                          No automated gaps — intake looks strong for this demo ruleset.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 2 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-4">
          <p className="text-[13px] text-muted">
            Paste invoice text (email body, OCR dump, or key/value pairs). Heuristic checks for
            PINT AE-style mandatory data — not a full XSD validator.
          </p>
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={12}
            className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-3 text-sm text-white font-mono focus:border-border-g focus:outline-none"
            placeholder="Seller TRN: ...&#10;Buyer name: ...&#10;Invoice No: ...&#10;..."
          />
          <button
            type="button"
            onClick={onValidate}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g"
          >
            Check mandatory fields
          </button>

          {validated && (
            <ul className="space-y-2 pt-2">
              {validated.map((f) => (
                <li
                  key={f.id}
                  className={`rounded-lg border px-4 py-3 text-[13px] ${
                    f.ok
                      ? "border-green/30 bg-[rgba(45,212,160,0.06)] text-green"
                      : "border-red/40 bg-[rgba(255,107,107,0.08)] text-red"
                  }`}
                >
                  <span className="font-medium">{f.ok ? "✓" : "✕"}</span> {f.label}
                  {!f.ok && <span className="block text-muted text-[12px] mt-1">{f.hint}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 3 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <h3 className="text-lg font-semibold text-white">90-day implementation runway</h3>
          <p className="text-[13px] text-muted">
            Static template — align owners with your steering group. Six phases × ~15 calendar days.
          </p>
          <ol className="space-y-4">
            {ROADMAP_PHASES.map((p, idx) => (
              <li
                key={p.title}
                className="rounded-xl border border-border bg-[rgba(4,12,30,0.45)] p-5"
              >
                <div className="flex flex-wrap items-baseline gap-2 mb-2">
                  <span className="font-mono text-xs text-gold-lt">Phase {idx + 1}</span>
                  <span className="text-muted2 text-[11px] uppercase">Days {p.days}</span>
                </div>
                <h4 className="text-white font-semibold mb-1">{p.title}</h4>
                <p className="text-[12px] text-muted2 mb-3">Owner: {p.owner}</p>
                <ul className="list-disc list-inside text-[13px] text-muted space-y-1">
                  {p.milestones.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
