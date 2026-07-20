"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

type ComplianceRating = "COMPLIANT" | "MINOR ISSUES" | "REQUIRES CORRECTION" | "HIGH RISK";
type RiskLevel = "HIGH" | "MEDIUM" | "LOW";

interface Finding {
  number: number;
  area: string;
  issue: string;
  transaction_ref: string;
  amount_aed: number;
  vat_impact_aed: number;
  risk: RiskLevel;
  action: string;
}

interface ExecutiveSummary {
  period: string;
  total_output_vat: number;
  total_input_vat: number;
  net_vat_position: number;
  net_vat_label: string;
  issues_count: number;
  compliance_rating: ComplianceRating;
  cfo_summary: string;
}

interface Vat201 {
  box_1a_standard_rated: number;
  box_1b_zero_rated: number;
  box_2_exempt: number;
  box_3_output_vat: number;
  box_9_input_vat: number;
  box_10_net_vat: number;
}

interface AuditTriggers {
  advance_payments: boolean;
  intercompany: boolean;
  deemed_supplies: boolean;
  bad_debt: boolean;
  late_registration_risk: boolean;
  deregistration_risk: boolean;
  blocked_input_tax: boolean;
  missing_trn: boolean;
}

interface AnalysisResult {
  executive_summary: ExecutiveSummary;
  findings: Finding[];
  vat201: Vat201;
  priority_actions: string[];
  audit_triggers: AuditTriggers;
  high_risk_found: boolean;
  disclosure_needed: boolean;
}

interface AnalyseResponse {
  analysis: AnalysisResult;
  row_count: number;
  pdf_base64: string;
  excel_base64: string;
  review_id: string;
}

const ENTITY_TYPES = [
  "Mainland UAE",
  "Free Zone",
  "Designated Zone",
  "Mixed (Mainland + Free Zone)",
] as const;

const AUDIT_LABELS: Record<keyof AuditTriggers, string> = {
  advance_payments: "VAT on advance payments received",
  intercompany: "VAT on intercompany transactions",
  deemed_supplies: "Deemed supplies (gifts/samples > AED 500)",
  bad_debt: "Bad debt adjustment claims",
  late_registration_risk: "Late registration penalty risk",
  deregistration_risk: "De-registration threshold check",
  blocked_input_tax: "Blocked input tax (vehicles, entertainment)",
  missing_trn: "Missing TRN on supplier invoices",
};

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function ratingStyle(rating: ComplianceRating): string {
  if (rating === "COMPLIANT") return "text-green border-green/40 bg-[rgba(45,212,160,0.12)]";
  if (rating === "MINOR ISSUES") return "text-amber border-amber/40 bg-[rgba(255,183,0,0.12)]";
  if (rating === "REQUIRES CORRECTION") return "text-orange-400 border-orange-400/40 bg-[rgba(255,140,0,0.1)]";
  return "text-red border-red/40 bg-[rgba(255,107,107,0.12)]";
}

function ratingEmoji(rating: ComplianceRating): string {
  if (rating === "COMPLIANT") return "🟢";
  if (rating === "MINOR ISSUES") return "🟡";
  if (rating === "REQUIRES CORRECTION") return "🟠";
  return "🔴";
}

function riskBadge(risk: RiskLevel): string {
  if (risk === "HIGH") return "text-red bg-[rgba(255,107,107,0.12)] border-red/30";
  if (risk === "MEDIUM") return "text-amber bg-[rgba(255,183,0,0.12)] border-amber/30";
  return "text-green bg-[rgba(45,212,160,0.12)] border-green/30";
}

