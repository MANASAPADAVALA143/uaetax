"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { useCompanyId } from "@/hooks/useAuth";

/* ── Types ─────────────────────────────────────────────────────── */

type ReadinessLevel = "not_ready" | "partial" | "ready";
type LoadState = "idle" | "loading" | "ok" | "error";
type ToastState = { kind: "success" | "error"; message: string } | null;

interface AssessmentRecord {
  id: number;
  company_id: number;
  assessed_at: string;
  overall_score: number;
  readiness_level: ReadinessLevel;
  gap_areas: unknown[];
  recommendations: unknown[];
}

interface PhaseResult {
  phase: string;
  phase_label: string;
  annual_revenue_aed: number;
  mandatory_date: string;
  asp_registration_deadline: string;
  days_to_mandatory: number;
  days_to_asp_deadline: number;
  urgency_banner: boolean;
  urgency_message: string | null;
}

interface ValidationField {
  field: string;
  label: string;
  value?: string | number;
  message?: string;
  fix?: string;
}

interface ValidationResult {
  compliance_score: number;
  passed: ValidationField[];
  errors: ValidationField[];
  warnings: ValidationField[];
}

interface ReadinessCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

interface ReadinessResult {
  company_id: number;
  readiness_score: number;
  checks: ReadinessCheck[];
  action_items: string[];
  phase: PhaseResult | null;
}

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function scoreCardClass(score: number): string {
  if (score >= 90) return "border-green/40 bg-[rgba(45,212,160,0.08)]";
  if (score >= 60) return "border-amber/40 bg-[rgba(255,169,64,0.08)]";
  return "border-red/40 bg-[rgba(255,107,107,0.08)]";
}

