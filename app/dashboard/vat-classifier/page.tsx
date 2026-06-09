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
  explanation?: string;
  box_number?: number;
  flags?: RiskFlag[];
  review_tier?: string;
  blocked_input_vat?: boolean;
  blocked_reason?: string;
  blocked_vat_amount?: number;
}

interface RiskFlag {
  code: string;
  icon: string;
  label: string;
  tooltip: string;
}

interface PdfExtractionResult {
  file_name: string;
  status: "extracted" | "review" | "failed";
  vendor_name?: string | null;
  vendor_trn?: string | null;
  trn_valid?: boolean;
  invoice_number?: string | null;
  invoice_date?: string | null;
  parsed_date?: string | null;
  description?: string | null;
  total_aed: number;
  subtotal_aed?: number;
  vat_amount_aed: number;
  currency?: string;
  vat_treatment?: string | null;
  confidence: number;
  flags?: string[];
  line_items?: Array<{ description?: string; qty?: number; unit_price?: number; amount?: number }>;
  extracted_json?: Record<string, unknown>;
  classification?: Record<string, unknown>;
  error?: string;
}

interface SavedTransaction {
  id: number;
  date: string;
  description: string;
  vendor_or_customer?: string;
  vendor_trn?: string | null;
  amount_aed: number;
  vat_treatment: string;
  transaction_type: string;
  vat_amount_aed: number;
  confidence_score?: number;
  is_verified: boolean;
  source?: string;
  source_file_name?: string | null;
  source_metadata?: Record<string, unknown> | null;
  source_invoice_id?: number | null;
  entertainment_flag?: boolean;
  entertainment_label?: string | null;
  reverse_charge_flag?: boolean;
  import_vat_flag?: boolean;
  blocked_input_vat?: boolean;
  blocked_vat_amount?: number;
  blocked_reason?: string | null;
  review_tier?: "auto_approve" | "review_required" | "blocked";
  box_number?: number;
  flags?: RiskFlag[];
  explanation?: string;
  ai_reasoning?: string;
  flag_reason?: string | null;
  transaction_side?: string;
  location?: string;
}

type ReviewTab = "auto_approve" | "review_required" | "blocked";

type SourceFilter = "all" | "vat_classifier" | "pdf_invoice" | "manual" | "invoice_flow_auto" | "invoice_flow_reviewed";
type UploadTab = "csv" | "pdf" | "manual";

const SOURCE_PILLS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vat_classifier", label: "CSV Upload" },
  { key: "pdf_invoice", label: "📄 PDF Invoice" },
  { key: "manual", label: "Manual" },
  { key: "invoice_flow_auto", label: "📄 Invoice · Auto" },
  { key: "invoice_flow_reviewed", label: "📄 Invoice · Reviewed" },
];

