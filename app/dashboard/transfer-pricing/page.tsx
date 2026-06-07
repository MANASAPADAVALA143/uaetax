"use client";

export const dynamic = "force-dynamic";

import { useMemo, useState } from "react";

type DocStatus = "complete" | "partial" | "missing";
type TpMethod = "CUP" | "TNMM" | "Cost Plus" | "RPM" | "PSM";

interface RelatedPartyTransaction {
  id: string;
  partyName: string;
  relationship: string;
  transactionType: string;
  amountAed: number;
  armsLengthAed: number;
  method: TpMethod;
  docStatus: DocStatus;
}

const DEMO_TRANSACTIONS: RelatedPartyTransaction[] = [
  {
    id: "1",
    partyName: "GulfTax Holdings Ltd (BVI)",
    relationship: "Parent",
    transactionType: "Management services",
    amountAed: 2_400_000,
    armsLengthAed: 2_150_000,
    method: "TNMM",
    docStatus: "partial",
  },
  {
    id: "2",
    partyName: "GulfTax IP Holdings FZ-LLC",
    relationship: "Subsidiary",
    transactionType: "IP licensing",
    amountAed: 850_000,
    armsLengthAed: 850_000,
    method: "CUP",
    docStatus: "complete",
  },
  {
    id: "3",
    partyName: "GulfTax Singapore Pte Ltd",
    relationship: "Associate",
    transactionType: "Intercompany loan",
    amountAed: 5_000_000,
    armsLengthAed: 4_600_000,
    method: "CUP",
    docStatus: "missing",
  },
];

const DOC_STATUS: Record<DocStatus, { label: string; className: string }> = {
  complete: { label: "✅ Complete", className: "text-green" },
  partial: { label: "⚠️ Partial", className: "text-amber" },
  missing: { label: "🔴 Missing", className: "text-red" },
};

