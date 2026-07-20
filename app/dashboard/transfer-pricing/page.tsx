"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { apiClient } from "@/lib/api";

type DocStatus = "complete" | "partial" | "missing";
type TpMethod = "CUP" | "TNMM" | "Cost Plus" | "RPM" | "PSM";

interface RelatedPartyTransaction {
  id: number;
  party_name: string;
  relationship: string;
  transaction_type: string;
  amount_aed: number;
  arms_length_aed: number;
  method: TpMethod;
  doc_status: DocStatus;
}

interface ThresholdCheck {
  documentation_required: boolean;
  flags: string[];
  recommendation: string;
  party_ytd_total_aed?: number;
  aggregate_related_party_aed?: number;
  thresholds?: { per_party_aed: number; aggregate_aed: number };
}

interface Summary {
  total_related_aed: number;
  largest_single_party_aed: number;
  largest_party_name: string | null;
  transaction_count: number;
}

type DocChecks = {
  identification: boolean;
  register_complete: boolean;
  benchmarking: boolean;
  masterFile: boolean;
  localFile: boolean;
  form17: boolean;
};

const DOC_STATUS: Record<DocStatus, { label: string; className: string }> = {
  complete: { label: "Complete", className: "text-green" },
  partial: { label: "Partial", className: "text-amber" },
  missing: { label: "Missing", className: "text-red" },
};

const EMPTY_DOCS: DocChecks = {
  identification: false,
  register_complete: false,
  benchmarking: false,
  masterFile: false,
  localFile: false,
  form17: false,
};