const UPLOAD_TABS: { key: UploadTab; label: string }[] = [
  { key: "csv", label: "Upload CSV" },
  { key: "pdf", label: "Upload PDF Invoices" },
  { key: "manual", label: "Manual Entry" },
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
  const [reclassifying, setReclassifying] = useState(false);
  const [reclassifyMsg, setReclassifyMsg] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [reviewTab, setReviewTab] = useState<ReviewTab>("auto_approve");
  const [tierCounts, setTierCounts] = useState({ auto_approve: 0, review_required: 0, blocked: 0 });
  const [bulkApproving, setBulkApproving] = useState(false);
  const [whyModal, setWhyModal] = useState<SavedTransaction | null>(null);
  const [extractedModal, setExtractedModal] = useState<SavedTransaction | null>(null);
  const [uploadTab, setUploadTab] = useState<UploadTab>("csv");
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [pdfProcessing, setPdfProcessing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfResults, setPdfResults] = useState<PdfExtractionResult[]>([]);
  const [pdfSummary, setPdfSummary] = useState<{ extracted: number; review: number; failed: number } | null>(null);
  const [expandedPdf, setExpandedPdf] = useState<string | null>(null);
  const [addingPdf, setAddingPdf] = useState(false);
  const [manualForm, setManualForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    vendor: "",
    amount: "",
    invoice_number: "",
    transaction_type: "purchase" as "sale" | "purchase",
  });
  const [manualSaving, setManualSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const fetchSaved = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const { data } = await apiClient.get("/api/vat/transactions/enriched?limit=200");
      setSavedTxns(Array.isArray(data.transactions) ? data.transactions : []);
      setTierCounts(data.tier_counts || { auto_approve: 0, review_required: 0, blocked: 0 });
    } catch {
      try {
        const { data } = await apiClient.get("/api/vat/transactions?limit=200");
        setSavedTxns(Array.isArray(data) ? data : []);
      } catch {
        setSavedTxns([]);
      }
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
    // Guard against double-submit (state update may not be synchronous)
    if (isUploading) return;

    setIsUploading(true);
    setError(null);
    setUploadMsg(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.post(
        `/api/vat/classify-bulk?entity_type=mainland`,
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
          explanation: c.explanation ? String(c.explanation) : c.reasoning ? String(c.reasoning) : undefined,
          box_number: typeof c.box_number === "number" ? c.box_number : undefined,
          flags: Array.isArray(c.flags) ? (c.flags as RiskFlag[]) : [],
          review_tier: c.review_tier ? String(c.review_tier) : undefined,
          blocked_input_vat: Boolean(c.blocked_input_vat),
          blocked_reason: c.blocked_reason ? String(c.blocked_reason) : undefined,
          blocked_vat_amount: typeof c.blocked_vat_amount === "number" ? c.blocked_vat_amount : 0,
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

  const handleReclassifyExempt = async () => {
    if (!window.confirm("Re-run AI classification on all exempt purchase transactions? Professional services wrongly marked exempt will be corrected to standard-rated.")) return;
    setReclassifying(true);
    setReclassifyMsg(null);
    try {
      const { data } = await apiClient.post("/api/vat/reclassify-exempt");
      setReclassifyMsg(`✅ ${data.message}`);
      if (data.reclassified > 0) await fetchSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setReclassifyMsg(`❌ Failed: ${detail || "Unknown error"}`);
    } finally {
      setReclassifying(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!window.confirm("Approve all high-confidence transactions (≥ 85%)? Blocked/entertainment items will be skipped.")) return;
    setBulkApproving(true);
    try {
      const { data } = await apiClient.post("/api/vat/transactions/bulk-approve-high-confidence", {
        min_confidence: 0.85,
        verified_by: "user",
      });
      setUploadMsg(`✅ Approved ${data.approved_count} transaction(s)${data.skipped_blocked ? ` · ${data.skipped_blocked} blocked skipped` : ""}.`);
      await fetchSaved();
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Bulk approve failed");
    } finally {
      setBulkApproving(false);
    }
  };

  const addPdfFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    const allowed = list.filter((f) =>
      /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(f.name)
    );
    setPdfFiles((prev) => {
      const merged = [...prev, ...allowed];
      return merged.slice(0, 50);
    });
    setError(null);
  };

  const handlePdfDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) addPdfFiles(e.dataTransfer.files);
  };

  const handleProcessPdfs = async () => {
    if (pdfFiles.length === 0) {
      setError("Please add at least one PDF or image invoice");
      return;
    }
    if (pdfProcessing) return;

    setPdfProcessing(true);
    setPdfProgress(0);
    setError(null);
    setUploadMsg(null);
    setPdfResults([]);
    setPdfSummary(null);

    try {
      const formData = new FormData();
      pdfFiles.forEach((f) => formData.append("files", f));

      const { data } = await apiClient.post("/api/vat/extract-pdf-invoices", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 600_000,
        onUploadProgress: (evt) => {
          if (evt.total) setPdfProgress(Math.round((evt.loaded / evt.total) * 40));
        },
      });

      setPdfProgress(100);
      setPdfResults(data.invoices || []);
      setPdfSummary(data.summary || null);
      setUploadMsg(
        `✅ ${data.summary?.extracted ?? 0} extracted · ${data.summary?.review ?? 0} need review · ${data.summary?.failed ?? 0} failed`
      );
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "PDF extraction failed");
    } finally {
      setPdfProcessing(false);
    }
  };

  const handleAddPdfToClassifier = async () => {
    const toAdd = pdfResults.filter((r) => r.status !== "failed");
    if (toAdd.length === 0) {
      setError("No extracted invoices to add");
      return;
    }
    setAddingPdf(true);
    setError(null);
    try {
      const { data } = await apiClient.post("/api/vat/add-pdf-invoices", { invoices: toAdd });
      setUploadMsg(`✅ Added ${data.saved_count} transaction(s) from PDF invoices${data.skipped_count ? ` · ${data.skipped_count} skipped` : ""}.`);
      setPdfFiles([]);
      setPdfResults([]);
      setPdfSummary(null);
      await fetchSaved();
      setActiveView("saved");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to add PDF invoices");
    } finally {
      setAddingPdf(false);
    }
  };

  const downloadPdfCsv = () => {
    if (pdfResults.length === 0) return;
    const csv = [
      ["File", "Status", "Vendor", "TRN", "Invoice #", "Date", "Total AED", "VAT AED", "Treatment", "Confidence %"],
      ...pdfResults.map((r) => [
        r.file_name,
        r.status,
        r.vendor_name || "",
        r.vendor_trn || "",
        r.invoice_number || "",
        r.invoice_date || "",
        String(r.total_aed ?? 0),
        String(r.vat_amount_aed ?? 0),
        r.vat_treatment || "",
        String(r.confidence ?? 0),
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pdf_invoice_extractions.csv";
    a.click();
  };

  const handleManualSubmit = async () => {
    const amount = parseFloat(manualForm.amount);
    if (!manualForm.description.trim() || !amount || amount <= 0) {
      setError("Description and a valid amount are required");
      return;
    }
    setManualSaving(true);
    setError(null);
    try {
      await apiClient.post("/api/vat/classify-transaction", {
        company_id: 0,
        description: manualForm.description.trim(),
        amount_aed: amount,
        vendor_or_customer: manualForm.vendor.trim() || null,
        transaction_type: manualForm.transaction_type,
        entity_type: "mainland",
        invoice_number: manualForm.invoice_number.trim() || null,
        transaction_date: manualForm.date,
      });
      setUploadMsg("✅ Manual transaction classified and saved.");
      setManualForm({
        date: new Date().toISOString().slice(0, 10),
        description: "",
        vendor: "",
        amount: "",
        invoice_number: "",
        transaction_type: "purchase",
      });
      await fetchSaved();
      setActiveView("saved");
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Manual entry failed");
    } finally {
      setManualSaving(false);
    }
  };

  const renderSourceBadge = (t: SavedTransaction) => {
    const src = t.source || "vat_classifier";
    if (src === "pdf_invoice") {
      return (
        <span
          title={t.source_file_name || "PDF Invoice"}
          className="flex-shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[rgba(78,168,255,0.12)] text-blue-300 border border-blue-400/20"
        >
          📄 PDF
        </span>
      );
    }
    if (src === "manual") {
      return (
        <span className="flex-shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[rgba(255,255,255,0.08)] text-muted border border-border">
          ✏️ Manual
        </span>
      );
    }
    if (src === "invoice_flow_auto" || src === "invoice_flow_reviewed") {
      return (
        <span
          title={src === "invoice_flow_auto" ? "Auto-approved from Invoice Flow" : "Approved from Invoice Flow"}
          className="flex-shrink-0 text-[9px] font-mono px-1 py-0.5 rounded bg-[rgba(200,100,255,0.12)] text-purple-300 border border-purple-400/20"
        >
          📄 {src === "invoice_flow_auto" ? "Auto" : "Reviewed"}
        </span>
      );
    }
    return null;
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
      case "import_vat":
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
    import_vat: "bg-[rgba(78,168,255,0.12)] text-blue-300 border-blue-400/30",
    entertainment_restricted: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
    out_of_scope: "bg-[rgba(255,255,255,0.06)] text-muted border-border",
  };

  const renderFlags = (flags?: RiskFlag[]) => {
    if (!flags || flags.length === 0) {
      return <span className="text-muted2" title="No risk flags">⚪</span>;
    }
    return (
      <div className="flex flex-wrap gap-1">
        {flags.map((f) => (
          <span
            key={f.code}
            title={f.tooltip}
            className="cursor-help text-[13px] leading-none"
          >
            {f.icon}
          </span>
        ))}
      </div>
    );
  };

  const totalSales = savedTxns.filter(t => t.transaction_type === "sale").reduce((s, t) => s + t.amount_aed, 0);
  const totalPurchases = savedTxns.filter(t => t.transaction_type === "purchase").reduce((s, t) => s + t.amount_aed, 0);
  const totalVAT = savedTxns.reduce((s, t) => s + (t.vat_amount_aed || 0), 0);

  // Source-filtered view
  const sourceFiltered = sourceFilter === "all"
    ? savedTxns
    : savedTxns.filter(t => (t.source || "vat_classifier") === sourceFilter);

  const filteredTxns = sourceFiltered.filter(t => (t.review_tier || "review_required") === reviewTab);

  // Source counts for pill badges
  const sourceCounts: Record<SourceFilter, number> = {
    all: savedTxns.length,
    vat_classifier: savedTxns.filter(t => (t.source || "vat_classifier") === "vat_classifier").length,
    pdf_invoice: savedTxns.filter(t => t.source === "pdf_invoice").length,
    manual: savedTxns.filter(t => t.source === "manual").length,
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
            Upload CSV, PDF invoices, or manual entry · AI classifies using UAE VAT rules
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

      {/* Reclassify result banner */}
      {reclassifyMsg && (
        <div className={`mb-4 px-4 py-3 rounded-[10px] text-sm border ${reclassifyMsg.startsWith("✅") ? "border-green/30 bg-[rgba(45,212,160,0.08)] text-green" : "border-red/30 bg-[rgba(255,107,107,0.08)] text-red"}`}>
          {reclassifyMsg}
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
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkApproving || tierCounts.auto_approve === 0}
                className="px-3 py-1 rounded-[6px] text-[11px] font-medium border border-green/30 text-green hover:bg-[rgba(45,212,160,0.1)] disabled:opacity-50 transition-all"
                title="Approve all transactions with confidence ≥ 85% (excludes blocked)"
              >
                {bulkApproving ? "Approving…" : "✓ Bulk Approve (≥85%)"}
              </button>
              <span className="text-[10px] text-muted2 font-mono uppercase">Ready for VAT Return when verified</span>
              {savedTxns.length > 0 && (
                <button
                  type="button"
                  onClick={handleReclassifyExempt}
                  disabled={reclassifying}
                  className="px-3 py-1 rounded-[6px] text-[11px] font-medium border border-amber/30 text-amber hover:bg-[rgba(255,183,0,0.1)] disabled:opacity-50 transition-all"
                  title="Re-run AI on exempt purchases — corrects professional services wrongly marked as exempt"
                >
                  {reclassifying ? "Re-classifying…" : "⚡ Fix Exempt"}
                </button>
              )}
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

          {/* Review tier tabs */}
          <div className="px-6 py-3 border-b border-border flex flex-wrap gap-2">
            {([
              { key: "auto_approve" as ReviewTab, label: "Auto-Approve", color: "text-green" },
              { key: "review_required" as ReviewTab, label: "Review Required", color: "text-amber" },
              { key: "blocked" as ReviewTab, label: "Blocked", color: "text-red" },
            ]).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setReviewTab(tab.key)}
                className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium border transition-all ${
                  reviewTab === tab.key
                    ? "bg-gold-pale text-gold-lt border-border-g"
                    : "text-muted border-border hover:border-border-g"
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 font-mono ${tab.color}`}>{tierCounts[tab.key] ?? 0}</span>
              </button>
            ))}
          </div>

          {loadingSaved ? (
            <div className="text-center py-12 text-muted2">Loading transactions…</div>
          ) : filteredTxns.length === 0 ? (
            <div className="text-center py-16 text-muted2">
              <div className="text-4xl mb-3">📂</div>
              {savedTxns.length === 0
                ? <p>No transactions yet — upload your first file</p>
                : <p>No transactions in this review tier{sourceFilter !== "all" ? " / filter" : ""}</p>
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
                    {["Date", "Description", "Vendor/Customer", "TRN", "Type", "VAT Treatment", "Box", "Flags", "Conf.", "Amount AED", "VAT AED", ""].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-muted2 uppercase tracking-wide text-[10px] font-mono whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredTxns.map((t, i) => (
                    <tr
                      key={t.id}
                      className={`border-b border-border/50 ${i % 2 === 0 ? "" : "bg-[rgba(255,255,255,0.02)]"} ${t.source === "pdf_invoice" ? "cursor-pointer hover:bg-[rgba(78,168,255,0.06)]" : ""}`}
                      onClick={() => t.source === "pdf_invoice" && t.source_metadata && setExtractedModal(t)}
                    >
                      <td className="px-4 py-2.5 text-muted font-mono whitespace-nowrap">{t.date}</td>
                      <td className="px-4 py-2.5 text-white max-w-[220px]">
                        <div className="flex items-center gap-1.5 truncate">
                          {renderSourceBadge(t)}
                          <span className="truncate">{t.description}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted truncate max-w-[140px]">{t.vendor_or_customer || "—"}</td>
                      <td className="px-4 py-2.5 font-mono text-[10px] text-muted2 whitespace-nowrap">
                        {t.vendor_trn || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase ${t.transaction_type === "sale" ? "text-green bg-[rgba(45,212,160,0.12)]" : "text-blue-300 bg-[rgba(78,168,255,0.12)] border border-blue-400/20"}`}>
                          {t.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] font-mono ${VAT_COLORS[t.vat_treatment] || VAT_COLORS.out_of_scope}`}>
                            {(t.vat_treatment || "—").replace(/_/g, " ")}
                          </span>
                          {t.entertainment_flag && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(255,183,0,0.15)] text-amber border border-amber/30">
                              Art.54 — 50% recovery
                            </span>
                          )}
                          {t.import_vat_flag && (
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[rgba(78,168,255,0.12)] text-blue-300 border border-blue-400/20">
                              Import VAT
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-muted2">
                        {t.box_number ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {renderFlags(t.flags)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[11px] text-right whitespace-nowrap">
                        <span className={
                          (t.confidence_score ?? 0) >= 85 ? "text-green" :
                          (t.confidence_score ?? 0) >= 70 ? "text-amber" : "text-red"
                        }>
                          {Math.round(t.confidence_score ?? 0)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-white font-mono text-right whitespace-nowrap">{t.amount_aed.toLocaleString("en-AE", {minimumFractionDigits: 2})}</td>
                      <td className="px-4 py-2.5 text-muted font-mono text-right whitespace-nowrap">{(t.vat_amount_aed || 0).toLocaleString("en-AE", {minimumFractionDigits: 2})}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setWhyModal(t); }}
                          className="text-[10px] font-mono px-2 py-1 rounded border border-border-g text-gold-lt hover:bg-gold-pale transition-all"
                        >
                          Why?
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeView === "new" && (<>

      {/* Upload tab navigation */}
      <div className="flex flex-wrap gap-2 mb-4">
        {UPLOAD_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setUploadTab(tab.key); setError(null); }}
            className={`px-4 py-2 rounded-[8px] text-[12px] font-medium transition-all ${
              uploadTab === tab.key
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted border border-border hover:border-border-g hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* CSV Upload */}
      {uploadTab === "csv" && (
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Upload Transaction File</h3>
          <p className="text-sm text-muted">
            Supported formats: CSV, Excel (.xlsx). Columns: Date, Description, Vendor (optional), Amount (AED).
          </p>
        </div>
        <div className="flex items-center gap-4">
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer border border-border-g text-gold hover:bg-gold-pale"
          >
            {file ? `📄 ${file.name}` : "📁 Choose File"}
          </button>
          {file && (
            <button
              onClick={handleUpload}
              disabled={isUploading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
            >
              {isUploading ? "⏳ Classifying..." : "🚀 Classify Transactions"}
            </button>
          )}
        </div>
      </div>
      )}

      {/* PDF Invoice Upload */}
      {uploadTab === "pdf" && (
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Upload PDF Invoices</h3>
          <p className="text-sm text-muted">
            Drag and drop up to 50 PDF or image invoices (PDF, JPG, PNG, JPEG). AI extracts vendor, TRN, amounts, and classifies VAT treatment.
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handlePdfDrop}
          className="border-2 border-dashed border-border-g rounded-xl p-10 text-center mb-6 hover:border-gold/50 transition-colors"
        >
          <div className="text-4xl mb-3">📄</div>
          <p className="text-sm text-muted mb-4">Drag & drop invoices here, or browse</p>
          <input
            ref={pdfInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && addPdfFiles(e.target.files)}
          />
          <button
            type="button"
            onClick={() => pdfInputRef.current?.click()}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-border-g text-gold hover:bg-gold-pale"
          >
            Browse Files
          </button>
        </div>

        {pdfFiles.length > 0 && (
          <div className="mb-6">
            <div className="text-[11px] text-muted2 uppercase tracking-wide mb-2">
              {pdfFiles.length} file{pdfFiles.length !== 1 ? "s" : ""} selected
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {pdfFiles.map((f) => (
                <div key={f.name + f.size} className="flex justify-between text-[12px] text-muted px-3 py-1.5 bg-[rgba(4,12,30,0.5)] rounded">
                  <span className="truncate">{f.name}</span>
                  <span className="font-mono text-muted2 ml-2">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleProcessPdfs}
              disabled={pdfProcessing}
              className="mt-4 px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
            >
              {pdfProcessing ? "⏳ Processing..." : "🚀 Process All Invoices"}
            </button>
          </div>
        )}

        {pdfProcessing && (
          <div className="mb-6">
            <div className="flex justify-between text-[11px] text-muted2 mb-1">
              <span>Processing {pdfFiles.length} invoice{pdfFiles.length !== 1 ? "s" : ""}…</span>
              <span>{pdfProgress}%</span>
            </div>
            <div className="h-2 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
              <div className="h-full bg-gold transition-all" style={{ width: `${pdfProgress}%` }} />
            </div>
          </div>
        )}

        {pdfResults.length > 0 && (
          <div className="space-y-4">
            {pdfSummary && (
              <div className="text-sm text-green border border-green/30 bg-[rgba(45,212,160,0.08)] rounded-lg px-4 py-3">
                {pdfSummary.extracted} extracted · {pdfSummary.review} need review · {pdfSummary.failed} failed
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleAddPdfToClassifier}
                disabled={addingPdf}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
              >
                {addingPdf ? "Adding…" : "✅ Add All to VAT Classifier"}
              </button>
              <button
                type="button"
                onClick={downloadPdfCsv}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-border-g text-gold hover:bg-gold-pale"
              >
                📥 Download CSV
              </button>
            </div>
            <div className="border border-border rounded-xl overflow-hidden">
              {pdfResults.map((r) => (
                <div key={r.file_name} className="border-b border-border/50 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpandedPdf(expandedPdf === r.file_name ? null : r.file_name)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[rgba(255,255,255,0.02)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-lg">
                        {r.status === "extracted" ? "✅" : r.status === "review" ? "⚠️" : "❌"}
                      </span>
                      <span className="text-[12px] text-white truncate">{r.file_name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-muted2 ml-2">
                      {r.vendor_name || "—"} · AED {(r.total_aed || 0).toLocaleString("en-AE")}
                    </span>
                  </button>
                  {expandedPdf === r.file_name && (
                    <div className="px-4 pb-4 text-[12px] text-muted grid grid-cols-2 gap-2 bg-[rgba(4,12,30,0.4)]">
                      <div><span className="text-muted2">Vendor:</span> {r.vendor_name || "—"}</div>
                      <div><span className="text-muted2">TRN:</span> {r.vendor_trn || "—"} {r.trn_valid ? "✓" : "⚠"}</div>
                      <div><span className="text-muted2">Invoice #:</span> {r.invoice_number || "—"}</div>
                      <div><span className="text-muted2">Date:</span> {r.invoice_date || "—"}</div>
                      <div><span className="text-muted2">VAT:</span> AED {(r.vat_amount_aed || 0).toLocaleString("en-AE")}</div>
                      <div><span className="text-muted2">Treatment:</span> {(r.vat_treatment || "—").replace(/_/g, " ")}</div>
                      <div><span className="text-muted2">Confidence:</span> {r.confidence}%</div>
                      {r.flags && r.flags.length > 0 && (
                        <div className="col-span-2"><span className="text-muted2">Flags:</span> {r.flags.join(", ")}</div>
                      )}
                      {r.error && <div className="col-span-2 text-red">{r.error}</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}

      {/* Manual Entry */}
      {uploadTab === "manual" && (
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-8 mb-6">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-white mb-2">Manual Entry</h3>
          <p className="text-sm text-muted">Add a single transaction — AI classifies VAT treatment automatically.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {[
            { key: "date", label: "Date", type: "date" },
            { key: "description", label: "Description", type: "text", span: 2 },
            { key: "vendor", label: "Vendor / Customer", type: "text" },
            { key: "amount", label: "Amount (AED)", type: "number" },
            { key: "invoice_number", label: "Invoice Number (optional)", type: "text" },
          ].map((field) => (
            <div key={field.key} className={field.span === 2 ? "md:col-span-2" : ""}>
              <label className="block text-[11px] text-muted2 uppercase tracking-wide mb-1">{field.label}</label>
              <input
                type={field.type}
                value={manualForm[field.key as keyof typeof manualForm] as string}
                onChange={(e) => setManualForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-[11px] text-muted2 uppercase tracking-wide mb-1">Type</label>
            <select
              value={manualForm.transaction_type}
              onChange={(e) => setManualForm((prev) => ({ ...prev, transaction_type: e.target.value as "sale" | "purchase" }))}
              className="w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
            >
              <option value="purchase">Purchase</option>
              <option value="sale">Sale</option>
            </select>
          </div>
        </div>
        <button
          type="button"
          onClick={handleManualSubmit}
          disabled={manualSaving}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
        >
          {manualSaving ? "Classifying…" : "🚀 Classify & Save"}
        </button>
      </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.25)] rounded-lg">
          <p className="text-sm text-red">{error}</p>
        </div>
      )}

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
                      <div className="flex flex-col gap-1">
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
                        {result.blocked_input_vat && (
                          <span
                            title={result.blocked_reason || "UAE VAT Art.54 — 50% input VAT recovery only"}
                            className="inline-block px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wide whitespace-nowrap bg-[rgba(255,183,0,0.15)] text-amber border border-amber/30"
                          >
                            Art.54 — 50% recovery
                          </span>
                        )}
                      </div>
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

      {uploadTab === "csv" && results.length === 0 && !isUploading && (
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-12 text-center">
          <div className="text-4xl mb-4">📊</div>
          <h3 className="text-lg font-semibold text-white mb-2">No classifications yet</h3>
          <p className="text-sm text-muted">Upload a CSV/Excel file to get started.</p>
        </div>
      )}
      </>)}

      {whyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setWhyModal(null)}
        >
          <div
            className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl max-w-lg w-full p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">Classification Reasoning</h3>
              <button type="button" onClick={() => setWhyModal(null)} className="text-muted hover:text-white text-xl leading-none">×</button>
            </div>
            <p className="text-[12px] text-muted mb-3 font-mono truncate">{whyModal.description}</p>
            <pre className="text-[12px] text-white whitespace-pre-wrap font-sans leading-relaxed bg-[rgba(4,12,30,0.6)] rounded-lg p-4 border border-border">
              {whyModal.explanation || whyModal.ai_reasoning || "No explanation available."}
            </pre>
          </div>
        </div>
      )}

      {extractedModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setExtractedModal(null)}
        >
          <div
            className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl max-w-2xl w-full p-6 shadow-xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">PDF Extraction Data</h3>
                <p className="text-[11px] text-muted2 font-mono mt-1">{extractedModal.source_file_name}</p>
              </div>
              <button type="button" onClick={() => setExtractedModal(null)} className="text-muted hover:text-white text-xl leading-none">×</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[12px] mb-4">
              <div><span className="text-muted2">Vendor:</span> <span className="text-white">{extractedModal.vendor_or_customer || "—"}</span></div>
              <div><span className="text-muted2">TRN:</span> <span className="text-white font-mono">{extractedModal.vendor_trn || "—"}</span></div>
              <div><span className="text-muted2">Amount:</span> <span className="text-white font-mono">AED {extractedModal.amount_aed.toLocaleString("en-AE")}</span></div>
              <div><span className="text-muted2">VAT:</span> <span className="text-white font-mono">AED {(extractedModal.vat_amount_aed || 0).toLocaleString("en-AE")}</span></div>
            </div>
            <pre className="text-[11px] text-muted whitespace-pre-wrap font-mono leading-relaxed bg-[rgba(4,12,30,0.6)] rounded-lg p-4 border border-border overflow-x-auto">
              {JSON.stringify(extractedModal.source_metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
