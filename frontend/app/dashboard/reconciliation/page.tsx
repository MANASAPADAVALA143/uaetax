"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { RefreshCw, Download, CheckCircle, AlertTriangle } from "lucide-react";

interface Mismatch {
  invoice_number: string;
  issue: string;
  transaction_amount: number;
  return_amount: number;
  difference: number;
}

export default function Reconciliation() {
  const [vatReturnId, setVatReturnId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [availableReturns, setAvailableReturns] = useState<any[]>([]);

  useEffect(() => {
    // Fetch available VAT returns
    const fetchReturns = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        // This would be a GET endpoint to fetch returns
        // For now, using mock data
        setAvailableReturns([
          { id: 1, period: "Q1 2025", period_start: "2025-01-01", period_end: "2025-03-31" },
        ]);
      } catch (err) {
        console.error("Failed to fetch returns:", err);
      }
    };
    fetchReturns();
  }, []);

  const handleReconcile = async () => {
    if (!vatReturnId) {
      setError("Please select a VAT return");
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await axios.post(
        `${apiUrl}/api/vat/reconcile/${vatReturnId}`
      );

      setResult(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to run reconciliation");
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportMismatches = () => {
    if (!result?.mismatches || result.mismatches.length === 0) return;

    const csv = [
      ["Invoice Number", "Issue", "Transaction Amount", "Return Amount", "Difference"],
      ...result.mismatches.map((m: Mismatch) => [
        m.invoice_number,
        m.issue,
        m.transaction_amount.toString(),
        m.return_amount.toString(),
        m.difference.toString(),
      ]),
    ]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reconciliation_mismatches.csv";
    a.click();
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Reconciliation</h1>
        <p className="text-[#7A9BB5]">Reconcile VAT returns with invoice transactions</p>
      </div>

      {/* VAT Return Selector */}
      <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Select VAT Return</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-[#7A9BB5] mb-2">VAT Return</label>
            <select
              value={vatReturnId || ""}
              onChange={(e) => setVatReturnId(Number(e.target.value))}
              className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#4EA8FF]"
            >
              <option value="">Select a VAT return...</option>
              {availableReturns.map((ret) => (
                <option key={ret.id} value={ret.id}>
                  {ret.period} ({ret.period_start} to {ret.period_end})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleReconcile}
            disabled={!vatReturnId || isRunning}
            className="bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] text-[#040D1F] px-6 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isRunning ? "animate-spin" : ""}`} />
            {isRunning ? "Running..." : "Run Reconciliation"}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.25)] rounded-lg">
            <p className="text-[#FF6B6B] text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Status Card */}
          <div
            className={`p-6 rounded-xl border-2 ${
              result.status === "matched"
                ? "bg-[rgba(45,212,160,0.12)] border-[rgba(45,212,160,0.25)]"
                : "bg-[rgba(255,169,64,0.12)] border-[rgba(255,169,64,0.25)]"
            }`}
          >
            <div className="flex items-center gap-4">
              {result.status === "matched" ? (
                <CheckCircle className="w-8 h-8 text-[#2DD4A0]" />
              ) : (
                <AlertTriangle className="w-8 h-8 text-[#FFA940]" />
              )}
              <div>
                <h3 className="text-xl font-bold text-white mb-1">
                  {result.status === "matched" ? "Matched ✅" : "Mismatches Found ⚠️"}
                </h3>
                <p className="text-[#7A9BB5]">
                  {result.status === "matched"
                    ? "All transactions match the VAT return"
                    : `Total difference: ${result.difference_aed.toLocaleString("en-AE", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} AED`}
                </p>
              </div>
            </div>
          </div>

          {/* Mismatches Table */}
          {result.mismatches && result.mismatches.length > 0 && (
            <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl overflow-hidden">
              <div className="p-6 border-b border-[rgba(78,168,255,0.12)] flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">
                  Mismatches ({result.mismatches.length})
                </h2>
                <button
                  onClick={handleExportMismatches}
                  className="flex items-center gap-2 bg-[#0A1A35] border border-[rgba(78,168,255,0.22)] text-white px-4 py-2 rounded-lg hover:border-[rgba(201,168,76,0.22)] transition-all"
                >
                  <Download className="w-4 h-4" />
                  Export to Excel
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[rgba(78,168,255,0.12)]">
                      <th className="text-left p-4 text-sm text-[#7A9BB5] font-medium uppercase">
                        Invoice
                      </th>
                      <th className="text-left p-4 text-sm text-[#7A9BB5] font-medium uppercase">
                        Issue
                      </th>
                      <th className="text-right p-4 text-sm text-[#7A9BB5] font-medium uppercase">
                        Transaction Amount
                      </th>
                      <th className="text-right p-4 text-sm text-[#7A9BB5] font-medium uppercase">
                        Return Amount
                      </th>
                      <th className="text-right p-4 text-sm text-[#7A9BB5] font-medium uppercase">
                        Difference AED
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.mismatches.map((mismatch: Mismatch, index: number) => (
                      <tr
                        key={index}
                        className="border-b border-[rgba(78,168,255,0.08)] hover:bg-[rgba(20,50,100,0.25)]"
                      >
                        <td className="p-4 text-white text-sm font-mono">
                          {mismatch.invoice_number}
                        </td>
                        <td className="p-4 text-white text-sm">{mismatch.issue}</td>
                        <td className="p-4 text-white text-sm text-right font-mono">
                          {mismatch.transaction_amount.toLocaleString("en-AE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          AED
                        </td>
                        <td className="p-4 text-white text-sm text-right font-mono">
                          {mismatch.return_amount.toLocaleString("en-AE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          AED
                        </td>
                        <td className="p-4 text-[#FF6B6B] text-sm text-right font-mono font-semibold">
                          {mismatch.difference.toLocaleString("en-AE", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{" "}
                          AED
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Recommendation */}
          {result.recommendation && (
            <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">AI Recommendation</h2>
              <div className="bg-[#071228] border border-[rgba(78,168,255,0.12)] rounded-lg p-4">
                <p className="text-[#7A9BB5] leading-relaxed">{result.recommendation}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
