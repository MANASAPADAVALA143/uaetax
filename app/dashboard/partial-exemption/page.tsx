"use client";

import { useEffect, useState } from "react";
import { Calculator, Save } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { calculatePartialExemption } from "@/lib/gulftax/vatAdvanced";
import {
  approvePartialExemption,
  listPartialExemptions,
  savePartialExemption,
  type PartialExemptionRecord,
} from "@/lib/vatAdvanced.service";

function StatusBadge({ status }: { status?: string }) {
  const approved = status === "approved";
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        approved
          ? "bg-green-900/40 text-green-300 border border-green-700/50"
          : "bg-gray-800 text-gray-400 border border-gray-600/50"
      }`}
    >
      {approved ? "Approved" : "Draft"}
    </span>
  );
}

function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export default function PartialExemptionPage() {
  const { activeCompany } = useAuth();
  const activeCompanyId = activeCompany ? String(activeCompany.company_id) : null;
  const wsId = activeCompanyId ?? "";

  const [taxable, setTaxable] = useState("");
  const [exempt, setExempt] = useState("");
  const [inputVat, setInputVat] = useState("");
  const [period, setPeriod] = useState(currentQuarter());
  const [periodType, setPeriodType] = useState<"quarterly" | "annual">("quarterly");
  const [provisionalPct, setProvisionalPct] = useState("");
  const [history, setHistory] = useState<PartialExemptionRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const result = calculatePartialExemption({
    taxableSupplies: Number(taxable) || 0,
    exemptSupplies: Number(exempt) || 0,
    inputVatPaid: Number(inputVat) || 0,
    period,
    periodType,
    provisionalPct: provisionalPct ? Number(provisionalPct) : undefined,
  });

  useEffect(() => {
    if (!wsId) return;
    void listPartialExemptions(wsId).then(setHistory);
  }, [wsId]);

  const onSave = async () => {
    if (!wsId) {
      setSaveMsg("No active company — complete company setup first.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const saved = await savePartialExemption(
        wsId,
        activeCompanyId,
        period,
        periodType,
        {
          taxable: Number(taxable) || 0,
          exempt: Number(exempt) || 0,
          inputVat: Number(inputVat) || 0,
          provisionalPct: provisionalPct ? Number(provisionalPct) : undefined,
        },
        result,
      );
      setSaveMsg("Calculation saved.");
      setHistory((h) => [saved, ...h]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveMsg(`Could not save — ${msg}`);
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (id: string) => {
    setApprovingId(id);
    const updated = await approvePartialExemption(id);
    setApprovingId(null);
    if (updated) {
      setHistory((h) => h.map((row) => (row.id === id ? updated : row)));
    }
  };

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500 mb-1">VAT Compliance</p>
      <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <Calculator className="w-7 h-7 text-amber-400" />
        Partial Exemption Calculator
      </h1>
      <p className="text-sm text-gray-400 mb-6 max-w-2xl">
        Mixed taxable and exempt supplies limit input VAT recovery. Recovery % = Taxable Supplies ÷ Total Supplies × 100.
        Common cases: real estate (commercial vs residential), banks (fees vs interest), hospitals (taxable vs exempt healthcare).
        <span className="block mt-2 text-amber-400/90">
          Only <strong>approved</strong> calculations reduce Box 11 (input VAT) on the VAT return.
        </span>
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6 space-y-4">
          <h2 className="text-sm font-semibold text-white">Inputs</h2>
          <label className="block text-xs text-gray-400">
            Total taxable supplies (AED) — standard + zero-rated
            <input
              type="number"
              min={0}
              value={taxable}
              onChange={(e) => setTaxable(e.target.value)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </label>
          <label className="block text-xs text-gray-400">
            Total exempt supplies (AED)
            <input
              type="number"
              min={0}
              value={exempt}
              onChange={(e) => setExempt(e.target.value)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </label>
          <label className="block text-xs text-gray-400">
            Total input VAT paid (AED)
            <input
              type="number"
              min={0}
              value={inputVat}
              onChange={(e) => setInputVat(e.target.value)}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs text-gray-400">
              Tax period
              <input
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              />
            </label>
            <label className="block text-xs text-gray-400">
              Period type
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value as "quarterly" | "annual")}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              >
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
              </select>
            </label>
          </div>
          {periodType === "quarterly" && (
            <label className="block text-xs text-gray-400">
              Provisional recovery % used in year (optional)
              <input
                type="number"
                min={0}
                max={100}
                value={provisionalPct}
                onChange={(e) => setProvisionalPct(e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !wsId}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save calculation"}
          </button>
          {saveMsg && <p className="text-xs text-gray-400">{saveMsg}</p>}
        </div>

        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
          <h2 className="text-sm font-semibold text-amber-400 mb-4">Results</h2>
          <div className="text-4xl font-black font-mono text-white mb-1">
            {result.recoveryPct.toFixed(2)}%
          </div>
          <p className="text-xs text-gray-400 mb-4">Recovery percentage</p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-green-900/20 border border-green-800/40 p-3">
              <div className="text-[10px] text-green-400 uppercase">Recoverable VAT</div>
              <div className="text-lg font-mono text-white">
                AED {result.recoverableVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </div>
            </div>
            <div className="rounded-xl bg-red-900/20 border border-red-800/40 p-3">
              <div className="text-[10px] text-red-400 uppercase">Irrecoverable VAT</div>
              <div className="text-lg font-mono text-white">
                AED {result.irrecoverableVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
          {result.adjustmentNote && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200 mb-4">
              <strong>Annual adjustment:</strong> {result.adjustmentNote}
            </div>
          )}
          <table className="w-full text-xs">
            <tbody>
              {result.breakdown.map((row) => (
                <tr key={row.label} className="border-t border-white/5">
                  <td className="py-2 text-gray-400">{row.label}</td>
                  <td className="py-2 text-right font-mono text-white">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-sm font-semibold text-white">
            Saved calculations
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-gray-500 bg-black/20">
                <tr>
                  <th className="text-left p-3">Period</th>
                  <th className="text-right p-3">Recovery %</th>
                  <th className="text-right p-3">Recoverable</th>
                  <th className="text-right p-3">Irrecoverable</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-left p-3">Saved</th>
                  <th className="text-right p-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-white/5">
                    <td className="p-3 text-white">{h.period}</td>
                    <td className="p-3 text-right font-mono">{Number(h.recovery_pct).toFixed(2)}%</td>
                    <td className="p-3 text-right font-mono text-green-400">
                      {Number(h.recoverable_vat).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3 text-right font-mono text-red-400">
                      {Number(h.irrecoverable_vat).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-3">
                      <StatusBadge status={h.status} />
                    </td>
                    <td className="p-3 text-gray-500">
                      {new Date(h.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="p-3 text-right">
                      {h.status !== "approved" && (
                        <button
                          type="button"
                          onClick={() => void onApprove(h.id)}
                          disabled={approvingId === h.id}
                          className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide bg-green-900/30 text-green-300 border border-green-700/40 hover:bg-green-900/50 disabled:opacity-50"
                        >
                          {approvingId === h.id ? "…" : "Approve"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
