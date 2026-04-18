"use client";

import { useState } from "react";
import axios from "axios";
import { Download, FileText, Send } from "lucide-react";

export default function VATReturn() {
  const [periodStart, setPeriodStart] = useState("2025-01-01");
  const [periodEnd, setPeriodEnd] = useState("2025-03-31");
  const [isGenerating, setIsGenerating] = useState(false);
  const [returnData, setReturnData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const quarters = [
    { label: "Q1 2025", start: "2025-01-01", end: "2025-03-31" },
    { label: "Q2 2025", start: "2025-04-01", end: "2025-06-30" },
    { label: "Q3 2025", start: "2025-07-01", end: "2025-09-30" },
    { label: "Q4 2025", start: "2025-10-01", end: "2025-12-31" },
  ];

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await axios.post(`${apiUrl}/api/vat/generate-return`, {
        company_id: 1,
        period_start: periodStart,
        period_end: periodEnd,
      });

      setReturnData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate VAT return");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    if (returnData?.pdf_url) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      window.open(`${apiUrl}${returnData.pdf_url}`, "_blank");
    }
  };

  const handleDownloadExcel = () => {
    if (returnData?.excel_url) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      window.open(`${apiUrl}${returnData.excel_url}`, "_blank");
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">VAT Return Generator</h1>
        <p className="text-[#7A9BB5]">Generate FTA-compliant VAT returns for your company</p>
      </div>

      {/* Period Selector */}
      <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6 mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Select Period</h2>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm text-[#7A9BB5] mb-2">Quarter</label>
            <select
              value={quarters.find((q) => q.start === periodStart && q.end === periodEnd)?.label || ""}
              onChange={(e) => {
                const quarter = quarters.find((q) => q.label === e.target.value);
                if (quarter) {
                  setPeriodStart(quarter.start);
                  setPeriodEnd(quarter.end);
                }
              }}
              className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#4EA8FF]"
            >
              {quarters.map((q) => (
                <option key={q.label} value={q.label}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-[#7A9BB5] mb-2">Start Date</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#4EA8FF]"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-[#7A9BB5] mb-2">End Date</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              className="w-full bg-[#071228] border border-[rgba(78,168,255,0.22)] rounded-lg px-4 py-2 text-white focus:outline-none focus:border-[#4EA8FF]"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] text-[#040D1F] px-6 py-2 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all"
          >
            {isGenerating ? "Generating..." : "Generate Return"}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-[rgba(255,107,107,0.12)] border border-[rgba(255,107,107,0.25)] rounded-lg">
            <p className="text-[#FF6B6B] text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* VAT Return Boxes */}
      {returnData && (
        <div className="space-y-6">
          <div className="bg-[#0A1A35] border border-[rgba(78,168,255,0.12)] rounded-xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-white">FTA VAT Return - All 8 Boxes</h2>
              <div className="flex gap-3">
                <button
                  onClick={handleDownloadPDF}
                  className="flex items-center gap-2 bg-[#0A1A35] border border-[rgba(78,168,255,0.22)] text-white px-4 py-2 rounded-lg hover:border-[rgba(201,168,76,0.22)] transition-all"
                >
                  <FileText className="w-4 h-4" />
                  Download PDF
                </button>
                <button
                  onClick={handleDownloadExcel}
                  className="flex items-center gap-2 bg-[#0A1A35] border border-[rgba(78,168,255,0.22)] text-white px-4 py-2 rounded-lg hover:border-[rgba(201,168,76,0.22)] transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Excel
                </button>
                <button className="flex items-center gap-2 bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] text-[#040D1F] px-4 py-2 rounded-lg font-semibold hover:shadow-lg transition-all">
                  <Send className="w-4 h-4" />
                  Submit to FTA
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Box 1: Standard Rated Supplies", value: returnData.box1_standard_rated_supplies },
                { label: "Box 2: VAT on Supplies (5%)", value: returnData.box2_vat_on_supplies },
                { label: "Box 3: Zero Rated Supplies", value: returnData.box3_zero_rated_supplies },
                { label: "Box 4: Exempt Supplies", value: returnData.box4_exempt_supplies },
                { label: "Box 5: Total Taxable Supplies", value: returnData.box5_total_taxable_supplies },
                { label: "Box 6: Taxable Expenses", value: returnData.box6_taxable_expenses },
                { label: "Box 7: VAT on Expenses (5%)", value: returnData.box7_vat_on_expenses },
              ].map((box, index) => (
                <div
                  key={index}
                  className="bg-[#071228] border border-[rgba(78,168,255,0.12)] rounded-lg p-4"
                >
                  <div className="text-sm text-[#7A9BB5] mb-2">{box.label}</div>
                  <div className="text-2xl font-bold text-white font-mono">
                    {box.value.toLocaleString("en-AE", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    AED
                  </div>
                </div>
              ))}
            </div>

            {/* Box 8 Highlighted */}
            <div
              className={`mt-6 p-6 rounded-lg border-2 ${
                returnData.box8_vat_payable_or_refundable > 0
                  ? "bg-[rgba(255,107,107,0.12)] border-[rgba(255,107,107,0.25)]"
                  : "bg-[rgba(45,212,160,0.12)] border-[rgba(45,212,160,0.25)]"
              }`}
            >
              <div className="text-sm text-[#7A9BB5] mb-2">Box 8: VAT Payable/Refundable</div>
              <div
                className={`text-3xl font-bold font-mono ${
                  returnData.box8_vat_payable_or_refundable > 0
                    ? "text-[#FF6B6B]"
                    : "text-[#2DD4A0]"
                }`}
              >
                {returnData.box8_vat_payable_or_refundable > 0 ? "Payable" : "Refundable"}:{" "}
                {Math.abs(returnData.box8_vat_payable_or_refundable).toLocaleString("en-AE", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                AED
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