function scoreTextClass(score: number): string {
  if (score >= 90) return "text-green";
  if (score >= 60) return "text-amber";
  return "text-red";
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function EInvoicingPage() {
  const companyId = useCompanyId();
  const [tab, setTab] = useState(0);
  const [toast, setToast] = useState<ToastState>(null);

  /* Assessment panel (existing n8n workflow) */
  const [summaryState, setSummaryState] = useState<LoadState>("loading");
  const [historyState, setHistoryState] = useState<LoadState>("loading");
  const [latestAssessment, setLatestAssessment] = useState<AssessmentRecord | null>(null);
  const [history, setHistory] = useState<AssessmentRecord[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerDisabledUntil, setTriggerDisabledUntil] = useState<number | null>(null);

  /* Tab 1 — Phase Calculator */
  const [revInput, setRevInput] = useState("");
  const [phaseLoading, setPhaseLoading] = useState(false);
  const [phaseResult, setPhaseResult] = useState<PhaseResult | null>(null);
  const [liveDaysAsp, setLiveDaysAsp] = useState<number | null>(null);
  const [liveDaysMandatory, setLiveDaysMandatory] = useState<number | null>(null);

  /* Tab 2 — Validate Invoice */
  const [valMode, setValMode] = useState<"form" | "xml">("form");
  const [invNumber, setInvNumber] = useState("");
  const [invDate, setInvDate] = useState("");
  const [sellerTrn, setSellerTrn] = useState("");
  const [buyerTrn, setBuyerTrn] = useState("");
  const [netAmount, setNetAmount] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [grossAmount, setGrossAmount] = useState("");
  const [vatCategory, setVatCategory] = useState("S");
  const [vatRate, setVatRate] = useState("5");
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [valLoading, setValLoading] = useState(false);
  const [valResult, setValResult] = useState<ValidationResult | null>(null);

  /* Tab 3 — Readiness Check */
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessResult, setReadinessResult] = useState<ReadinessResult | null>(null);

  /* Tab 4 — Generate XML */
  const [genNumber, setGenNumber] = useState("");
  const [genDate, setGenDate] = useState("");
  const [genSeller, setGenSeller] = useState("");
  const [genBuyer, setGenBuyer] = useState("");
  const [genNet, setGenNet] = useState("");
  const [genVat, setGenVat] = useState("");
  const [genGross, setGenGross] = useState("");
  const [genLoading, setGenLoading] = useState(false);

  const triggerCooldownSeconds = useMemo(() => {
    if (!triggerDisabledUntil) return 0;
    return Math.max(0, Math.ceil((triggerDisabledUntil - Date.now()) / 1000));
  }, [triggerDisabledUntil, isTriggering]);

  const isTriggerDisabled = isTriggering || triggerCooldownSeconds > 0;

  const toStringList = (value: unknown[]): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item)).filter((item) => item.trim().length > 0);
  };

  /* Live countdown for phase calculator */
  useEffect(() => {
    if (!phaseResult) return;
    const update = () => {
      const now = Date.now();
      const aspMs = new Date(phaseResult.asp_registration_deadline + "T23:59:59+04:00").getTime();
      const mandMs = new Date(phaseResult.mandatory_date + "T00:00:00+04:00").getTime();
      setLiveDaysAsp(Math.ceil((aspMs - now) / 86400000));
      setLiveDaysMandatory(Math.ceil((mandMs - now) / 86400000));
    };
    update();
    const timer = window.setInterval(update, 60000);
    return () => window.clearInterval(timer);
  }, [phaseResult]);

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
      if (triggerDisabledUntil <= Date.now()) setTriggerDisabledUntil(null);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [triggerDisabledUntil]);

  const fetchAssessments = async () => {
    setSummaryState("loading");
    setHistoryState("loading");
    setExpandedId(null);
    try {
      const [latestRes, historyRes] = await Promise.all([
        apiClient.get<AssessmentRecord[]>("/api/automations/assessments", { params: { limit: 1 } }),
        apiClient.get<AssessmentRecord[]>("/api/automations/assessments", { params: { limit: 10 } }),
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
    if (!companyId) return;
    fetchAssessments();
  }, [companyId]);

  const onRequestAssessment = async () => {
    setIsTriggering(true);
    try {
      await apiClient.post(`/api/automations/trigger/${companyId}`);
      setToast({ kind: "success", message: "Assessment requested — results will appear shortly" });
      setTriggerDisabledUntil(Date.now() + 60_000);
      await fetchAssessments();
    } catch {
      setToast({ kind: "error", message: "Failed to trigger — check n8n connection" });
    } finally {
      setIsTriggering(false);
    }
  };

  const onPhaseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhaseLoading(true);
    try {
      const revenue = parseFloat(String(revInput).replace(/,/g, "")) || 0;
      const res = await apiClient.post<PhaseResult>("/api/einvoicing/calculate-phase", {
        annual_revenue_aed: revenue,
      });
      setPhaseResult(res.data);
    } catch {
      setToast({ kind: "error", message: "Failed to calculate phase" });
    } finally {
      setPhaseLoading(false);
    }
  };

  const onValidate = async () => {
    setValLoading(true);
    setValResult(null);
    try {
      if (valMode === "xml" && xmlFile) {
        const form = new FormData();
        form.append("file", xmlFile);
        form.append("is_b2b", "true");
        const res = await apiClient.post<ValidationResult>("/api/einvoicing/validate-xml", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setValResult(res.data);
      } else {
        const res = await apiClient.post<ValidationResult>("/api/einvoicing/validate", {
          invoice_number: invNumber,
          invoice_date: invDate,
          seller_trn: sellerTrn,
          buyer_trn: buyerTrn,
          net_amount: parseFloat(netAmount) || 0,
          vat_amount: parseFloat(vatAmount) || 0,
          gross_amount: parseFloat(grossAmount) || 0,
          vat_category: vatCategory,
          vat_rate: parseFloat(vatRate) || 0,
          is_b2b: true,
        });
        setValResult(res.data);
      }
    } catch {
      setToast({ kind: "error", message: "Validation failed" });
    } finally {
      setValLoading(false);
    }
  };

  const fetchReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const res = await apiClient.get<ReadinessResult>(`/api/einvoicing/readiness/${companyId}`);
      setReadinessResult(res.data);
    } catch {
      setToast({ kind: "error", message: "Failed to load readiness check" });
    } finally {
      setReadinessLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (tab === 2) fetchReadiness();
  }, [tab, fetchReadiness]);

  const onGenerateXml = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenLoading(true);
    try {
      const res = await apiClient.post(
        "/api/einvoicing/generate-xml",
        {
          invoice_number: genNumber,
          invoice_date: genDate,
          seller_trn: genSeller,
          buyer_trn: genBuyer,
          net_amount: parseFloat(genNet) || 0,
          vat_amount: parseFloat(genVat) || 0,
          gross_amount: parseFloat(genGross) || 0,
        },
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice_${genNumber.replace(/\//g, "-")}.xml`;
      a.click();
      URL.revokeObjectURL(url);
      setToast({ kind: "success", message: "PINT AE XML downloaded" });
    } catch {
      setToast({ kind: "error", message: "XML generation failed — check amounts" });
    } finally {
      setGenLoading(false);
    }
  };

  /* Auto-calc gross when net/vat change in generator */
  useEffect(() => {
    const net = parseFloat(genNet);
    const vat = parseFloat(genVat);
    if (!isNaN(net) && !isNaN(vat)) {
      setGenGross((net + vat).toFixed(2));
    }
  }, [genNet, genVat]);

  /* Auto-set VAT rate when category changes */
  useEffect(() => {
    if (vatCategory === "S") setVatRate("5");
    else if (vatCategory === "Z" || vatCategory === "E") setVatRate("0");
  }, [vatCategory]);

  const TABS = ["Phase Calculator", "Validate Invoice", "Readiness Check", "Generate XML"];

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
        <h2 className="font-playfair text-[26px] font-bold">UAE Peppol / PINT AE</h2>
        <p className="text-[13px] text-muted mt-1 max-w-3xl">
          Phase calculator, PINT AE validator, ASP readiness checks, and UBL XML generator —
          aligned to Ministerial Decisions 243/244 (2025).
        </p>
      </div>

      {/* Urgency banner from phase result */}
      {phaseResult?.urgency_banner && (
        <div className="mb-6 rounded-xl border border-red/40 bg-[rgba(255,107,107,0.12)] px-5 py-4 flex items-start gap-3">
          <span className="text-red text-lg">⚠</span>
          <div>
            <p className="text-sm font-semibold text-red">Urgent — ASP deadline approaching</p>
            <p className="text-[13px] text-muted mt-1">{phaseResult.urgency_message}</p>
          </div>
        </div>
      )}

      {/* Existing n8n assessment panel */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Workflow assessment</h3>
            <p className="text-[13px] text-muted mt-1">Latest n8n readiness workflow outcome.</p>
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
                  {toStringList(latestAssessment.gap_areas).length > 0
                    ? toStringList(latestAssessment.gap_areas).map((gap, idx) => (
                        <li key={`${gap}-${idx}`}>{gap}</li>
                      ))
                    : <li>No major gaps identified.</li>}
                </ul>
              </div>
              <div>
                <h4 className="text-sm text-white font-semibold mb-2">Recommended actions</h4>
                <ol className="list-decimal list-inside text-[13px] text-muted space-y-1">
                  {toStringList(latestAssessment.recommendations).length > 0
                    ? toStringList(latestAssessment.recommendations).map((item, idx) => (
                        <li key={`${item}-${idx}`}>{item}</li>
                      ))
                    : <li>No recommendations available.</li>}
                </ol>
              </div>
            </div>
          </div>
        )}

        {historyState === "ok" && history.length > 0 && (
          <div className="pt-3 border-t border-border">
            <h4 className="text-sm text-white font-semibold mb-3">Assessment history</h4>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-[rgba(4,12,30,0.9)] text-muted2 uppercase text-[11px]">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Level</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr key={row.id} className="border-t border-border text-muted">
                      <td className="px-4 py-2 text-white">
                        {new Date(row.assessed_at).toLocaleDateString("en-GB", { timeZone: "Asia/Dubai" })}
                      </td>
                      <td className="px-4 py-2 font-mono">{row.overall_score}%</td>
                      <td className="px-4 py-2">{row.readiness_level.replace("_", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-3">
        {TABS.map((label, i) => (
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

      {/* Tab 1 — Phase Calculator */}
      {tab === 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <form onSubmit={onPhaseSubmit} className="grid gap-5 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Annual Revenue (AED)
              </label>
              <input
                value={revInput}
                onChange={(e) => setRevInput(e.target.value)}
                className="w-full max-w-md rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                inputMode="decimal"
                placeholder="e.g. 52000000"
                required
              />
            </div>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={phaseLoading}
                className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g hover:opacity-95 disabled:opacity-50"
              >
                {phaseLoading ? "Calculating..." : "Calculate Phase"}
              </button>
            </div>
          </form>

          {phaseResult && (
            <div className="border border-border rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`text-xs font-mono uppercase px-3 py-1 rounded-full border ${
                    phaseResult.phase === "phase_1"
                      ? "bg-[rgba(255,107,107,0.15)] border-red text-red"
                      : "bg-[rgba(255,169,64,0.12)] border-amber text-amber"
                  }`}
                >
                  {phaseResult.phase === "phase_1" ? "Phase 1" : "Phase 2"}
                </span>
                <span className="text-sm text-white">{phaseResult.phase_label}</span>
              </div>

              <p className="text-[13px] text-muted">
                Revenue: {fmtAed(phaseResult.annual_revenue_aed)}
              </p>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="rounded-lg bg-[rgba(4,12,30,0.6)] border border-border p-4">
                  <div className="text-muted2 text-[11px] uppercase mb-1">ASP Registration Deadline</div>
                  <div className="font-mono text-gold-lt text-2xl">{liveDaysAsp ?? phaseResult.days_to_asp_deadline} days</div>
                  <div className="text-muted text-[12px] mt-1">
                    {new Date(phaseResult.asp_registration_deadline).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "Asia/Dubai",
                    })}
                  </div>
                </div>
                <div className="rounded-lg bg-[rgba(4,12,30,0.6)] border border-border p-4">
                  <div className="text-muted2 text-[11px] uppercase mb-1">Mandatory Go-Live</div>
                  <div className="font-mono text-gold-lt text-2xl">{liveDaysMandatory ?? phaseResult.days_to_mandatory} days</div>
                  <div className="text-muted text-[12px] mt-1">
                    {new Date(phaseResult.mandatory_date).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                      timeZone: "Asia/Dubai",
                    })}
                  </div>
                </div>
              </div>

              {phaseResult.urgency_banner && (
                <div className="rounded-lg border border-amber/40 bg-[rgba(255,169,64,0.1)] px-4 py-3 text-[13px] text-amber">
                  {phaseResult.urgency_message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 2 — Validate Invoice */}
      {tab === 1 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setValMode("form")}
              className={`px-4 py-2 rounded-[10px] text-[13px] font-medium ${
                valMode === "form"
                  ? "bg-gold-pale text-gold-lt border border-border-g"
                  : "text-muted border border-border"
              }`}
            >
              Manual entry
            </button>
            <button
              type="button"
              onClick={() => setValMode("xml")}
              className={`px-4 py-2 rounded-[10px] text-[13px] font-medium ${
                valMode === "xml"
                  ? "bg-gold-pale text-gold-lt border border-border-g"
                  : "text-muted border border-border"
              }`}
            >
              Upload XML
            </button>
          </div>

          {valMode === "form" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { label: "Invoice Number (BT-1)", value: invNumber, set: setInvNumber, placeholder: "INV-2026-001" },
                { label: "Invoice Date (BT-2)", value: invDate, set: setInvDate, placeholder: "2026-06-01", type: "date" },
                { label: "Seller TRN (BT-31)", value: sellerTrn, set: setSellerTrn, placeholder: "100123456700003" },
                { label: "Buyer TRN (BT-48)", value: buyerTrn, set: setBuyerTrn, placeholder: "100987654300003" },
                { label: "Net Amount AED (BT-109)", value: netAmount, set: setNetAmount, placeholder: "10000.00", inputMode: "decimal" },
                { label: "VAT Amount AED (BT-110)", value: vatAmount, set: setVatAmount, placeholder: "500.00", inputMode: "decimal" },
                { label: "Gross Amount AED (BT-112)", value: grossAmount, set: setGrossAmount, placeholder: "10500.00", inputMode: "decimal" },
              ].map((f) => (
                <div key={f.label}>
                  <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">{f.label}</label>
                  <input
                    type={f.type || "text"}
                    value={f.value}
                    onChange={(e) => f.set(e.target.value)}
                    placeholder={f.placeholder}
                    inputMode={f.inputMode as "decimal" | undefined}
                    className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">VAT Category (BT-151)</label>
                <select
                  value={vatCategory}
                  onChange={(e) => setVatCategory(e.target.value)}
                  className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                >
                  <option value="S">S — Standard rated (5%)</option>
                  <option value="Z">Z — Zero rated</option>
                  <option value="E">E — Exempt</option>
                  <option value="AE">AE — Reverse charge</option>
                </select>
              </div>
              <div>
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">VAT Rate % (BT-117)</label>
                <input
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  inputMode="decimal"
                  className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Upload UBL 2.1 Invoice XML
              </label>
              <input
                type="file"
                accept=".xml,application/xml,text/xml"
                onChange={(e) => setXmlFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-[10px] file:border file:border-border-g file:bg-gold-pale file:text-gold-lt file:text-sm file:font-medium"
              />
            </div>
          )}

          <button
            type="button"
            onClick={onValidate}
            disabled={valLoading || (valMode === "xml" && !xmlFile)}
            className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50"
          >
            {valLoading ? "Validating..." : "Validate Invoice"}
          </button>

          {valResult && (
            <div className={`rounded-xl border p-6 space-y-4 ${scoreCardClass(valResult.compliance_score)}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Compliance Result</h3>
                <span className={`text-3xl font-mono font-bold ${scoreTextClass(valResult.compliance_score)}`}>
                  {valResult.compliance_score}%
                </span>
              </div>

              {valResult.passed.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase text-muted2 mb-2">Passed ({valResult.passed.length})</h4>
                  <ul className="space-y-1">
                    {valResult.passed.map((p) => (
                      <li key={p.field} className="text-[13px] text-green flex items-center gap-2">
                        <span>✓</span> {p.label} {p.value !== undefined && <span className="font-mono text-muted">({p.value})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {valResult.errors.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase text-muted2 mb-2">Errors ({valResult.errors.length})</h4>
                  <ul className="space-y-2">
                    {valResult.errors.map((e) => (
                      <li key={e.field} className="rounded-lg border border-red/30 bg-[rgba(255,107,107,0.06)] px-4 py-3 text-[13px]">
                        <span className="text-red font-medium">✕ {e.label}</span>
                        <p className="text-muted mt-1">{e.message}</p>
                        {e.fix && <p className="text-[12px] text-gold-lt mt-1">Fix: {e.fix}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {valResult.warnings.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase text-muted2 mb-2">Warnings</h4>
                  <ul className="space-y-1">
                    {valResult.warnings.map((w) => (
                      <li key={w.field} className="text-[13px] text-amber">⚠ {w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 3 — Readiness Check */}
      {tab === 2 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-muted">Five checks for ASP readiness based on your company data.</p>
            <button
              type="button"
              onClick={fetchReadiness}
              disabled={readinessLoading}
              className="px-4 py-2 rounded-[10px] text-[13px] font-medium border border-border-g text-gold-lt bg-gold-pale disabled:opacity-50"
            >
              {readinessLoading ? "Checking..." : "Refresh"}
            </button>
          </div>

          {readinessLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-[rgba(78,168,255,0.08)] animate-pulse" />
              ))}
            </div>
          )}

          {readinessResult && !readinessLoading && (
            <div className="space-y-6">
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-muted2 text-[11px] uppercase">Readiness Score</div>
                  <div className={`text-4xl font-mono font-bold ${scoreTextClass(readinessResult.readiness_score)}`}>
                    {readinessResult.readiness_score}%
                  </div>
                </div>
                {readinessResult.phase && (
                  <div className="text-sm text-muted">{readinessResult.phase.phase_label}</div>
                )}
              </div>

              <ul className="space-y-3">
                {readinessResult.checks.map((check) => (
                  <li
                    key={check.id}
                    className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
                      check.passed
                        ? "border-green/30 bg-[rgba(45,212,160,0.06)]"
                        : "border-red/30 bg-[rgba(255,107,107,0.06)]"
                    }`}
                  >
                    <span className={`text-lg ${check.passed ? "text-green" : "text-red"}`}>
                      {check.passed ? "✓" : "✕"}
                    </span>
                    <div>
                      <p className="text-sm text-white font-medium">{check.label}</p>
                      <p className="text-[12px] text-muted mt-0.5">{check.detail}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {readinessResult.action_items.length > 0 && (
                <div className="rounded-xl border border-amber/30 bg-[rgba(255,169,64,0.08)] p-5">
                  <h4 className="text-sm font-semibold text-amber mb-3">Action Items</h4>
                  <ol className="list-decimal list-inside text-[13px] text-muted space-y-1">
                    {readinessResult.action_items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab 4 — Generate XML */}
      {tab === 3 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 space-y-6">
          <p className="text-[13px] text-muted">
            Generate a PINT AE compliant UBL 2.1 Invoice XML from approved invoice details.
          </p>
          <form onSubmit={onGenerateXml} className="grid gap-4 md:grid-cols-2">
            {[
              { label: "Invoice Number", value: genNumber, set: setGenNumber, placeholder: "INV-2026-001", required: true },
              { label: "Invoice Date (YYYY-MM-DD)", value: genDate, set: setGenDate, placeholder: "2026-06-01", required: true },
              { label: "Seller TRN", value: genSeller, set: setGenSeller, placeholder: "100123456700003", required: true },
              { label: "Buyer TRN", value: genBuyer, set: setGenBuyer, placeholder: "100987654300003", required: true },
              { label: "Net Amount AED", value: genNet, set: setGenNet, placeholder: "10000.00", required: true, inputMode: "decimal" },
              { label: "VAT Amount AED", value: genVat, set: setGenVat, placeholder: "500.00", required: true, inputMode: "decimal" },
              { label: "Gross Amount AED", value: genGross, set: setGenGross, placeholder: "10500.00", required: true, inputMode: "decimal" },
            ].map((f) => (
              <div key={f.label}>
                <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">{f.label}</label>
                <input
                  value={f.value}
                  onChange={(e) => f.set(e.target.value)}
                  placeholder={f.placeholder}
                  required={f.required}
                  inputMode={f.inputMode as "decimal" | undefined}
                  className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
                />
              </div>
            ))}
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={genLoading}
                className="px-6 py-2.5 rounded-[10px] text-sm font-medium bg-gold-pale text-gold-lt border border-border-g disabled:opacity-50"
              >
                {genLoading ? "Generating..." : "Download XML"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