function fmt(n: number) {
  return n.toLocaleString("en-AE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function TransferPricingPage() {
  const [transactions, setTransactions] = useState<RelatedPartyTransaction[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [threshold, setThreshold] = useState<ThresholdCheck | null>(null);
  const [docChecks, setDocChecks] = useState<DocChecks>(EMPTY_DOCS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTx, setNewTx] = useState({
    party_name: "",
    relationship: "Subsidiary",
    transaction_type: "Services",
    amount_aed: "",
    arms_length_aed: "",
    method: "TNMM" as TpMethod,
  });

  const [alDesc, setAlDesc] = useState("");
  const [internalPrice, setInternalPrice] = useState("");
  const [marketPrice, setMarketPrice] = useState("");
  const [alApiResult, setAlApiResult] = useState<ThresholdCheck | null>(null);
  const [alRunning, setAlRunning] = useState(false);

  const loadRegister = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txRes, docsRes] = await Promise.all([
        apiClient.get("/api/corporatetax/tp-transactions"),
        apiClient.get("/api/corporatetax/tp-docs"),
      ]);
      setTransactions(txRes.data.transactions || []);
      setSummary(txRes.data.summary || null);
      setThreshold(txRes.data.threshold_check || null);
      setDocChecks({ ...EMPTY_DOCS, ...(docsRes.data.docs || {}) });
      if (txRes.data.note) setInfo(txRes.data.note);
    } catch (e: unknown) {
      const ax = axios.isAxiosError(e);
      const msg = ax
        ? (e.response?.data as { detail?: string })?.detail || e.message
        : "Failed to load transfer pricing register";
      setError(typeof msg === "string" ? msg : "Failed to load transfer pricing register");
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const alVariance = useMemo(() => {
    const internal = parseFloat(internalPrice) || 0;
    const market = parseFloat(marketPrice) || 0;
    if (!market) return 0;
    return ((internal - market) / market) * 100;
  }, [internalPrice, marketPrice]);

  const docCompleteCount = Object.values(docChecks).filter(Boolean).length;

  const addTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const amount = parseFloat(newTx.amount_aed) || 0;
      const arms = newTx.arms_length_aed ? parseFloat(newTx.arms_length_aed) : amount;
      const { data } = await apiClient.post("/api/corporatetax/tp-transactions", {
        party_name: newTx.party_name,
        relationship: newTx.relationship,
        transaction_type: newTx.transaction_type,
        amount_aed: amount,
        arms_length_aed: arms,
        method: newTx.method,
        doc_status: "partial",
      });
      setShowAddForm(false);
      setNewTx({
        party_name: "",
        relationship: "Subsidiary",
        transaction_type: "Services",
        amount_aed: "",
        arms_length_aed: "",
        method: "TNMM",
      });
      if (data.threshold_check?.documentation_required) {
        setInfo(
          data.threshold_check.recommendation ||
            "Transaction added — TP documentation thresholds triggered."
        );
      } else {
        setInfo("Transaction saved to company register.");
      }
      await loadRegister();
    } catch (err: unknown) {
      const ax = axios.isAxiosError(err);
      const msg = ax
        ? (err.response?.data as { detail?: string })?.detail || err.message
        : "Failed to save transaction";
      setError(typeof msg === "string" ? msg : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (id: number) => {
    setError(null);
    try {
      await apiClient.delete(`/api/corporatetax/tp-transactions/${id}`);
      await loadRegister();
    } catch (err: unknown) {
      const ax = axios.isAxiosError(err);
      const msg = ax
        ? (err.response?.data as { detail?: string })?.detail || err.message
        : "Failed to delete";
      setError(typeof msg === "string" ? msg : "Failed to delete");
    }
  };

  const saveDocs = async (next: DocChecks) => {
    setDocChecks(next);
    try {
      await apiClient.put("/api/corporatetax/tp-docs", next);
    } catch {
      setError("Could not save documentation checklist");
    }
  };

  const runArmsLengthCheck = async () => {
    const internal = parseFloat(internalPrice) || 0;
    if (internal <= 0) {
      setError("Enter an internal price to run the threshold check.");
      return;
    }
    setAlRunning(true);
    setError(null);
    try {
      const partyYtd = summary?.largest_single_party_aed || 0;
      const aggregate = summary?.total_related_aed || 0;
      const { data } = await apiClient.post<ThresholdCheck>("/api/corporatetax/tp-check", {
        transaction_amount: internal,
        party_name: alDesc.trim() || "Manual arm's-length check",
        relationship: "Related party",
        party_ytd_total: Math.max(0, partyYtd - internal),
        all_related_party_total: Math.max(0, aggregate - internal),
      });
      setAlApiResult(data);
    } catch (err: unknown) {
      const ax = axios.isAxiosError(err);
      const msg = ax
        ? (err.response?.data as { detail?: string })?.detail || err.message
        : "Threshold check failed";
      setError(typeof msg === "string" ? msg : "Threshold check failed");
    } finally {
      setAlRunning(false);
    }
  };

  return (
    <>
      <div className="mb-7">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em]">
            // Transfer Pricing
          </div>
          <span className="text-[9px] font-mono uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-gold-pale text-gold-lt border border-border-g">
            Beta
          </span>
        </div>
        <h2 className="font-playfair text-[26px] font-bold">Transfer Pricing Register</h2>
        <p className="text-[13px] text-muted mt-1 max-w-2xl">
          Manual related-party register + MD 97/2023 disclosure threshold check. Not a full
          benchmarking / Master File generator.
        </p>
      </div>

      <div className="rounded-xl border border-[rgba(78,168,255,0.25)] bg-[rgba(30,70,150,0.18)] px-5 py-4 mb-6 text-[13px] text-muted leading-relaxed">
        <strong className="text-white font-medium">Honest scope:</strong> Transactions are{" "}
        <em className="text-gold-lt not-italic">manually entered</em> (no auto-detect from invoices
        yet). Threshold check uses the real <span className="font-mono text-[12px]">tp-check</span>{" "}
        API (AED 3M per party / AED 40M aggregate). Arm&apos;s-length variance is a simple calculator —
        not OECD benchmarking.
      </div>

      {error && (
        <div className="mb-4 rounded-[10px] border border-red/40 bg-[rgba(255,107,107,0.1)] px-4 py-3 text-sm text-red">
          {error}
        </div>
      )}
      {info && (
        <div className="mb-4 rounded-[10px] border border-green/30 bg-[rgba(45,212,160,0.08)] px-4 py-3 text-sm text-green">
          {info}
        </div>
      )}

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Related Party Transaction Register</h3>
            <p className="text-[11px] text-muted2 mt-0.5">
              {loading
                ? "Loading…"
                : summary
                  ? `${summary.transaction_count} entries · total ${fmt(summary.total_related_aed)} AED`
                  : "Empty — add your first related-party transaction"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold-pale text-gold-lt border border-border-g hover:bg-gold/20"
          >
            + Add Transaction
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={addTransaction}
            className="px-6 py-4 border-b border-border grid grid-cols-1 md:grid-cols-3 gap-3"
          >
            {(
              [
                ["Party name", "party_name", "text"],
                ["Relationship", "relationship", "text"],
                ["Transaction type", "transaction_type", "text"],
                ["Amount AED", "amount_aed", "number"],
                ["Arm's length AED (optional)", "arms_length_aed", "number"],
              ] as const
            ).map(([label, key, type]) => (
              <label key={key} className="text-[11px] text-muted2">
                {label}
                <input
                  type={type}
                  required={key === "party_name" || key === "amount_aed"}
                  value={newTx[key]}
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
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save to register"}
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-border bg-[rgba(4,12,30,0.6)]">
                {["Party", "Relationship", "Type", "Amount AED", "Arm's Length", "Variance", "Method", "Docs", ""].map(
                  (h) => (
                    <th
                      key={h || "actions"}
                      className="text-left px-4 py-2.5 text-muted2 uppercase text-[10px] font-mono whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {!loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-muted">
                    No related-party transactions yet for this company. Add one above — demo data
                    has been removed.
                  </td>
                </tr>
              ) : (
                transactions.map((t, i) => {
                  const variance = t.amount_aed - t.arms_length_aed;
                  return (
                    <tr key={t.id} className={i % 2 ? "bg-[rgba(255,255,255,0.02)]" : ""}>
                      <td className="px-4 py-2.5 text-white">{t.party_name}</td>
                      <td className="px-4 py-2.5 text-muted">{t.relationship}</td>
                      <td className="px-4 py-2.5 text-muted">{t.transaction_type}</td>
                      <td className="px-4 py-2.5 font-mono text-white">{fmt(t.amount_aed)}</td>
                      <td className="px-4 py-2.5 font-mono text-muted">{fmt(t.arms_length_aed)}</td>
                      <td
                        className={`px-4 py-2.5 font-mono ${
                          variance > 0 ? "text-amber" : "text-green"
                        }`}
                      >
                        {variance >= 0 ? "+" : ""}
                        {fmt(variance)}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-gold-lt">{t.method}</td>
                      <td
                        className={`px-4 py-2.5 font-mono text-[11px] ${
                          DOC_STATUS[t.doc_status]?.className || "text-muted"
                        }`}
                      >
                        {DOC_STATUS[t.doc_status]?.label || t.doc_status}
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={() => void deleteTransaction(t.id)}
                          className="text-[11px] text-muted2 hover:text-red"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-1">TP Threshold Checker</h3>
          <p className="text-[11px] text-muted2 mb-4">
            Auto-calculated from your register · AED 3M / party or AED 40M aggregate
          </p>
          <div className="space-y-2 mb-4 text-[13px]">
            <div className="flex justify-between">
              <span className="text-muted">Total related-party</span>
              <span className="font-mono text-white">
                {fmt(summary?.total_related_aed || 0)} AED
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Largest single party</span>
              <span className="font-mono text-white">
                {fmt(summary?.largest_single_party_aed || 0)} AED
                {summary?.largest_party_name ? (
                  <span className="text-muted2 text-[11px]"> · {summary.largest_party_name}</span>
                ) : null}
              </span>
            </div>
          </div>
          {threshold?.documentation_required ? (
            <div className="rounded-lg border border-red/30 bg-[rgba(255,107,107,0.08)] p-4 text-sm space-y-1">
              <p className="text-red font-semibold">Master / Local File likely required</p>
              {(threshold.flags || []).map((f) => (
                <p key={f} className="text-red text-[12px]">
                  {f}
                </p>
              ))}
              <p className="text-muted2 text-[12px] mt-2">{threshold.recommendation}</p>
            </div>
          ) : (
            <div className="rounded-lg border border-green/30 bg-[rgba(45,212,160,0.08)] p-4 text-sm">
              <p className="text-green font-semibold">Below disclosure threshold</p>
              <p className="text-muted mt-1 text-[12px]">
                {threshold?.recommendation || "Maintain internal documentation only"}
              </p>
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-white mb-1">Arm&apos;s Length Spot Check</h3>
          <p className="text-[11px] text-muted2 mb-4">
            Manual variance calculator + optional threshold API call — not a full CUP/TNMM study
          </p>
          <label className="block text-[11px] text-muted2 mb-3">
            Transaction description
            <input
              value={alDesc}
              onChange={(e) => setAlDesc(e.target.value)}
              placeholder="e.g. Management fee to UAE subsidiary"
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <label className="text-[11px] text-muted2">
              Internal price (AED)
              <input
                type="number"
                value={internalPrice}
                onChange={(e) => setInternalPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
              />
            </label>
            <label className="text-[11px] text-muted2">
              Comparable market price (AED)
              <input
                type="number"
                value={marketPrice}
                onChange={(e) => setMarketPrice(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[rgba(4,12,30,0.6)] border border-border text-white font-mono"
              />
            </label>
          </div>
          <div
            className={`rounded-lg p-4 border mb-3 ${
              Math.abs(alVariance) > 10
                ? "border-amber/40 bg-[rgba(255,183,0,0.08)]"
                : "border-green/30 bg-[rgba(45,212,160,0.08)]"
            }`}
          >
            <p className="text-sm text-white">
              Price variance:{" "}
              <span className="font-mono font-bold">{alVariance.toFixed(1)}%</span>
            </p>
            {Math.abs(alVariance) > 10 ? (
              <p className="text-amber text-[12px] mt-1">
                Variance exceeds 10% — flag for TP review
              </p>
            ) : (
              <p className="text-green text-[12px] mt-1">
                Within a simple 10% band (illustrative only)
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void runArmsLengthCheck()}
            disabled={alRunning}
            className="px-4 py-2 rounded-lg text-xs font-semibold border border-border-g text-gold-lt bg-gold-pale disabled:opacity-50"
          >
            {alRunning ? "Checking…" : "Run disclosure threshold check (API)"}
          </button>
          {alApiResult && (
            <p className="mt-3 text-[12px] text-muted">
              {alApiResult.documentation_required ? (
                <span className="text-amber">{alApiResult.recommendation}</span>
              ) : (
                <span className="text-green">{alApiResult.recommendation}</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-white">TP Documentation Checklist</h3>
            <p className="text-[11px] text-muted2">Manual tracking — saved to company settings</p>
          </div>
          <span className="font-mono text-gold-lt text-sm">{docCompleteCount}/6 complete</span>
        </div>
        <div className="w-full h-2 rounded-full bg-[rgba(255,255,255,0.06)] mb-4">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-gold to-gold-lt"
            style={{ width: `${(docCompleteCount / 6) * 100}%` }}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(
            [
              ["identification", "Related party identification complete"],
              ["register_complete", "Transaction register complete"],
              ["benchmarking", "Benchmarking analysis done"],
              ["masterFile", "Master File prepared"],
              ["localFile", "Local File prepared"],
              ["form17", "Disclosure Form 17 ready"],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-[13px] text-muted cursor-pointer hover:text-white"
            >
              <input
                type="checkbox"
                checked={docChecks[key]}
                onChange={(e) =>
                  void saveDocs({ ...docChecks, [key]: e.target.checked })
                }
                className="rounded border-border"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
