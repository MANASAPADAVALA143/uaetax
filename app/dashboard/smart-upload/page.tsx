"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface TransactionResults {
  count: number;
  classified: number;
  auto_approved: number;
  review_required: number;
  blocked: number;
  compliance_rating?: string | null;
  issues_found?: number;
  period?: string;
  review_id?: string;
}

interface AdvanceResults {
  count: number;
  total_vat_at_advance: number;
  total_vat_at_delivery: number;
}

interface CtResults {
  accounting_profit?: number;
  taxable_income?: number;
  tax_payable?: number;
  esr_substance?: number;
}

interface ComplianceResults {
  compliance_rating?: string | null;
  issues_found?: number;
  review_id?: string;
  period?: string;
  high_risk_found?: boolean;
  row_count?: number;
  error?: string;
}

interface VatReturnResults {
  ready: boolean;
  period?: string;
  message?: string;
}

interface SmartUploadResponse {
  filename: string;
  sheet_count: number;
  sheets_detected: string[];
  results: {
    transactions?: TransactionResults;
    advance_payments?: AdvanceResults;
    vat_compliance_review?: ComplianceResults;
    vat_return?: VatReturnResults;
    ct_esr?: CtResults;
  };
  redirect_hints: {
    primary: string;
    also_ready: string[];
  };
}

const PROGRESS_STEPS = [
  "Reading Excel sheets…",
  "Detecting sheet types…",
  "Classifying transactions…",
  "Running VAT Compliance Review…",
  "Processing advance payments…",
  "All done!",
];

