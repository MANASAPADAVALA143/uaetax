"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Upload, Download, RefreshCw } from "lucide-react";

const COMPANY_ID = 1;
const VERIFIED_BY = "finance@gulftax.local";

interface ClassificationRow {
  id: number;
  description: string;
  vendor_or_customer: string;
  amount_aed: number;
  date?: string;
  vat_treatment: string;
  vat_rate: number;
  vat_amount_aed: number;
  confidence: number;
  needs_review: boolean;
  reasoning: string;
  rag_citations: string[];
  is_verified: boolean;
}

export default function VATClassifier() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [rows, setRows] = useState<ClassificationRow[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [treatmentDraft, setTreatmentDraft] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [excelUrl, setExcelUrl] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const verifiedCount = rows.filter((r) => r.is_verified).length;

  const loadFromServer = useCallback(async () => {
    setError(null);
    try {
      const res = await axios.get<ClassificationRow[]>(
        `${apiUrl}/api/vat/transactions/${COMPANY_ID}`
      );
      const mapped: ClassificationRow[] = res.data.map((t: any) => ({
        id: t.id,
        description: t.description,
        vendor_or_customer: t.vendor_or_customer || "",
        amount_aed: t.amount_aed,
        date: t.date,
        vat_treatment: t.vat_treatment || "standard_rated",
        vat_rate: t.vat_treatment === "standard_rated" || t.vat_treatment === "reverse_charge" ? 5 : 0,
        vat_amount_aed: t.vat_amount_aed ?? 0,
        confidence: (t.confidence_score ?? 0) / 100,
        needs_review:
          (t.confidence_score ?? 0) < 70,
        reasoning: t.ai_reasoning || "",
        rag_citations: [],
        is_verified: !!t.is_verified,
      }));
      setRows(mapped);
      const td: Record<number, string> = {};
      mapped.forEach((r) => {
        td[r.id] = r.vat_treatment;
      });
      setTreatmentDraft(td);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load transactions");
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadFromServer();
  }, [loadFromServer]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      setFile(e.dataTransfer.files[0]);
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
    setExcelUrl(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        `${apiUrl}/api/vat/classify-bulk?company_id=${COMPANY_ID}&entity_type=mainland&transaction_type=sale`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );

      const list: ClassificationRow[] = (response.data.summary?.classifications || []).map(
        (c: any) => ({
          ...c,
          is_verified: c.is_verified ?? false,
        })
      );
      setRows(list);
      const td: Record<number, string> = {};
      const sel: Record<number, boolean> = {};
      list.forEach((r) => {
        td[r.id] = r.vat_treatment;
        sel[r.id] = r.needs_review;
      });
      setTreatmentDraft(td);
      setSelected(sel);
      setNotes({});
      const rel = response.data.excel_download_url as string | undefined;
      setExcelUrl(rel ? `${apiUrl}${rel}` : null);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to classify transactions");
    } finally {
      setIsUploading(false);
    }
  };

  const downloadExcel = () => {
    if (excelUrl) window.open(excelUrl, "_blank", "noopener,noreferrer");
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }));
  };

  const selectAllNeedReview = () => {
    const next: Record<number, boolean> = { ...selected };
    rows.forEach((r) => {
      if (r.needs_review && !r.is_verified) next[r.id] = true;
    });
    setSelected(next);
  };

  const verifySelected = async () => {
    const ids = rows.filter((r) => selected[r.id]).map((r) => r.id);
    if (!ids.length) {
      setError("Select at least one transaction");
      return;
    }
    setIsVerifying(true);
    setError(null);
    try {
      for (const id of ids) {
        const row = rows.find((r) => r.id === id);
        if (!row) continue;
        const draft = treatmentDraft[id] ?? row.vat_treatment;
        const override = draft !== row.vat_treatment ? draft : null;
        const note = (notes[id] || "").trim() || null;
        if (override || note) {
          await axios.patch(`${apiUrl}/api/vat/transactions/${id}/verify`, {
            is_verified: false,
            override_treatment: override,
            note,
          });
        }
      }
      await axios.post(`${apiUrl}/api/vat/transactions/bulk-verify`, {
        transaction_ids: ids,
        verified_by: VERIFIED_BY,
      });
      // Counter + row styling update immediately; loadFromServer reconciles with DB.
      setRows((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, is_verified: true } : r))
      );
      await loadFromServer();
      setSelected({});
    } catch (err: any) {
      setError(err.response?.data?.detail || "Verification failed");
    } finally {
      setIsVerifying(false);
    }
  };

  const getTreatmentColor = (treatment: string) => {
    switch (treatment) {
      case "standard_rated":
        return "bg-[rgba(45,212,160,0.12)] text-[#2DD4A0] border-[rgba(45,212,160,0.25)]";
      case "zero_rated":
        return "bg-[rgba(78,168,255,0.12)] text-[#4EA8FF] border-[rgba(78,168,255,0.25)]";
      case "exempt":
        return "bg-[rgba(255,169,64,0.12)] text-[#FFA940] border-[rgba(255,169,64,0.25)]";
      case "out_of_scope":
        return "bg-[rgba(122,155,181,0.12)] text-[#7A9BB5] border-[rgba(122,155,181,0.25)]";
      case "reverse_charge":
        return "bg-[rgba(200,120,255,0.12)] text-[#D4A5FF] border-[rgba(200,120,255,0.25)]";
      default:
        return "bg-[rgba(122,155,181,0.12)] text-[#7A9BB5] border-[rgba(122,155,181,0.25)]";
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">VAT Classifier</h1>
          <p className="text-[#7A9BB5]">Upload transactions for AI-powered VAT classification</p>
        </div>
        <button
          type="button"
          onClick={() => void loadFromServer()}
          className="flex items-center gap-2 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-4 py-2 text-sm font-medium text-white hover:border-[rgba(201,168,76,0.22)]"
        >
          <RefreshCw className="h-4 w-4" />
          Reload from server
        </button>
      </div>

      <div className="mb-8 rounded-xl border border-[rgba(78,168,255,0.12)] bg-[#0A1A35] p-8">
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-[rgba(78,168,255,0.22)] p-12 text-center transition-all hover:border-[rgba(201,168,76,0.22)]"
        >
          <Upload className="mx-auto mb-4 h-12 w-12 text-[#7A9BB5]" />
          <p className="mb-2 font-medium text-white">
            {file ? file.name : "Drag and drop CSV/Excel file here"}
          </p>
          <p className="mb-4 text-sm text-[#7A9BB5]">Include optional column transaction_type (sale|purchase)</p>
          <input
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="mx-auto block text-sm text-[#7A9BB5]"
          />
          <button
            type="button"
            onClick={() => void handleUpload()}
            disabled={!file || isUploading}
            className="mt-6 rounded-lg bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] px-6 py-2 font-semibold text-[#040D1F] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isUploading ? "Classifying..." : "Classify Transactions"}
          </button>
        </div>
        {error && (
          <div className="mt-4 rounded-lg border border-[rgba(255,107,107,0.25)] bg-[rgba(255,107,107,0.12)] p-4">
            <p className="text-sm text-[#FF6B6B]">{error}</p>
          </div>
        )}
      </div>

      {rows.length > 0 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-[rgba(78,168,255,0.12)] bg-[#0A1A35] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Review &amp; verify</h2>
                <p className="text-sm text-[#7A9BB5]">
                  {verifiedCount} of {rows.length} transactions verified
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllNeedReview}
                  className="rounded-lg border border-[rgba(78,168,255,0.22)] px-3 py-2 text-sm text-white"
                >
                  Select needs review
                </button>
                <button
                  type="button"
                  onClick={() => void verifySelected()}
                  disabled={isVerifying}
                  className="rounded-lg bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] px-4 py-2 text-sm font-semibold text-[#040D1F] disabled:opacity-50"
                >
                  {isVerifying ? "Saving…" : "Verify selected"}
                </button>
                {excelUrl && (
                  <button
                    type="button"
                    onClick={downloadExcel}
                    className="flex items-center gap-2 rounded-lg border border-[rgba(78,168,255,0.22)] px-4 py-2 text-sm text-white"
                  >
                    <Download className="h-4 w-4" />
                    Download Excel
                  </button>
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px]">
                <thead>
                  <tr className="border-b border-[rgba(78,168,255,0.12)] text-left text-xs font-medium uppercase text-[#7A9BB5]">
                    <th className="p-3 w-10" />
                    <th className="p-3">Date</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Amount AED</th>
                    <th className="p-3">Treatment</th>
                    <th className="p-3 text-right">VAT</th>
                    <th className="p-3 text-right">Confidence</th>
                    <th className="p-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const grey = !r.is_verified;
                    return (
                      <tr
                        key={r.id}
                        className={`border-b border-[rgba(78,168,255,0.08)] ${
                          grey ? "opacity-80" : ""
                        } ${r.is_verified ? "bg-[rgba(45,212,160,0.06)]" : ""}`}
                      >
                        <td className="p-3 align-top">
                          <input
                            type="checkbox"
                            checked={!!selected[r.id]}
                            onChange={() => toggleSelect(r.id)}
                            disabled={r.is_verified}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="p-3 align-top text-sm text-white">{r.date || "—"}</td>
                        <td className="p-3 align-top text-sm text-white">{r.description}</td>
                        <td className="p-3 align-top text-right font-mono text-sm text-white">
                          {r.amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 align-top">
                          {r.is_verified ? (
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getTreatmentColor(
                                r.vat_treatment
                              )}`}
                            >
                              {r.vat_treatment.replace(/_/g, " ").toUpperCase()} ✓
                            </span>
                          ) : (
                            <select
                              value={treatmentDraft[r.id] ?? r.vat_treatment}
                              onChange={(e) =>
                                setTreatmentDraft((d) => ({ ...d, [r.id]: e.target.value }))
                              }
                              className="w-full rounded border border-[rgba(78,168,255,0.22)] bg-[#040D1F] px-2 py-1 text-sm text-white"
                            >
                              <option value="standard_rated">standard_rated</option>
                              <option value="zero_rated">zero_rated</option>
                              <option value="exempt">exempt</option>
                              <option value="out_of_scope">out_of_scope</option>
                              <option value="reverse_charge">reverse_charge</option>
                            </select>
                          )}
                        </td>
                        <td className="p-3 align-top text-right font-mono text-sm text-white">
                          {r.vat_amount_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3 align-top text-right text-sm">
                          <span
                            className={
                              r.confidence >= 0.9
                                ? "text-[#2DD4A0]"
                                : r.confidence >= 0.7
                                  ? "text-[#FFA940]"
                                  : "text-[#FF6B6B]"
                            }
                          >
                            {(r.confidence * 100).toFixed(1)}%
                          </span>
                          {r.needs_review && (
                            <span className="ml-1 text-[#FF6B6B]" title="Needs review">
                              ⚠
                            </span>
                          )}
                        </td>
                        <td className="p-3 align-top">
                          <textarea
                            value={notes[r.id] ?? ""}
                            onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                            disabled={r.is_verified}
                            rows={2}
                            placeholder="Optional note"
                            className="w-full resize-y rounded border border-[rgba(78,168,255,0.22)] bg-[#040D1F] p-2 text-xs text-white"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
