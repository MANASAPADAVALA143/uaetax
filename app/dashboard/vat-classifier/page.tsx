"use client";

export const dynamic = "force-dynamic";

import { useState, useRef, useEffect, useCallback } from "react";
import axios from "axios";
import { apiClient } from "@/lib/api";

interface ClassificationResult {
  description: string;
  vendor?: string;
  amount: string;
  vat_treatment: string;
  confidence: number;
  reasoning?: string;
}

interface SavedTransaction {
  id: number;
  date: string;
  description: string;
  vendor_or_customer?: string;
  amount_aed: number;
  vat_treatment: string;
  transaction_type: string;
  vat_amount_aed: number;
  confidence_score?: number;
  is_verified: boolean;
  source?: string;         // "vat_classifier" | "invoice_flow_auto" | "invoice_flow_reviewed"
  source_invoice_id?: number | null;
}

type SourceFilter = "all" | "vat_classifier" | "invoice_flow_auto" | "invoice_flow_reviewed";

const SOURCE_PILLS: { key: SourceFilter; label: string }[] = [
  { key: "all",                    label: "All" },
  { key: "vat_classifier",         label: "From CSV" },
  { key: "invoice_flow_auto",      label: "📄 Invoice · Auto" },
  { key: "invoice_flow_reviewed",  label: "📄 Invoice · Reviewed" },
];