function fmtAed(n: number): string {
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function ratingClass(rating: string | null | undefined): string {
  if (!rating) return "text-muted border-border bg-[rgba(78,168,255,0.08)]";
  if (rating === "COMPLIANT") return "text-green border-green/40 bg-[rgba(45,212,160,0.12)]";
  if (rating === "HIGH RISK") return "text-red border-red/40 bg-[rgba(248,113,113,0.12)]";
  return "text-amber border-amber/40 bg-[rgba(251,191,36,0.12)]";
}

export default function SmartUploadPage() {
  const { activeCompany } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progressStep, setProgressStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SmartUploadResponse | null>(null);

  const acceptFile = useCallback((f: File | null) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Only Excel files (.xlsx, .xls) are supported.");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("File exceeds 10MB limit.");
      return;
    }
    setError(null);
    setResult(null);
    setFile(f);
  }, []);

  const runUpload = async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    setProgressStep(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < PROGRESS_STEPS.length - 1; i++) {
      timers.push(setTimeout(() => setProgressStep(i), i * 2200));
    }

    try {
      const form = new FormData();
      form.append("file", file);
      if (activeCompany?.trn) form.append("company_trn", activeCompany.trn);

      const { data } = await apiClient.post<SmartUploadResponse>("/api/smart-upload/", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 180_000,
      });
      setProgressStep(PROGRESS_STEPS.length - 1);
      setResult(data);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        (err instanceof Error ? err.message : "Upload failed");
      setError(typeof msg === "string" ? msg : JSON.stringify(msg));
      setProgressStep(-1);
    } finally {
      timers.forEach(clearTimeout);
      setUploading(false);
    }
  };

  const tx = result?.results.transactions;
  const compliance = result?.results.vat_compliance_review;
  const vatReturn = result?.results.vat_return;
  const adv = result?.results.advance_payments;
  const ct = result?.results.ct_esr;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="font-playfair text-3xl font-black text-white mb-2">Smart Upload</h1>
        <p className="text-muted text-sm max-w-2xl">
          Drop your UAE Tax Master Excel file — the app reads every sheet and routes data to VAT Classifier,
          Compliance Review, Advance Payments, and Corporate Tax automatically.
        </p>
      </div>

      {/* Upload zone */}
      {!result && (
        <section className="mb-8">
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            onClick={() => !uploading && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files[0] ?? null);
            }}
            className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-gold bg-gold-pale/20"
                : "border-[rgba(200,169,81,0.45)] bg-gradient-to-br from-[#071228] to-card hover:border-gold hover:bg-gold-pale/10"
            } ${uploading ? "pointer-events-none opacity-70" : ""}`}
          >
            <div className="text-5xl mb-4">📂</div>
            <h2 className="font-playfair text-xl font-bold text-white mb-2">Drop your Excel file here</h2>
            <p className="text-muted text-sm mb-4">
              UAE Tax reads all sheets and automatically routes to the right modules
            </p>
            <p className="text-xs text-muted2 font-mono">.xlsx · .xls · max 10MB</p>
            {file && (
              <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[rgba(30,58,95,0.5)] border border-border text-sm text-gold-lt">
                <span>📄</span>
                <span>{file.name}</span>
                <span className="text-muted2">({(file.size / 1024).toFixed(0)} KB)</span>
              </div>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {file && !uploading && progressStep < 0 && (
            <button
              type="button"
              onClick={runUpload}
              className="mt-6 w-full py-3.5 rounded-xl text-sm font-bold bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px transition-all"
            >
              Process Master File
            </button>
          )}

          {error && (
            <p className="mt-4 text-sm text-red bg-[rgba(248,113,113,0.1)] border border-red/30 rounded-lg px-4 py-3">
              {error}
            </p>
          )}
        </section>
      )}

      {/* Progress */}
      {uploading && (
        <section className="mb-8 rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-8">
          <h3 className="text-sm uppercase tracking-wider text-muted font-mono mb-6">Processing…</h3>
          <ul className="space-y-3">
            {PROGRESS_STEPS.map((step, i) => {
              const done = i <= progressStep;
              const active = i === progressStep;
              return (
                <li
                  key={step}
                  className={`flex items-center gap-3 text-sm transition-all ${
                    done ? "text-white" : "text-muted2"
                  }`}
                >
                  <span className={`w-6 text-center ${done ? "text-green" : active ? "animate-pulse" : ""}`}>
                    {done ? "✅" : active ? "⏳" : "○"}
                  </span>
                  {step}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Results */}
      {result && (
        <section className="space-y-5">
          <div className="rounded-xl border border-green/30 bg-[rgba(45,212,160,0.08)] px-4 py-3 text-sm text-green">
            Processed <strong>{result.filename}</strong> — {result.sheet_count} sheet
            {result.sheet_count !== 1 ? "s" : ""} read, {result.sheets_detected.length} module
            {result.sheets_detected.length !== 1 ? "s" : ""} populated
          </div>

          {tx && tx.count > 0 && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-playfair text-lg font-bold text-white">VAT Classifier</h3>
                  <p className="text-muted text-sm mt-1">{tx.classified} transactions classified</p>
                </div>
                <span className="text-2xl">📊</span>
              </div>
              <div className="flex flex-wrap gap-2 mb-5">
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-green bg-[rgba(45,212,160,0.12)] border border-green/30">
                  {tx.auto_approved} Auto-Approved
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-amber bg-[rgba(251,191,36,0.12)] border border-amber/30">
                  {tx.review_required} Review Required
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-semibold text-red bg-[rgba(248,113,113,0.12)] border border-red/30">
                  {tx.blocked} Blocked
                </span>
              </div>
              <Link
                href="/dashboard/vat-classifier"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → View in VAT Classifier
              </Link>
            </div>
          )}

          {compliance && !compliance.error && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-playfair text-lg font-bold text-white">VAT Compliance Review</h3>
                  {compliance.compliance_rating && (
                    <span
                      className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold border ${ratingClass(compliance.compliance_rating)}`}
                    >
                      {compliance.compliance_rating}
                    </span>
                  )}
                  <p className="text-muted text-sm mt-2">{compliance.issues_found ?? 0} issues found</p>
                  {compliance.period && (
                    <p className="text-muted2 text-xs mt-1 font-mono">{compliance.period}</p>
                  )}
                </div>
                <span className="text-2xl">🔍</span>
              </div>
              <Link
                href="/dashboard/vat-compliance-review"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → View Report
              </Link>
            </div>
          )}

          {compliance?.error && (
            <div className="rounded-2xl border border-amber/30 bg-[rgba(251,191,36,0.08)] p-4 text-sm text-amber">
              Compliance review could not run: {compliance.error}
            </div>
          )}

          {adv && adv.count > 0 && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-playfair text-lg font-bold text-white">Advance Payments</h3>
                  <p className="text-muted text-sm mt-1">{adv.count} advance payments loaded</p>
                  <p className="text-gold-lt text-sm mt-2 font-mono">
                    Total VAT at advance: {fmtAed(adv.total_vat_at_advance)}
                  </p>
                  <p className="text-muted text-xs font-mono">
                    VAT at delivery: {fmtAed(adv.total_vat_at_delivery)}
                  </p>
                </div>
                <span className="text-2xl">💰</span>
              </div>
              <Link
                href="/dashboard/advance-payment"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → View Tracker
              </Link>
            </div>
          )}

          {vatReturn?.ready && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-[#1E3A5F]/40 to-card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-playfair text-lg font-bold text-white">VAT Return Ready</h3>
                  <p className="text-muted text-sm mt-1">
                    {vatReturn.message ?? `${vatReturn.period ?? "Current period"} return ready to generate`}
                  </p>
                </div>
                <span className="text-2xl">📋</span>
              </div>
              <Link
                href="/dashboard/vat-return"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → Generate Return
              </Link>
            </div>
          )}

          {ct && Object.keys(ct).length > 0 && (
            <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-playfair text-lg font-bold text-white">Corporate Tax / ESR</h3>
                  <ul className="text-sm text-muted mt-2 space-y-1 font-mono">
                    {ct.accounting_profit != null && (
                      <li>Accounting profit: {fmtAed(ct.accounting_profit)}</li>
                    )}
                    {ct.taxable_income != null && <li>Taxable income: {fmtAed(ct.taxable_income)}</li>}
                    {ct.tax_payable != null && <li>Tax payable: {fmtAed(ct.tax_payable)}</li>}
                  </ul>
                </div>
                <span className="text-2xl">🏛️</span>
              </div>
              <Link
                href="/dashboard/corporate-tax"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → Open Corporate Tax
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6">
            <h3 className="font-playfair text-lg font-bold text-white mb-3">Modules Auto-Populated</h3>
            <ul className="text-sm text-muted space-y-1 mb-5">
              <li>✅ FTA Reports</li>
              <li>✅ Supplier Ledger</li>
              {result.sheets_detected.includes("transactions") && <li>✅ VAT Classifier</li>}
              {result.sheets_detected.includes("advance_payments") && <li>✅ Advance Payment VAT</li>}
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 text-sm font-semibold text-gold hover:text-gold-lt transition-colors"
              >
                → Go to Dashboard
              </Link>
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setFile(null);
                  setProgressStep(-1);
                }}
                className="text-sm text-muted hover:text-white transition-colors"
              >
                Upload another file
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
