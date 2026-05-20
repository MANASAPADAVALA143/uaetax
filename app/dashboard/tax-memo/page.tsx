"use client";

import { useState, useRef } from "react";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type MemoType = "VAT_PERIOD" | "CT_ANNUAL" | "RISK_ALERT" | "BOARD_UPDATE";

interface MemoResponse {
  memo_id: number;
  memo_text: string;
  memo_type: string;
  period: string;
  data_used: Record<string, unknown>;
  generated_at: string;
  cached: boolean;
}

interface HistoryItem {
  id: number;
  memo_type: string;
  period: string;
  memo_text: string;
  generated_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MEMO_TYPES: { value: MemoType; label: string; desc: string; icon: string }[] = [
  {
    value: "VAT_PERIOD",
    label: "VAT Period Summary",
    desc: "VAT position, liabilities, input recovery and filing status",
    icon: "📋",
  },
  {
    value: "CT_ANNUAL",
    label: "CT Annual Update",
    desc: "Corporate Tax taxable income, payable and QFZP status",
    icon: "🏛️",
  },
  {
    value: "RISK_ALERT",
    label: "Risk Alert Memo",
    desc: "Flags high-risk transactions, missing TRNs and audit exposure",
    icon: "⚠️",
  },
  {
    value: "BOARD_UPDATE",
    label: "Board Update",
    desc: "Executive summary of all tax obligations for board packs",
    icon: "📊",
  },
];

const PERIOD_SUGGESTIONS = ["Q1-2025", "Q2-2025", "Q3-2025", "Q4-2025", "FY-2025", "Q1-2026"];

const TYPE_LABELS: Record<string, string> = {
  VAT_PERIOD: "VAT Period",
  CT_ANNUAL: "CT Annual",
  RISK_ALERT: "Risk Alert",
  BOARD_UPDATE: "Board Update",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function healthColor(score: number): string {
  if (score >= 80) return "#4ade80";
  if (score >= 60) return "#f59e0b";
  return "#ef4444";
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TaxMemoPage() {
  const [tab, setTab] = useState<"generate" | "history">("generate");

  // Generate form state
  const [memoType, setMemoType] = useState<MemoType>("VAT_PERIOD");
  const [period, setPeriod] = useState("Q1-2025");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memo, setMemo] = useState<MemoResponse | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryItem | null>(null);

  // Copy toast
  const [copied, setCopied] = useState(false);
  const memoRef = useRef<HTMLDivElement>(null);

  // ── Generate ──────────────────────────────────────────────────
  async function handleGenerate(regenerate = false) {
    setLoading(true);
    setError(null);
    setMemo(null);

    try {
      const { data } = await apiClient.post<MemoResponse>("/api/tax/generate-memo", {
        memo_type: memoType,
        period,
        regenerate,
      });
      setMemo(data);
      setTab("generate");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Failed to generate memo. Please check that ANTHROPIC_API_KEY is configured on the backend.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── History ───────────────────────────────────────────────────
  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const { data } = await apiClient.get<HistoryItem[]>("/api/tax/memos");
      setHistory(data);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function switchToHistory() {
    setTab("history");
    loadHistory();
  }

  // ── Copy ──────────────────────────────────────────────────────
  function copyMemo(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Download PDF (plain text fallback) ───────────────────────
  function downloadMemo(text: string, filename: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Email to CFO ──────────────────────────────────────────────
  function emailCFO(text: string, subject: string) {
    const encodedBody = encodeURIComponent(text);
    const encodedSubject = encodeURIComponent(`GulfTax AI — ${subject}`);
    window.open(`mailto:?subject=${encodedSubject}&body=${encodedBody}`);
  }

  // ── Render ────────────────────────────────────────────────────
  const currentMemoText = memo?.memo_text || selectedHistory?.memo_text || null;
  const currentPeriod = memo?.period || selectedHistory?.period || period;
  const currentType = memo?.memo_type || selectedHistory?.memo_type || memoType;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🗒️ AI Tax Memo Generator
          </h1>
          <p className="text-muted text-sm mt-1">
            Generate board-ready UAE tax memos from your live data — VAT, CT, Risk & Board packs.
            Cites Federal Decree-Laws automatically.
          </p>
        </div>
        <div className="text-right text-xs text-muted2 font-mono">
          Powered by Claude AI
          <div className="text-[10px] opacity-50 mt-0.5">All figures pulled from your DB</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-[rgba(255,255,255,0.04)] rounded-xl border border-[rgba(78,168,255,0.1)] w-fit">
        <button
          onClick={() => setTab("generate")}
          className={`px-5 py-2 rounded-[10px] text-sm font-medium transition-all ${
            tab === "generate"
              ? "bg-[rgba(78,168,255,0.15)] text-blue-300 border border-[rgba(78,168,255,0.25)]"
              : "text-muted hover:text-white"
          }`}
        >
          Generate Memo
        </button>
        <button
          onClick={switchToHistory}
          className={`px-5 py-2 rounded-[10px] text-sm font-medium transition-all ${
            tab === "history"
              ? "bg-[rgba(78,168,255,0.15)] text-blue-300 border border-[rgba(78,168,255,0.25)]"
              : "text-muted hover:text-white"
          }`}
        >
          Memo History
        </button>
      </div>

      {/* ── GENERATE TAB ─────────────────────────────────────── */}
      {tab === "generate" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config panel */}
          <div className="lg:col-span-1 space-y-5">
            <div className="bg-[rgba(4,12,30,0.85)] border border-[rgba(78,168,255,0.12)] rounded-2xl p-5 space-y-5">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wide">
                Memo Settings
              </h2>

              {/* Memo type */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted uppercase tracking-wide">
                  Memo Type
                </label>
                <div className="space-y-2">
                  {MEMO_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setMemoType(t.value)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                        memoType === t.value
                          ? "bg-[rgba(78,168,255,0.12)] border-[rgba(78,168,255,0.35)] text-white"
                          : "border-[rgba(255,255,255,0.06)] text-muted hover:border-[rgba(78,168,255,0.2)] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <span>{t.icon}</span>
                        <span>{t.label}</span>
                      </div>
                      <p className="text-[11px] text-muted2 mt-0.5 ml-6">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Period */}
              <div className="space-y-2">
                <label className="text-xs font-mono text-muted uppercase tracking-wide">
                  Period
                </label>
                <input
                  type="text"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="e.g. Q1-2025 or FY-2025"
                  className="w-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.1)] rounded-xl px-3 py-2 text-sm text-white placeholder-muted2 focus:outline-none focus:border-[rgba(78,168,255,0.4)]"
                />
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {PERIOD_SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setPeriod(s)}
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-mono transition-all ${
                        period === s
                          ? "bg-[rgba(78,168,255,0.15)] border-[rgba(78,168,255,0.3)] text-blue-300"
                          : "border-[rgba(255,255,255,0.08)] text-muted2 hover:text-white hover:border-[rgba(255,255,255,0.2)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={() => handleGenerate(false)}
                disabled={loading || !period.trim()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Preparing memo…
                  </span>
                ) : (
                  "Generate Memo"
                )}
              </button>

              {loading && (
                <p className="text-xs text-muted2 text-center animate-pulse">
                  Pulling live data + drafting with Claude… 10–15 seconds
                </p>
              )}

              {memo && (
                <button
                  onClick={() => handleGenerate(true)}
                  disabled={loading}
                  className="w-full py-2 rounded-xl border border-[rgba(255,255,255,0.1)] text-muted text-xs font-medium hover:text-white hover:border-[rgba(255,255,255,0.2)] transition-all disabled:opacity-50"
                >
                  ↺ Regenerate (force refresh)
                </button>
              )}
            </div>
          </div>

          {/* Right: Memo display */}
          <div className="lg:col-span-2">
            {error && (
              <div className="bg-[rgba(239,68,68,0.1)] border border-red-500/30 rounded-2xl p-5 text-red-400 text-sm">
                <p className="font-semibold mb-1">Error generating memo</p>
                <p className="text-xs">{error}</p>
              </div>
            )}

            {!memo && !error && !loading && (
              <div className="flex flex-col items-center justify-center h-72 rounded-2xl border border-dashed border-[rgba(78,168,255,0.15)] text-center space-y-3">
                <div className="text-5xl opacity-30">🗒️</div>
                <p className="text-muted text-sm">
                  Select memo type and period, then click{" "}
                  <span className="text-blue-400">Generate Memo</span>
                </p>
                <p className="text-muted2 text-xs max-w-xs">
                  The AI pulls your live VAT, CT and transaction data — all numbers come from your
                  database, not hallucinated.
                </p>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-72 rounded-2xl border border-[rgba(78,168,255,0.1)] bg-[rgba(4,12,30,0.6)]">
                <div className="w-10 h-10 border-4 border-[rgba(78,168,255,0.2)] border-t-blue-400 rounded-full animate-spin mb-4" />
                <p className="text-white text-sm font-medium">Generating your memo…</p>
                <p className="text-muted2 text-xs mt-1">Pulling live data and drafting with Claude</p>
                <div className="mt-4 flex gap-1.5">
                  {["Fetching VAT data", "CT position", "Risk flags", "Drafting memo"].map(
                    (step, i) => (
                      <span
                        key={step}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[rgba(78,168,255,0.08)] text-blue-400/60 border border-[rgba(78,168,255,0.1)]"
                        style={{ animationDelay: `${i * 0.5}s` }}
                      >
                        {step}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}

            {memo && !loading && (
              <div className="bg-[rgba(4,12,30,0.85)] border border-[rgba(78,168,255,0.15)] rounded-2xl overflow-hidden">
                {/* Memo header */}
                <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">
                      {MEMO_TYPES.find((t) => t.value === memo.memo_type)?.icon || "🗒️"}
                    </span>
                    <div>
                      <p className="text-white text-sm font-semibold">
                        {TYPE_LABELS[memo.memo_type] || memo.memo_type} — {memo.period}
                      </p>
                      <p className="text-muted2 text-xs">
                        Generated {fmtDate(memo.generated_at)}
                        {memo.cached && (
                          <span className="ml-2 text-amber-400/80 text-[10px]">(cached)</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Health score badge */}
                  {memo.data_used?.health_score !== undefined && (
                    <div
                      className="flex flex-col items-center px-3 py-1.5 rounded-xl border"
                      style={{
                        borderColor: `${healthColor(memo.data_used.health_score as number)}40`,
                        backgroundColor: `${healthColor(memo.data_used.health_score as number)}10`,
                      }}
                    >
                      <span
                        className="text-lg font-bold font-mono"
                        style={{ color: healthColor(memo.data_used.health_score as number) }}
                      >
                        {memo.data_used.health_score as number}
                      </span>
                      <span className="text-[10px] text-muted2 uppercase tracking-wide">
                        Health
                      </span>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="px-5 py-3 border-b border-[rgba(255,255,255,0.06)] flex gap-2 flex-wrap">
                  <button
                    onClick={() => copyMemo(memo.memo_text)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white hover:border-[rgba(78,168,255,0.3)] transition-all"
                  >
                    {copied ? "✓ Copied!" : "📋 Copy"}
                  </button>
                  <button
                    onClick={() =>
                      downloadMemo(
                        memo.memo_text,
                        `TaxMemo_${memo.memo_type}_${memo.period.replace("-", "_")}.txt`
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white hover:border-[rgba(78,168,255,0.3)] transition-all"
                  >
                    ⬇️ Download
                  </button>
                  <button
                    onClick={() =>
                      emailCFO(
                        memo.memo_text,
                        `${TYPE_LABELS[memo.memo_type] || memo.memo_type} — ${memo.period}`
                      )
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white hover:border-[rgba(78,168,255,0.3)] transition-all"
                  >
                    ✉️ Email to CFO
                  </button>
                </div>

                {/* Memo text */}
                <div ref={memoRef} className="p-6 overflow-y-auto max-h-[60vh]">
                  <MemoText text={memo.memo_text} />
                </div>

                {/* Disclaimer bar */}
                <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(255,165,0,0.05)]">
                  <p className="text-[11px] text-amber-400/70 text-center font-mono">
                    ⚠️ AI-assisted memo — requires review by a qualified UAE tax advisor before
                    submission or board presentation
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY TAB ──────────────────────────────────────────── */}
      {tab === "history" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* History list */}
          <div className="lg:col-span-1 space-y-2">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide mb-3">
              Past Memos
            </h2>

            {historyLoading && (
              <div className="text-muted text-sm text-center py-8 animate-pulse">
                Loading history…
              </div>
            )}

            {!historyLoading && history.length === 0 && (
              <div className="text-center py-10 text-muted2 text-sm">
                <p className="text-3xl mb-2">📭</p>
                <p>No memos generated yet.</p>
                <button
                  onClick={() => setTab("generate")}
                  className="mt-3 text-blue-400 text-xs hover:underline"
                >
                  Generate your first memo →
                </button>
              </div>
            )}

            {history.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedHistory(item)}
                className={`w-full text-left px-4 py-3 rounded-xl border transition-all ${
                  selectedHistory?.id === item.id
                    ? "bg-[rgba(78,168,255,0.1)] border-[rgba(78,168,255,0.3)] text-white"
                    : "border-[rgba(255,255,255,0.06)] text-muted hover:text-white hover:border-[rgba(78,168,255,0.15)]"
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>
                    {MEMO_TYPES.find((t) => t.value === item.memo_type)?.icon || "🗒️"}
                  </span>
                  <span>{TYPE_LABELS[item.memo_type] || item.memo_type}</span>
                  <span className="ml-auto text-xs font-mono text-muted2 bg-[rgba(255,255,255,0.04)] px-1.5 rounded">
                    {item.period}
                  </span>
                </div>
                <p className="text-[11px] text-muted2 mt-1">{fmtDate(item.generated_at)}</p>
              </button>
            ))}
          </div>

          {/* Selected memo viewer */}
          <div className="lg:col-span-2">
            {!selectedHistory && (
              <div className="flex flex-col items-center justify-center h-72 rounded-2xl border border-dashed border-[rgba(78,168,255,0.1)] text-muted text-sm">
                <p className="text-3xl mb-3 opacity-30">👈</p>
                <p>Select a memo from the list to view</p>
              </div>
            )}

            {selectedHistory && (
              <div className="bg-[rgba(4,12,30,0.85)] border border-[rgba(78,168,255,0.15)] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
                  <div>
                    <p className="text-white text-sm font-semibold">
                      {TYPE_LABELS[selectedHistory.memo_type] || selectedHistory.memo_type} —{" "}
                      {selectedHistory.period}
                    </p>
                    <p className="text-muted2 text-xs">{fmtDate(selectedHistory.generated_at)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyMemo(selectedHistory.memo_text)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white transition-all"
                    >
                      {copied ? "✓ Copied!" : "📋 Copy"}
                    </button>
                    <button
                      onClick={() =>
                        downloadMemo(
                          selectedHistory.memo_text,
                          `TaxMemo_${selectedHistory.memo_type}_${selectedHistory.period}.txt`
                        )
                      }
                      className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white transition-all"
                    >
                      ⬇️ Download
                    </button>
                    <button
                      onClick={() =>
                        emailCFO(
                          selectedHistory.memo_text,
                          `${TYPE_LABELS[selectedHistory.memo_type]} — ${selectedHistory.period}`
                        )
                      }
                      className="px-3 py-1.5 text-xs rounded-lg border border-[rgba(255,255,255,0.1)] text-muted hover:text-white transition-all"
                    >
                      ✉️ Email
                    </button>
                  </div>
                </div>
                <div className="p-6 overflow-y-auto max-h-[60vh]">
                  <MemoText text={selectedHistory.memo_text} />
                </div>
                <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.06)] bg-[rgba(255,165,0,0.05)]">
                  <p className="text-[11px] text-amber-400/70 text-center font-mono">
                    ⚠️ AI-assisted memo — requires review by a qualified UAE tax advisor before
                    submission or board presentation
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── MemoText: renders structured memo with section headings highlighted ────────

function MemoText({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="font-mono text-[13px] leading-relaxed text-[#c8d8f0] space-y-1">
      {lines.map((line, i) => {
        // Section headings (ALL CAPS lines or lines ending with colon that look like headings)
        const isHeading =
          /^[A-Z][A-Z\s\/\-:]{4,}$/.test(line.trim()) ||
          /^#{1,3}\s/.test(line) ||
          (line.trim().endsWith(":") && line.trim().length < 50 && /^[A-Z]/.test(line.trim()));

        if (isHeading) {
          return (
            <p
              key={i}
              className="text-blue-300 font-bold text-[11px] uppercase tracking-widest mt-4 mb-1 border-b border-[rgba(78,168,255,0.15)] pb-0.5"
            >
              {line.replace(/^#+\s/, "").replace(/:$/, "")}
            </p>
          );
        }

        // Disclaimer line
        if (line.startsWith("---") || line.includes("AI-assisted")) {
          return (
            <p key={i} className="text-amber-400/60 text-[11px] mt-4 pt-3 border-t border-[rgba(255,255,255,0.06)]">
              {line}
            </p>
          );
        }

        // Numbered items
        if (/^\d+\./.test(line.trim())) {
          return (
            <p key={i} className="text-[#e8f4ff] ml-2">
              {line}
            </p>
          );
        }

        // Dash bullets
        if (/^[-•]/.test(line.trim())) {
          return (
            <p key={i} className="text-[#b0c8e8] ml-2">
              {line}
            </p>
          );
        }

        // Empty line
        if (!line.trim()) {
          return <div key={i} className="h-2" />;
        }

        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