function downloadBase64(base64: string, filename: string, mime: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function VatComplianceReviewPage() {
  const { activeCompany } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [period, setPeriod] = useState("Q2 2026 — Apr to Jun");
  const [companyTrn, setCompanyTrn] = useState("");
  const [entityType, setEntityType] = useState<string>(ENTITY_TYPES[0]);
  const [loading, setLoading] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyseResponse | null>(null);
  const [checkedActions, setCheckedActions] = useState<Record<number, boolean>>({});
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [disclosureText, setDisclosureText] = useState("");
  const [disclosurePdf, setDisclosurePdf] = useState<string | null>(null);
  const [disclosureLoading, setDisclosureLoading] = useState(false);
  const [lastReview, setLastReview] = useState<{
    review_id: string;
    period?: string;
    compliance_rating?: string;
    created_at?: string;
    source?: string;
  } | null>(null);
  const [loadingLastReview, setLoadingLastReview] = useState(true);

  const analysis = result?.analysis;
  const es = analysis?.executive_summary;

  useEffect(() => {
    if (activeCompany?.trn) setCompanyTrn(activeCompany.trn);
  }, [activeCompany?.trn]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get<{
          review: {
            review_id: string;
            period?: string;
            compliance_rating?: string;
            created_at?: string;
            source?: string;
          } | null;
          analysis?: AnalysisResult;
          row_count?: number;
          pdf_base64?: string;
          excel_base64?: string;
          review_id?: string;
        }>("/api/vat-compliance/latest", { params: { include_exports: false } });
        if (cancelled) return;
        if (data.review && data.analysis) {
          setLastReview(data.review);
          setResult({
            analysis: data.analysis,
            row_count: data.row_count ?? 0,
            pdf_base64: data.pdf_base64 ?? "",
            excel_base64: data.excel_base64 ?? "",
            review_id: data.review_id ?? data.review.review_id,
          });
          if (data.review.period) setPeriod(data.review.period);
        } else {
          setLastReview(null);
        }
      } catch {
        if (!cancelled) setLastReview(null);
      } finally {
        if (!cancelled) setLoadingLastReview(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeCompany?.company_id]);

  useEffect(() => {
    if (!loading) {
      setElapsedSec(0);
      return;
    }
    const start = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  const netPositive = useMemo(() => (es?.net_vat_position ?? 0) >= 0, [es]);

  const onFileChange = (f: File | null) => {
    setFile(f);
    setResult(null);
    setError(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileChange(dropped);
  }, []);

  const runReview = async (fromDb = false) => {
    if (!fromDb && !file) {
      setError("Please upload a transactions file.");
      return;
    }
    setLoading(true);
    setError(null);
    if (!fromDb) setResult(null);
    try {
      let data: AnalyseResponse;
      if (fromDb) {
        const form = new FormData();
        form.append("period", period);
        form.append("company_trn", companyTrn);
        form.append("entity_type", entityType);
        const res = await apiClient.post<AnalyseResponse>(
          "/api/vat-compliance/analyse-from-db",
          form,
          { timeout: 300_000 }
        );
        data = res.data;
        setResult(data);
      } else {
        const form = new FormData();
        form.append("file", file!);
        form.append("period", period);
        form.append("company_trn", companyTrn);
        form.append("entity_type", entityType);
        const res = await apiClient.post<AnalyseResponse>("/api/vat-compliance/analyse", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 300_000,
        });
        data = res.data;
        setResult(data);
      }
      setCheckedActions({});
      setLastReview({
        review_id: data.review_id,
        period,
        compliance_rating: data.analysis?.executive_summary?.compliance_rating,
        source: fromDb ? "smart_upload" : "manual",
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; response?: { data?: { detail?: string } } };
      if (err.code === "ECONNABORTED") {
        setError("Analysis timed out after 5 minutes. Try a smaller file (under 100 rows) or retry.");
      } else {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : err.message || "Compliance review failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const runReviewFromDb = () => runReview(true);

  const runReviewUpload = () => runReview(false);

  const ensureExports = async (): Promise<AnalyseResponse | null> => {
    if (result?.pdf_base64 && result?.excel_base64) return result;
    if (!result?.review_id) return result;
    try {
      const { data } = await apiClient.get<AnalyseResponse>("/api/vat-compliance/latest", {
        params: { include_exports: true },
        timeout: 120_000,
      });
      if (data.analysis) {
        const merged = { ...result, pdf_base64: data.pdf_base64, excel_base64: data.excel_base64 };
        setResult(merged);
        return merged;
      }
    } catch {
      /* keep existing result */
    }
    return result;
  };

  const draftDisclosure = async () => {
    if (!result || !analysis) return;
    setDisclosureLoading(true);
    try {
      const findingsSummary = analysis.findings
        .map((f) => `${f.transaction_ref}: ${f.issue} (${f.risk})`)
        .join("; ");
      const { data } = await apiClient.post<{ letter_text: string; letter_pdf_base64: string }>(
        "/api/vat-compliance/draft-disclosure",
        {
          review_id: result.review_id,
          company_name: activeCompany?.company_name ?? "Company",
          company_trn: companyTrn,
          findings_summary: findingsSummary,
          period,
        },
        { timeout: 120_000 }
      );
      setDisclosureText(data.letter_text);
      setDisclosurePdf(data.letter_pdf_base64);
      setShowDisclosure(true);
    } catch {
      setError("Could not draft disclosure letter.");
    } finally {
      setDisclosureLoading(false);
    }
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // VAT Compliance Review
        </div>
        <h2 className="font-playfair text-[26px] font-bold">UAE VAT Compliance Review</h2>
        <p className="text-[13px] text-muted mt-1">
          Full FTA compliance check — findings, VAT201 summary, and exportable reports
        </p>
        {lastReview && !loadingLastReview && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-green/30 bg-[rgba(45,212,160,0.08)] px-4 py-3 text-sm">
            <span className="text-green">
              Last review:{" "}
              {lastReview.created_at
                ? new Date(lastReview.created_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "recent"}
              {lastReview.compliance_rating ? ` — ${lastReview.compliance_rating}` : ""}
              {lastReview.source === "smart_upload" ? " (Smart Upload)" : ""}
            </span>
            {analysis && (
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 400, behavior: "smooth" })}
                className="text-gold font-semibold hover:text-gold-lt"
              >
                View Results ↓
              </button>
            )}
          </div>
        )}
      </div>

      {/* Section 1 — Upload */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border-g rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-1">UAE VAT Compliance Review</h3>
        <p className="text-[12px] text-muted mb-4">Upload your transactions file for a full FTA compliance check</p>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-border-g rounded-xl p-8 text-center cursor-pointer hover:border-gold/50 transition-colors mb-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          />
          <p className="text-muted text-sm">Drag & drop or click to upload</p>
          <p className="text-muted2 text-xs mt-1">.xlsx, .xls, .csv — max 10MB, 500 rows</p>
          {file && (
            <p className="text-gold text-sm mt-3 font-mono">
              📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label className="block text-[11px] text-muted2">
            Review Period
            <input
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
            />
          </label>
          <label className="block text-[11px] text-muted2">
            Company TRN
            <input
              value={companyTrn}
              onChange={(e) => setCompanyTrn(e.target.value)}
              placeholder="100xxxxxxxxxxxx"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm font-mono"
            />
          </label>
          <label className="block text-[11px] text-muted2">
            Entity Type
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs text-red border border-red/30 bg-[rgba(255,107,107,0.08)]">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={runReviewUpload}
          disabled={loading || !file}
          className="w-full py-3 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
        >
          {loading ? "Analysing transactions against FTA rules..." : "Run VAT Compliance Review"}
        </button>
        <button
          type="button"
          onClick={runReviewFromDb}
          disabled={loading}
          className="w-full mt-3 py-3 rounded-lg text-sm font-semibold border border-gold/40 text-gold hover:bg-gold-pale/10 disabled:opacity-50"
        >
          {loading ? "Analysing..." : "Run from Classified Transactions (VAT Classifier)"}
        </button>
        {loading && (
          <p className="text-center text-xs text-muted mt-2 animate-pulse">
            Claude is reviewing all transactions — {elapsedSec}s elapsed (typically 30–90s, large files up to 3 min)
          </p>
        )}
        {result && (
          <p className="text-center text-xs text-muted mt-2">
            Analysed {result.row_count} transaction{result.row_count === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {analysis && es && (
        <>
          {/* Section 2 — Executive Summary */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">Executive Summary</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
              {[
                { label: "Total Output VAT", value: fmtAed(es.total_output_vat), color: "text-blue" },
                { label: "Total Input VAT", value: fmtAed(es.total_input_vat), color: "text-blue" },
                {
                  label: "Net VAT Position",
                  value: fmtAed(Math.abs(es.net_vat_position)),
                  color: netPositive ? "text-gold" : "text-green",
                },
                {
                  label: "Issues Found",
                  value: String(es.issues_count),
                  color: es.issues_count > 0 ? "text-red" : "text-green",
                },
              ].map((tile) => (
                <div key={tile.label} className="rounded-xl border border-border p-4">
                  <p className="text-[10px] text-muted2 uppercase font-mono">{tile.label}</p>
                  <p className={`text-xl font-bold font-mono mt-1 ${tile.color}`}>{tile.value}</p>
                </div>
              ))}
            </div>
            <div className={`text-center py-4 px-6 rounded-xl border text-lg font-bold ${ratingStyle(es.compliance_rating)}`}>
              {ratingEmoji(es.compliance_rating)} {es.compliance_rating}
            </div>
            {es.cfo_summary && (
              <p className="text-[13px] text-muted mt-4 leading-relaxed">{es.cfo_summary}</p>
            )}
          </div>

          {/* Section 3 — Findings */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6 overflow-x-auto">
            <h3 className="text-sm font-semibold text-white mb-4">Compliance Findings</h3>
            {analysis.findings.length === 0 ? (
              <p className="text-green text-sm">✅ No issues found</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-muted2 border-b border-border">
                    {["#", "Area", "Issue Found", "Transaction Ref", "Amount (AED)", "VAT Impact (AED)", "Risk", "Action Required"].map(
                      (h) => (
                        <th key={h} className="text-left py-2 pr-3 font-mono text-[10px] uppercase">
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  {analysis.findings.map((f) => (
                    <tr key={f.number} className="border-b border-border/50 text-muted">
                      <td className="py-2 pr-3">{f.number}</td>
                      <td className="py-2 pr-3">{f.area}</td>
                      <td className="py-2 pr-3 max-w-[200px]">{f.issue}</td>
                      <td className="py-2 pr-3 font-mono">{f.transaction_ref}</td>
                      <td className="py-2 pr-3 font-mono">{fmtAed(f.amount_aed)}</td>
                      <td className="py-2 pr-3 font-mono">{fmtAed(f.vat_impact_aed)}</td>
                      <td className="py-2 pr-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${riskBadge(f.risk)}`}>
                          {f.risk === "HIGH" ? "🔴" : f.risk === "MEDIUM" ? "🟡" : "🟢"} {f.risk}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{f.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Section 4 — VAT201 */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">VAT201 Return Summary</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted2 border-b border-border">
                  <th className="text-left py-2 font-mono text-[10px]">Box</th>
                  <th className="text-left py-2 font-mono text-[10px]">Description</th>
                  <th className="text-right py-2 font-mono text-[10px]">Amount (AED)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["1a", "Standard rated supplies", analysis.vat201.box_1a_standard_rated],
                  ["1b", "Zero-rated supplies", analysis.vat201.box_1b_zero_rated],
                  ["2", "Exempt supplies", analysis.vat201.box_2_exempt],
                  ["3", "Output VAT", analysis.vat201.box_3_output_vat],
                  ["9", "Recoverable input VAT", analysis.vat201.box_9_input_vat],
                  ["10", "NET VAT PAYABLE / (REFUNDABLE)", analysis.vat201.box_10_net_vat],
                ].map(([box, desc, amt]) => (
                  <tr
                    key={box}
                    className={`border-b border-border/50 ${box === "10" ? (netPositive ? "bg-gold/5" : "bg-green/5") : ""}`}
                  >
                    <td className="py-2 font-mono text-gold">{box}</td>
                    <td className="py-2 text-muted">{desc}</td>
                    <td className={`py-2 text-right font-mono ${box === "10" ? (netPositive ? "text-gold font-bold" : "text-green font-bold") : "text-white"}`}>
                      {fmtAed(Number(amt))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Section 5 — Priority Actions */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">Priority Actions Before Filing</h3>
            <ol className="space-y-3">
              {analysis.priority_actions.map((action, i) => (
                <li key={i} className="flex items-start gap-3 text-[13px] text-muted">
                  <input
                    type="checkbox"
                    checked={!!checkedActions[i]}
                    onChange={(e) => setCheckedActions((prev) => ({ ...prev, [i]: e.target.checked }))}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="text-white">{i + 1}. {action}</span>
                    <p className="text-[11px] text-muted2 mt-0.5">Before VAT return submission</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Section 6 — Audit Triggers */}
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">FTA Audit Triggers — Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(Object.keys(AUDIT_LABELS) as Array<keyof AuditTriggers>).map((key) => {
                const flagged = analysis.audit_triggers[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-2 text-[13px] px-3 py-2 rounded-lg border ${
                      flagged ? "border-red/30 text-red" : "border-green/30 text-green"
                    }`}
                  >
                    {flagged ? "⚠️" : "✅"} {AUDIT_LABELS[key]}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 7 — Export */}
          <div className="flex flex-wrap gap-3 mb-8">
            <button
              type="button"
              onClick={async () => {
                const exp = await ensureExports();
                if (exp?.pdf_base64) {
                  downloadBase64(exp.pdf_base64, `vat_compliance_${period.replace(/\s/g, "_")}.pdf`, "application/pdf");
                }
              }}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep"
            >
              📄 Download PDF Report
            </button>
            <button
              type="button"
              onClick={async () => {
                const exp = await ensureExports();
                if (exp?.excel_base64) {
                  downloadBase64(
                    exp.excel_base64,
                    `vat_compliance_${period.replace(/\s/g, "_")}.xlsx`,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  );
                }
              }}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-border-g text-gold hover:bg-gold-pale"
            >
              📊 Download Excel
            </button>
            {analysis.high_risk_found && (
              <button
                type="button"
                onClick={draftDisclosure}
                disabled={disclosureLoading}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-red/40 text-red hover:bg-red/10 disabled:opacity-50"
              >
                {disclosureLoading ? "Drafting..." : "✉️ Draft FTA Disclosure Letter"}
              </button>
            )}
          </div>
        </>
      )}

      {showDisclosure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-card border border-border rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">FTA Voluntary Disclosure Letter</h3>
              <button type="button" onClick={() => setShowDisclosure(false)} className="text-muted hover:text-white">
                ✕
              </button>
            </div>
            <pre className="text-[13px] text-muted whitespace-pre-wrap leading-relaxed mb-4">{disclosureText}</pre>
            {disclosurePdf && (
              <button
                type="button"
                onClick={() => downloadBase64(disclosurePdf, "fta_disclosure_letter.pdf", "application/pdf")}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep"
              >
                Download Letter PDF
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
