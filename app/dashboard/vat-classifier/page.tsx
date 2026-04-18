"use client";

import { useState, useRef } from "react";
import axios from "axios";

interface ClassificationResult {
  description: string;
  vendor?: string;
  amount: string;
  vat_treatment: string;
  confidence: number;
  reasoning?: string;
}

export default function VATClassifier() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<ClassificationResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

    try {
      const formData = new FormData();
      formData.append("file", file);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await axios.post(
        `${apiUrl}/api/vat/classify`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );

      setResults(response.data.classifications || []);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Failed to classify transactions. Please try again."
      );
      console.error("Classification error:", err);
    } finally {
      setIsUploading(false);
    }
  };

  const getTreatmentClass = (treatment: string) => {
    if (treatment.includes("Standard") || treatment.includes("5%")) {
      return "pill-std";
    }
    if (treatment.includes("Zero")) {
      return "pill-zero";
    }
    if (treatment.includes("Exempt")) {
      return "pill-ex";
    }
    if (treatment.includes("Review") || treatment.includes("⚠")) {
      return "pill-flag";
    }
    if (treatment.includes("Out of Scope") || treatment.includes("OOS")) {
      return "pill-oos";
    }
    return "pill-std";
  };

  const getConfidenceClass = (confidence: number) => {
    return confidence >= 90 ? "hi" : confidence >= 70 ? "mid" : "low";
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
      </div>

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
          <h3 className="text-lg font-semibold text-white mb-2">
            No classifications yet
          </h3>
          <p className="text-sm text-muted">
            Upload a transaction file to get started with AI-powered VAT classification.
          </p>
        </div>
      )}
    </>
  );
}