function fmt(n: number) {
  return n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TransferPricingPage() {
  const [transactions, setTransactions] = useState(DEMO_TRANSACTIONS);
  const [totalRelated, setTotalRelated] = useState("8200000");
  const [singleParty, setSingleParty] = useState("5000000");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTx, setNewTx] = useState({
    partyName: "",
    relationship: "Subsidiary",
    transactionType: "Services",
    amountAed: "",
    armsLengthAed: "",
    method: "TNMM" as TpMethod,
  });

  const [alDesc, setAlDesc] = useState("Management fee charged to UAE subsidiary");
  const [internalPrice, setInternalPrice] = useState("2400000");
  const [marketPrice, setMarketPrice] = useState("2150000");

  const [docChecks, setDocChecks] = useState({
    identification: true,
    register: true,
    benchmarking: false,
    masterFile: false,
    localFile: false,
    form17: false,
  });

  const threshold = useMemo(() => {
    const total = parseFloat(totalRelated) || 0;
    const single = parseFloat(singleParty) || 0;
    const required = total > 40_000_000 || single > 3_000_000;
    return { total, single, required };
  }, [totalRelated, singleParty]);

  const alVariance = useMemo(() => {
    const internal = parseFloat(internalPrice) || 0;
    const market = parseFloat(marketPrice) || 0;
    if (!market) return 0;
    return ((internal - market) / market) * 100;
  }, [internalPrice, marketPrice]);

  const docCompleteCount = Object.values(docChecks).filter(Boolean).length;

  const addTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(newTx.amountAed) || 0;
    const arms = parseFloat(newTx.armsLengthAed) || amount;
    setTransactions((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        partyName: newTx.partyName,
        relationship: newTx.relationship,
        transactionType: newTx.transactionType,
        amountAed: amount,
        armsLengthAed: arms,
        method: newTx.method,
        docStatus: "partial" as DocStatus,
      },
    ]);
    setShowAddForm(false);
    setNewTx({
      partyName: "",
      relationship: "Subsidiary",
      transactionType: "Services",
      amountAed: "",
      armsLengthAed: "",
      method: "TNMM",
    });
  };

  return (
    <>
      <div className="mb-7">
        <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
          // Transfer Pricing
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Transfer Pricing Register</h2>
        <p className="text-[13px] text-muted mt-1">
          UAE Corporate Tax — Ministerial Decision 97/2023 · Mandatory from FY 2024
        </p>
      </div>

      {/* Section 1 — Register */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Related Party Transaction Register</h3>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-pale text-gold-lt border border-border-g hover:bg-gold/20"
          >
            + Add Transaction
          </button>
        </div>

        {showAddForm && (
          <form onSubmit={addTransaction} className="px-6 py-4 border-b border-border grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              ["Party name", "partyName", "text"],
              ["Relationship", "relationship", "text"],
              ["Transaction type", "transactionType", "text"],
              ["Amount AED", "amountAed", "number"],
              ["Arm&apos;s length AED", "armsLengthAed", "number"],
            ].map(([label, key, type]) => (
              <label key={key} className="text-[11px] text-muted2">
                {label}
                <input
                  type={type}
                  required={key === "partyName" || key === "amountAed"}
                  value={(newTx as Record<string, string>)[key]}
                  onChange={(e) => setNewTx({ ...newTx, [key]: e.target.value })}
                  className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
                />
              </label>
            ))}
            <label className="text-[11px] text-muted2">
              TP Method
              <select
                value={newTx.method}
                onChange={(e) => setNewTx({ ...newTx, method: e.target.value as TpMethod })}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
              >
                {(["CUP", "TNMM", "Cost Plus", "RPM", "PSM"] as TpMethod[]).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
            <div className="md:col-span-3">
              <button type="submit" className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep">
                Save Transaction
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                {["Party", "Relationship", "Type", "Amount AED", "Arm&apos;s Length", "Variance", "Method", "Docs"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-muted2 uppercase text-[10px] font-mono whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transactions.map((t, i) => {
                const variance = t.amountAed - t.armsLengthAed;
                return (
                  <tr key={t.id} className={i % 2 ? "bg-[rgba(255,255,255,0.02)]" : ""}>
                    <td className="px-4 py-2.5 text-white">{t.partyName}</td>
                    <td className="px-4 py-2.5 text-muted">{t.relationship}</td>
                    <td className="px-4 py-2.5 text-muted">{t.transactionType}</td>
                    <td className="px-4 py-2.5 font-mono text-white">{fmt(t.amountAed)}</td>
                    <td className="px-4 py-2.5 font-mono text-muted">{fmt(t.armsLengthAed)}</td>
                    <td className={`px-4 py-2.5 font-mono ${variance > 0 ? "text-amber" : "text-green"}`}>
                      {variance >= 0 ? "+" : ""}{fmt(variance)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-gold-lt">{t.method}</td>
                    <td className={`px-4 py-2.5 font-mono text-[11px] ${DOC_STATUS[t.docStatus].className}`}>
                      {DOC_STATUS[t.docStatus].label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Section 2 — Threshold */}
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">TP Threshold Checker</h3>
          <div className="space-y-3 mb-4">
            <label className="block text-[11px] text-muted2">
              Total related party transactions (AED)
              <input
                type="number"
                value={totalRelated}
                onChange={(e) => setTotalRelated(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
              />
            </label>
            <label className="block text-[11px] text-muted2">
              Largest single-party transactions (AED)
              <input
                type="number"
                value={singleParty}
                onChange={(e) => setSingleParty(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
              />
            </label>
          </div>
          {threshold.required ? (
            <div className="rounded-lg border border-red/30 bg-[rgba(255,107,107,0.08)] p-4 text-sm space-y-1">
              <p className="text-red font-semibold">🔴 Master File required — submit to FTA</p>
              <p className="text-red">🔴 Local File required</p>
              <p className="text-muted2 text-[12px] mt-2">Deadline: 12 months after FY end</p>
            </div>
          ) : (
            <div className="rounded-lg border border-green/30 bg-[rgba(45,212,160,0.08)] p-4 text-sm">
              <p className="text-green font-semibold">✅ Below disclosure threshold</p>
              <p className="text-muted mt-1">Maintain internal documentation only</p>
            </div>
          )}
        </div>

        {/* Section 3 — Arm's length */}
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Arm&apos;s Length Analysis</h3>
          <label className="block text-[11px] text-muted2 mb-3">
            Transaction description
            <input
              value={alDesc}
              onChange={(e) => setAlDesc(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[11px] text-muted2">
              Internal price (AED)
              <input type="number" value={internalPrice} onChange={(e) => setInternalPrice(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono" />
            </label>
            <label className="text-[11px] text-muted2">
              Comparable market price (AED)
              <input type="number" value={marketPrice} onChange={(e) => setMarketPrice(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono" />
            </label>
          </div>
          <div className={`rounded-lg p-4 border ${Math.abs(alVariance) > 10 ? "border-amber/40 bg-[rgba(255,183,0,0.08)]" : "border-green/30 bg-[rgba(45,212,160,0.08)]"}`}>
            <p className="text-sm text-white">Variance: <span className="font-mono font-bold">{alVariance.toFixed(1)}%</span></p>
            {Math.abs(alVariance) > 10 ? (
              <p className="text-amber text-[12px] mt-1">⚠️ Variance exceeds 10% — flag for TP review</p>
            ) : (
              <p className="text-green text-[12px] mt-1">✅ Within acceptable arm&apos;s length range</p>
            )}
          </div>
        </div>
      </div>

      {/* Section 4 — Documentation */}
      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">TP Documentation Status</h3>
          <span className="font-mono text-gold-lt text-sm">{docCompleteCount}/6 complete</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
          <div className="h-2 rounded-full bg-gradient-to-r from-gold to-gold-lt" style={{ width: `${(docCompleteCount / 6) * 100}%` }} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(
            [
              ["identification", "Related party identification complete"],
              ["register", "Transaction register complete"],
              ["benchmarking", "Benchmarking analysis done"],
              ["masterFile", "Master File prepared"],
              ["localFile", "Local File prepared"],
              ["form17", "Disclosure Form 17 ready"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-[13px] text-muted cursor-pointer hover:text-white">
              <input
                type="checkbox"
                checked={docChecks[key]}
                onChange={(e) => setDocChecks({ ...docChecks, [key]: e.target.checked })}
                className="rounded border-border"
              />
              {docChecks[key] ? "☑" : "□"} {label}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