export default function VATClassifier() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [savedTxns, setSavedTxns] = useState<SavedTransaction[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [activeView, setActiveView] = useState<"saved" | "new">("saved");
  const [error, setError] = useState<string | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const { data } = await apiClient.get("/api/vat/transactions?limit=200");
      setSavedTxns(Array.isArray(data) ? data : []);
    } catch {
      setSavedTxns([]);
    } finally {
      setLoadingSaved(false);
    }
  }, []);

  useEffect(() => { fetchSaved(); }, [fetchSaved]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file first");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post(
        `/api/vat/classify-bulk?entity_type=mainland&transaction_type=sale`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
          timeout: 120_000, // 2 min — 20 rows × Claude = ~60s
        }
      );

      const summary = response.data.summary || {};
      const skipped = summary.skipped_duplicates || 0;
      const classified = summary.classified_rows || 0;

      // Build a friendly message
      if (classified === 0 && skipped > 0) {
        setUploadMsg(`⚠️ All ${skipped} rows already exist in the database — no new transactions added. Use "Clear All Data" if you want to re-classify.`);
      } else {
        const parts = [`✅ ${classified} new transaction${classified !== 1 ? "s" : ""} classified and saved.`];
        if (skipped > 0) parts.push(`${skipped} duplicate${skipped !== 1 ? "s" : ""} skipped.`);
        setUploadMsg(parts.join(" "));
      }

      const raw = summary.classifications || [];
      setResults(
        raw.map((c: Record<string, unknown>) => ({
          description: String(c.description ?? ""),
          vendor: c.vendor_or_customer ? String(c.vendor_or_customer) : "",
          amount:
            typeof c.amount_aed === "number"
              ? c.amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })
              : String(c.amount_aed ?? ""),
          vat_treatment: String(c.vat_treatment ?? "standard_rated"),
          confidence: Math.round(Number(c.confidence ?? 0) * 100),
          reasoning: c.reasoning ? String(c.reasoning) : undefined,
        }))
      );
      // Refresh saved list and switch to it
      await fetchSaved();
      setActiveView("saved");
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to classify transactions. Please try again."
      );
      console.error("Classification error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(`Delete ALL ${savedTxns.length} transactions? This cannot be undone.`)) return;
    setClearing(true);
    try {
      await apiClient.delete("/api/vat/transactions/all");
      await fetchSaved();
      setResults([]);
      setUploadMsg("✅ All transactions cleared. You can now re-upload your file.");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to clear transactions.");
    } finally {
      setClearing(false);
    }
  };

  const getTreatmentClass = (treatment: string) => {
    switch (treatment) {
      case "standard_rated":
      case "reverse_charge":
        return "pill-std";
      case "zero_rated":
        return "pill-zero";
      case "exempt":
        return "pill-ex";
      case "out_of_scope":
        return "pill-oos";
      default:
        return "pill-flag";
    }
  };

  const getConfidenceClass = (confidence: number) => {
    return confidence >= 90 ? "hi" : confidence >= 70 ? "mid" : "low";
  };

  const VAT_COLORS: Record<string, string> = {
    standard_rated: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
    zero_rated: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
    exempt: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
    reverse_charge: "bg-[rgba(200,100,255,0.12)] text-purple-300 border-purple-400/30",
    out_of_scope: "bg-[rgba(255,255,255,0.06)] text-muted border-border",
  };

  const totalSales = savedTxns.filter(t => t.transaction_type === "sale").reduce((s, t) => s + t.amount_aed, 0);
  const totalPurchases = savedTxns.filter(t => t.transaction_type === "purchase").reduce((s, t) => s + t.amount_aed, 0);
  const totalVAT = savedTxns.reduce((s, t) => s + (t.vat_amount_aed || 0), 0);

  // Source-filtered view
  const filteredTxns = sourceFilter === "all"
    ? savedTxns
    : savedTxns.filter(t => (t.source || "vat_classifier") === sourceFilter);

  // Source counts for pill badges
  const sourceCounts: Record<SourceFilter, number> = {
    all: savedTxns.length,
    vat_classifier: savedTxns.filter(t => (t.source || "vat_classifier") === "vat_classifier").length,
    invoice_flow_auto: savedTxns.filter(t => t.source === "invoice_flow_auto").length,
    invoice_flow_reviewed: savedTxns.filter(t => t.source === "invoice_flow_reviewed").length,
  };

  return (
    <>
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // VAT Classifier
          </div>
          <h2 className="font-playfair text-[26px] font-bold">
            AI Transaction Classifier
          </h2>
          <div className="text-[13px] text-muted mt-1">
            Upload CSV/Excel file · AI classifies each transaction using UAE VAT rules
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveView("saved")}
            className={`px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all ${activeView === "saved" ? "bg-gold-pale text-gold-lt border border-border-g" : "text-muted border border-transparent hover:border-border-g hover:text-white"}`}
          >
            📋 Saved ({savedTxns.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveView("new")}
            className={`px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all ${activeView === "new" ? "bg-gold-pale text-gold-lt border border-border-g" : "text-muted border border-transparent hover:border-border-g hover:text-white"}`}
          >
            ⬆ Upload New
          </button>
        </div>
      </div>

      {/* Summary stats */}
      {savedTxns.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Sales", value: `AED ${totalSales.toLocaleString("en-AE", {minimumFractionDigits: 0})}`, color: "text-green" },
            { label: "Total Purchases", value: `AED ${totalPurchases.toLocaleString("en-AE", {minimumFractionDigits: 0})}`, color: "text-amber" },
            { label: "Total VAT", value: `AED ${totalVAT.toLocaleString("en-AE", {minimumFractionDigits: 2})}`, color: "text-white" },
          ].map(card => (
            <div key={card.label} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-5">
              <p className="text-[11px] text-muted2 uppercase tracking-wide mb-1">{card.label}</p>
              <p className={`text-[20px] font-bold font-mono ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upload message banner */}
      {uploadMsg && (
        <div className={`mb-4 px-4 py-3 rounded-[10px] text-sm border ${uploadMsg.startsWith("⚠️") ? "border-amber/40 bg-[rgba(255,183,0,0.08)] text-amber" : "border-green/30 bg-[rgba(45,212,160,0.08)] text-green"}`}>
          {uploadMsg}
        </div>
      )}

      {/* Saved transactions view */}
      {activeView === "saved" && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden mb-6" id="vat-classifier-table">
          <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {SOURCE_PILLS.map(pill => (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setSourceFilter(pill.key)}
                  className={`px-3 py-1 rounded-full text-[11px] font-medium border transition-all ${
                    sourceFilter === pill.key
                      ? "bg-gold-pale text-gold-lt border-border-g"
                      : "text-muted2 border-border hover:border-border-g hover:text-white"
                  }`}
                >
                  {pill.label}
                  {sourceCounts[pill.key] > 0 && (
                    <span className="ml-1.5 opacity-60">{sourceCounts[pill.key]}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted2 font-mono uppercase">Auto-verified · Ready for VAT Return</span>
              {savedTxns.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="px-3 py-1 rounded-[6px] text-[11px] font-medium border border-red/30 text-red hover:bg-[rgba(255,107,107,0.1)] disabled:opacity-50 transition-all"
                >
                  {clearing ? "Clearing…" : "🗑 Clear All Data"}
                </button>
              )}
            </div>
          </div>
          {loadingSaved ? (
            <div className="text-center py-12 text-muted2">Loading transactions…</div>
          ) : filteredTxns.length === 0 ? (
            <div className="text-center py-16 text-muted2">
              <div className="text-4xl mb-3">📂</div>
              {savedTxns.length === 0
                ? <p>No transactions yet — upload your first file</p>
                : <p>No transactions match this filter</p>
              }
              {savedTxns.length === 0 && (
                <button type="button" onClick={() => setActiveView("new")} className="mt-2 text-gold-lt text-sm hover:underline">Upload CSV/Excel →</button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                    {["Date", "Description", "Vendor/Customer", "Type", "VAT Treatment", "Amount AED", "VAT AED"].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted2 uppercase tracking-wide text-[10px] font-mono whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map((t, i) => (
                    <tr key={t.id} className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-[rgba(255,255,255,0.02)]"}`}>
                      <td className="px-4 py-2.5 text-muted font-mono whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 text-white max-w-[220px]">
                        <div className="flex items-center gap-1.5 truncate">
                          {t.source && t.source !== "vat_classifier" && (
                            <span
                              title={t.source === "invoice_flow_auto" ? "Auto-approved from Invoice Flow (risk < 30)" : "Approved by reviewer from Invoice Flow"}
                              className="flex-shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[rgba(200,100,255,0.12)] text-purple-300 border border-purple-400/20"
                            >
                              📄 {t.source === "invoice_flow_auto" ? "Auto" : "Reviewed"}
                            </span>
                          )}
                          <span className="truncate">{t.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted truncate max-w-[140px]">{t.vendor_or_customer || "—"}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${t.transaction_type === "sale" ? "text-green bg-[rgba(45,212,160,0.12)]" : "text-amber bg-[rgba(255,183,0,0.1)]"}`}>
                          {t.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${VAT_COLORS[t.vat_treatment] || VAT_COLORS.out_of_scope}`}>
                          {(t.vat_treatment || "—").replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white font-mono text-right whitespace-nowrap">{t.amount_aed.toLocaleString("en-AE", {minimumFractionDigits: 2})}</td>
                      <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">{(t.vat_amount_aed || 0).toLocaleString("en-AE", {minimumFractionDigits: 2})}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === "new" && (<>

      {/* Upload Section */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">
            Upload Transaction File
          </h3>
          <p className="text-sm text-muted">
            Supported formats: CSV, Excel (.xlsx). File should contain columns: Date, Description, Vendor (optional), Amount (AED).
          </p>
        </div>

        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale"
          >
            {file ? `📄 ${file.name}` : "📁 Choose File"}
          </button>
          {file && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border-none transition-all bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? "⏳ Classifying..." : "🚀 Classify Transactions"}
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4 p-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.25)] rounded-lg">
            <p className="text-sm text-red">{error}</p>
          </div>
        )}
      </div>

      {/* Results Table */}
      {results.length > 0 && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
          <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)] flex items-center justify-between">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              Classification Results{" "}
              <span className="font-mono text-[11px] text-gold bg-gold-pale px-2 py-0.5 rounded">
                {results.length} transactions
              </span>
            </div>
            <button
              onClick={() => {
                const csv = [
                  ["Description", "Vendor", "Amount (AED)", "VAT Treatment", "Confidence %"],
                  ...results.map((r) => [
                    r.description,
                    r.vendor || "",
                    r.amount,
                    r.vat_treatment,
                    r.confidence.toString(),
                  ]),
                ]
                  .map((row) => row.map((cell) => `"${cell}"`).join(","))
                  .join("\n");
                const blob = new Blob([csv], { type: "text/csv" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "vat_classifications.csv";
                a.click();
              }}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border-none transition-all bg-transparent border border-border-g text-gold hover:bg-gold-pale"
            >
              📥 Export CSV
            </button>
          </div>
          <div className="p-6 overflow-x-auto">
            <table className="w-full border-collapse min-w-[800px]">
              <thead>
                <tr>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Description
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Vendor
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Amount AED
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    VAT Treatment
                  </th>
                  <th className="text-[11px] uppercase tracking-[0.08em] text-muted px-3 pb-3 text-left font-medium font-mono border-b border-[rgba(78,168,255,0.14)]">
                    Confidence
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <tr key={i} className="hover:bg-[rgba(20,50,100,0.25)]">
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <div className="text-white font-medium">{result.description}</div>
                      {result.reasoning && (
                        <div className="text-[11px] text-muted mt-1 italic">
                          {result.reasoning}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle text-muted">
                      {result.vendor || "—"}
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle font-mono text-white">
                      {result.amount}
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono tracking-wide whitespace-nowrap ${
                          getTreatmentClass(result.vat_treatment) === "pill-std"
                            ? "bg-[rgba(45,212,160,0.12)] text-green border border-[rgba(45,212,160,0.25)]"
                            : getTreatmentClass(result.vat_treatment) === "pill-zero"
                            ? "bg-[rgba(78,168,255,0.12)] text-blue border border-[rgba(78,168,255,0.25)]"
                            : getTreatmentClass(result.vat_treatment) === "pill-ex"
                            ? "bg-gold-pale text-gold-lt border border-border-g"
                            : getTreatmentClass(result.vat_treatment) === "pill-flag"
                            ? "bg-[rgba(255,107,107,0.12)] text-red border border-[rgba(255,107,107,0.25)]"
                            : "bg-[rgba(122,132,153,0.14)] text-muted border border-[rgba(122,132,153,0.2)]"
                        }`}
                      >
                        {result.vat_treatment}
                      </span>
                    </td>
                    <td className="px-3 py-3.5 text-[13px] border-b border-[rgba(255,255,255,0.04)] align-middle">
                      <span
                        className={`font-mono text-xs ${
                          getConfidenceClass(result.confidence) === "hi"
                            ? "text-green"
                            : getConfidenceClass(result.confidence) === "mid"
                            ? "text-amber"
                            : "text-red"
                        }`}
                      >
                        {result.confidence}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results.length === 0 && !isUploading && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">No classifications yet</h3>
          <p className="text-sm text-muted">Upload a transaction file to get started.</p>
        </div>
      )}
      </>)}
    </>
  );
}
