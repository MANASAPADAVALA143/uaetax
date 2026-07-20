"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";
import { apiClient } from "@/lib/api";

type Answer = "a" | "b" | "c";

interface GapRow {
  area: string;
  status: string;
  risk: string;
  action: string;
}

interface AssessResponse {
  score: number;
  phase: string;
  deadline: string;
  days_remaining: number;
  gaps: GapRow[];
  readiness_label: string;
}

const QUESTIONS: Array<{ key: number; q: string; options: Array<{ id: Answer; label: string }> }> = [
  {
    key: 0,
    q: "What is your annual revenue?",
    options: [
      { id: "a", label: "Above AED 150 million" },
      { id: "b", label: "AED 50M - AED 150M" },
      { id: "c", label: "Below AED 50M" },
    ],
  },
  {
    key: 1,
    q: "Is your ERP generating structured invoice data (not just PDF)?",
    options: [
      { id: "a", label: "Yes - we use SAP / Oracle / Microsoft D365" },
      { id: "b", label: "Partially - we use Tally / Zoho / QuickBooks" },
      { id: "c", label: "No - we generate invoices manually or in Excel" },
    ],
  },
  {
    key: 2,
    q: "Do you capture your customer TRNs on every invoice?",
    options: [
      { id: "a", label: "Yes - mandatory field in our system" },
      { id: "b", label: "Sometimes - not consistently" },
      { id: "c", label: "No - we don't always collect TRNs" },
    ],
  },
  {
    key: 3,
    q: "Have you appointed an Accredited Service Provider (ASP)?",
    options: [
      { id: "a", label: "Yes - already contracted" },
      { id: "b", label: "In discussion with one" },
      { id: "c", label: "No - not yet started" },
    ],
  },
  {
    key: 4,
    q: "Can your system generate PINT AE XML format?",
    options: [
      { id: "a", label: "Yes - already configured" },
      { id: "b", label: "Our vendor says they're working on it" },
      { id: "c", label: "No - we only generate PDF invoices" },
    ],
  },
];

function scoreClass(score: number): string {
  if (score >= 80) return "text-green border-green/30 bg-[rgba(45,212,160,0.12)]";
  if (score >= 50) return "text-amber border-amber/30 bg-[rgba(255,183,0,0.12)]";
  return "text-red border-red/30 bg-[rgba(255,107,107,0.12)]";
}

export default function EInvoicingReadinessPage() {
  const [answers, setAnswers] = useState<Array<Answer | null>>([null, null, null, null, null]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AssessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phase1Days = useMemo(() => {
    const target = new Date("2026-10-01T00:00:00+04:00");
    return Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86400000));
  }, []);

  function updateAnswer(index: number, value: Answer) {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  async function submitAssessment() {
    if (answers.some((a) => !a)) {
      setError("Please answer all 5 questions.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const payload = { answers: answers as Answer[] };
      const { data } = await apiClient.post<AssessResponse>("/api/einvoicing/assess", payload);
      setResult(data);
    } catch (e: unknown) {
      setError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Assessment failed.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPdf() {
    if (!result) return;
    const response = await apiClient.post("/api/einvoicing/export-pdf", result, { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "einvoicing-gap-report.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareScore() {
    if (!result) return;
    const txt = `E-Invoicing readiness: ${result.score}/100 (${result.readiness_label}) | ${result.phase} | ${result.days_remaining} days remaining`;
    await navigator.clipboard.writeText(txt);
  }

  return (
    <>
      <div className="bg-gradient-to-r from-[rgba(30,58,95,0.95)] to-[rgba(18,45,78,0.95)] border border-[rgba(78,168,255,0.35)] rounded-2xl p-6 mb-6">
        <h2 className="font-playfair text-[26px] font-bold mb-1">UAE Peppol E-Invoicing - Are You Ready?</h2>
        <p className="text-sm text-muted mb-3">
          FTA Peppol PINT AE pilot launching July 2026. Phase 1 (&gt; AED 150M): October 2026. Phase 2 (&gt; AED 50M): January 2027.
        </p>
        <div className="inline-flex px-3 py-1.5 rounded-full border border-red/35 text-red bg-[rgba(255,107,107,0.15)] text-xs font-mono">
          {phase1Days} days remaining to Phase 1 compliance
        </div>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border-g rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-semibold text-white mb-4">Readiness Assessment</h3>
        <div className="space-y-5">
          {QUESTIONS.map((q, idx) => (
            <div key={q.key}>
              <div className="text-sm text-white mb-2">{idx + 1}. {q.q}</div>
              <div className="space-y-1.5">
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 text-xs text-muted cursor-pointer">
                    <input type="radio" name={`q-${idx}`} checked={answers[idx] === o.id} onChange={() => updateAnswer(idx, o.id)} />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error && <div className="mt-3 text-xs text-red">{error}</div>}
        <button onClick={submitAssessment} disabled={loading} className="mt-5 px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-60">
          {loading ? "Scoring..." : "Submit Assessment"}
        </button>
      </div>

      {result && (
        <>
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">Readiness Score</h3>
            <div className="flex flex-wrap items-center gap-5">
              <div className={`w-20 h-20 rounded-full border-2 flex flex-col items-center justify-center ${scoreClass(result.score)}`}>
                <div className="text-lg font-bold">{result.score}</div>
                <div className="text-[10px]">/100</div>
              </div>
              <div>
                <div className="text-sm text-white">{result.readiness_label}</div>
                <div className={`text-xs mt-1 ${result.phase.includes("Phase 1") ? "text-red" : result.phase.includes("Phase 2") ? "text-amber" : "text-green"}`}>
                  {result.phase} ({result.days_remaining} days away)
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 mb-6">
            <h3 className="text-sm font-semibold text-white mb-4">Your Gaps & What to Do</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted2">
                    <th className="text-left py-2">Area</th>
                    <th className="text-left py-2">Your Status</th>
                    <th className="text-left py-2">Risk</th>
                    <th className="text-left py-2">Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  {result.gaps.map((g) => (
                    <tr key={g.area} className="border-b border-border/60">
                      <td className="py-2">{g.area}</td>
                      <td className="py-2">{g.status}</td>
                      <td className="py-2">{g.risk}</td>
                      <td className="py-2">{g.action}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3 mb-3">
            <button onClick={downloadPdf} className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep">
              Download Gap Report PDF
            </button>
            <button onClick={shareScore} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-border-g text-gold hover:bg-gold-pale">
              Share Readiness Score
            </button>
          </div>
        </>
      )}
    </>
  );
}
