"use client";

import { useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import Link from "next/link";

type Stage = "idle" | "uploading" | "extracting" | "classifying" | "done" | "error";

interface RiskFlag {
  flag_id: number;
  flag: string;
  category: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  title: string;
  what_is_wrong: string;
  action_required: string;
  uae_law_reference: string;
  vat_at_risk_aed: number;
}

interface ProcessedInvoice {
  invoice_id: number;
  filename: string;
  vendor_name?: string;
  vendor_trn?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_aed?: number;
  vat_amount_aed?: number;
  vat_treatment?: string;
  confidence?: number;
  risk_flags: RiskFlag[];
  overall_risk: string;
  risk_score?: number;
  recommendation?: string;
  auto_approved?: boolean;
  transactions_created?: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  MEDIUM: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  LOW: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
  high: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  medium: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  low: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
};

const RISK_BADGE: Record<string, string> = {
  clear: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  review: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  escalate: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
};

const VAT_BADGE: Record<string, string> = {
  standard_rated: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  zero_rated: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
  exempt: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  reverse_charge: "bg-[rgba(200,100,255,0.12)] text-purple-300 border-purple-400/30",
  out_of_scope: "bg-[rgba(255,255,255,0.06)] text-muted border-border",
};

export default function InvoiceFlowPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [results, setResults] = useState<ProcessedInvoice[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const valid = Array.from(incoming).filter((f) =>
      ["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(f.type)
    );
    setFiles((prev) => [...prev, ...valid]);
    setStage("idle");
    setErrorMsg(null);
  };

  const removeFile = (idx: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== idx));

  const handleProcess = async () => {
    if (!files.length) return;
    setStage("uploading");
    setErrorMsg(null);
    setResults([]);

    const processed: ProcessedInvoice[] = [];

    for (const file of files) {
      try {
        // Step 1: Extract
        setStage("extracting");
        const form = new FormData();
        form.append("file", file);
        const extractRes = await apiClient.post("/api/invoice/extract", form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 60_000,
        });
        const { invoice_id, extracted } = extractRes.data;

        // Step 2: Classify + risk
        setStage("classifying");
        const riskRes = await apiClient.post("/api/invoice/classify-and-risk", {
          invoice_id,
          extracted,
        });
        const { vat_result, risk_flags, overall_risk, auto_approved, transactions_created } = riskRes.data;

        processed.push({
          invoice_id,
          filename: file.name,
          vendor_name: extracted.vendor_name,
          vendor_trn: extracted.vendor_trn,
          invoice_number: extracted.invoice_number,
          invoice_date: extracted.invoice_date,
          total_aed: extracted.total_aed,
          vat_amount_aed: extracted.vat_amount_aed,
          vat_treatment: vat_result.vat_treatment,
          confidence: vat_result.confidence,
          risk_flags: risk_flags || [],
          overall_risk,
          risk_score: riskRes.data.risk_score,
          recommendation: riskRes.data.recommendation,
          auto_approved: auto_approved || false,
          transactions_created: transactions_created || 0,
        });
      } catch (e: unknown) {
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          `Failed to process ${file.name}`;
        processed.push({
          invoice_id: 0,
          filename: file.name,
          risk_flags: [{ flag_id: 0, flag: "error", category: "error", severity: "HIGH", title: "Processing Error", what_is_wrong: String(msg), action_required: "Check file and retry", uae_law_reference: "", vat_at_risk_aed: 0 }],
          overall_risk: "escalate",
        });
      }
    }

    setResults(processed);
    setStage("done");
  };

  const STAGES = ["uploading", "extracting", "classifying", "done"];
  const stageIdx = STAGES.indexOf(stage);
  const stageLabels = ["Uploading", "Extracting fields", "Classifying VAT + risks", "Complete"];

  return (
    <>
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Invoice Flow
          </div>
          <h2 className="font-playfair text-[26px] font-bold">AI Invoice Processor</h2>
          <p className="text-[13px] text-muted mt-1">
            Upload PDF or image invoices · Claude extracts, classifies VAT, flags AP risks
          </p>
        </div>
        <Link
          href="/dashboard/invoice-flow/review"
          className="px-4 py-2 rounded-[10px] text-sm font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-90 transition"
        >
          Review Queue →
        </Link>
      </div>

      {/* Upload zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer mb-6 ${
          dragging
            ? "border-gold bg-gold-pale"
            : "border-border hover:border-border-g hover:bg-[rgba(201,168,76,0.04)]"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <div className="text-4xl mb-3">📄</div>
        <p className="text-white font-medium mb-1">Drop invoices here or click to browse</p>
        <p className="text-[13px] text-muted">PDF, JPG, PNG, WebP · Multiple files supported</p>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6 space-y-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-white">{files.length} file{files.length > 1 ? "s" : ""} selected</span>
            <button onClick={() => setFiles([])} className="text-[12px] text-muted2 hover:text-red transition">Clear all</button>
          </div>
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-3 rounded-[10px] bg-[rgba(4,12,30,0.5)] border border-border px-4 py-2.5">
              <span className="text-lg">{f.type === "application/pdf" ? "📕" : "🖼️"}</span>
              <span className="text-[13px] text-white flex-1 truncate">{f.name}</span>
              <span className="text-[11px] text-muted2">{(f.size / 1024).toFixed(0)} KB</span>
              <button onClick={() => removeFile(i)} className="text-muted2 hover:text-red text-sm transition">✕</button>
            </div>
          ))}

          {/* Progress bar */}
          {stage !== "idle" && stage !== "error" && (
            <div className="pt-4">
              <div className="flex gap-1 mb-2">
                {stageLabels.map((label, i) => (
                  <div
                    key={label}
                    className={`flex-1 text-center text-[10px] py-1 rounded font-mono transition-all ${
                      i < stageIdx
                        ? "bg-green/20 text-green"
                        : i === stageIdx
                        ? "bg-gold/20 text-gold-lt animate-pulse"
                        : "bg-[rgba(255,255,255,0.04)] text-muted2"
                    }`}
                  >
                    {i < stageIdx ? "✓ " : ""}{label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={handleProcess}
            disabled={stage !== "idle" && stage !== "done" && stage !== "error"}
            className="w-full mt-2 py-3 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {stage === "uploading" ? "Uploading…"
              : stage === "extracting" ? "Extracting with Claude Vision…"
              : stage === "classifying" ? "Classifying VAT + checking risks…"
              : stage === "done" ? "Process more files"
              : "🚀 Process invoices"}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red mb-6">
          {errorMsg}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-white">Results</h3>
          {results.map((inv, i) => (
            <div key={i} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">{inv.vendor_name || inv.filename}</p>
                  <p className="text-[12px] text-muted2 font-mono">{inv.filename}</p>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {inv.vat_treatment && (
                    <span className={`text-[11px] px-2 py-1 rounded-full border font-mono ${VAT_BADGE[inv.vat_treatment] || VAT_BADGE.out_of_scope}`}>
                      {inv.vat_treatment.replace(/_/g, " ")}
                    </span>
                  )}
                  <span className={`text-[11px] px-2 py-1 rounded-full border font-mono ${RISK_BADGE[inv.overall_risk] || ""}`}>
                    {inv.overall_risk}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
                <div><span className="text-muted2 block">Invoice #</span><span className="text-white font-mono">{inv.invoice_number || "—"}</span></div>
                <div><span className="text-muted2 block">Date</span><span className="text-white">{inv.invoice_date || "—"}</span></div>
                <div><span className="text-muted2 block">Total AED</span><span className="text-white font-mono">{inv.total_aed ? `${inv.total_aed.toLocaleString("en-AE")}` : "—"}</span></div>
                <div><span className="text-muted2 block">AI Confidence</span><span className="text-white">{inv.confidence ? `${(inv.confidence * 100).toFixed(0)}%` : "—"}</span></div>
              </div>

              {/* Risk score bar */}
              {inv.risk_score !== undefined && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted2 uppercase tracking-wide">Risk Score</span>
                    <span className={`font-mono font-bold ${inv.risk_score >= 60 ? "text-red" : inv.risk_score >= 30 ? "text-amber" : "text-green"}`}>
                      {inv.risk_score}/100 — {inv.overall_risk}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${inv.risk_score >= 60 ? "bg-red" : inv.risk_score >= 30 ? "bg-amber" : "bg-green"}`}
                      style={{ width: `${inv.risk_score}%` }}
                    />
                  </div>
                  {inv.recommendation && (
                    <p className="text-[11px] text-muted2 italic">{inv.recommendation}</p>
                  )}
                </div>
              )}

              {inv.risk_flags.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] text-muted2 uppercase tracking-wide">{inv.risk_flags.length} Anomaly Flag{inv.risk_flags.length > 1 ? "s" : ""} Detected</p>
                  {inv.risk_flags.map((rf, j) => (
                    <div key={j} className={`rounded-[10px] border px-4 py-3 space-y-1.5 ${SEVERITY_COLORS[rf.severity]}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase font-bold flex-shrink-0 opacity-80">{rf.severity}</span>
                        <span className="text-[13px] font-semibold">{rf.title || rf.flag}</span>
                        {rf.vat_at_risk_aed > 0 && (
                          <span className="ml-auto text-[11px] font-mono opacity-80 flex-shrink-0">
                            AED {rf.vat_at_risk_aed.toLocaleString("en-AE")} at risk
                          </span>
                        )}
                      </div>
                      {rf.what_is_wrong && <p className="text-[12px] opacity-90">{rf.what_is_wrong}</p>}
                      {rf.action_required && (
                        <p className="text-[11px] opacity-75">→ {rf.action_required}</p>
                      )}
                      {rf.uae_law_reference && (
                        <p className="text-[10px] font-mono opacity-60">📋 {rf.uae_law_reference}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-approval confirmation (score < 30) */}
              {inv.auto_approved && (
                <div className="rounded-[10px] border border-green/30 bg-[rgba(45,212,160,0.08)] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-green text-base">✓</span>
                    <div>
                      <p className="text-green text-[13px] font-medium">
                        Auto-approved · {inv.transactions_created} transaction{inv.transactions_created !== 1 ? "s" : ""} added to VAT Classifier
                      </p>
                      <p className="text-[11px] text-muted2 mt-0.5">Risk score {inv.risk_score}/100 — below threshold · no human review needed</p>
                    </div>
                  </div>
                  <Link
                    href="/dashboard/vat-classifier"
                    className="text-[12px] text-gold-lt hover:underline font-medium flex-shrink-0"
                  >
                    View in VAT Classifier →
                  </Link>
                </div>
              )}

              {inv.invoice_id > 0 && (
                <div className="flex gap-2 pt-1">
                  {!inv.auto_approved && (
                    <Link
                      href="/dashboard/invoice-flow/review"
                      className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium border border-border-g text-gold-lt bg-gold-pale hover:opacity-90 transition"
                    >
                      {(inv.risk_score ?? 0) > 60 ? "⚠ Go to Review Queue (Hard Block)" : "Go to Review Queue"}
                    </Link>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && stage === "idle" && files.length === 0 && (
        <div className="text-center py-16 text-muted2 text-[14px]">
          <div className="text-5xl mb-4">🧾</div>
          <p>Upload your first invoice to get started</p>
          <p className="text-[12px] mt-1">Claude will extract all fields and flag AP risks automatically</p>
        </div>
      )}
    </>
  );
}
