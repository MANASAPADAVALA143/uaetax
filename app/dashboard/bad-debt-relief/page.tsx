"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileWarning, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { evaluateBadDebtRelief } from "@/lib/gulftax/vatAdvanced";
import {
  approveBadDebtClaim,
  listBadDebtClaims,
  saveBadDebtClaim,
  type BadDebtClaimRecord,
} from "@/lib/vatAdvanced.service";

function ClaimStatusBadge({ status }: { status: string }) {
  const approved = status === "approved";
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        approved
          ? "bg-green-900/40 text-green-300 border border-green-700/50"
          : "bg-gray-800 text-gray-400 border border-gray-600/50"
      }`}
    >
      {approved ? "Approved" : status === "eligible" ? "Draft" : status}
    </span>
  );
}

export default function BadDebtReliefPage() {
  const { activeCompany } = useAuth();
  const activeCompanyId = activeCompany ? String(activeCompany.company_id) : null;
  const wsId = activeCompanyId ?? "";

  const [form, setForm] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    dueDate: "",
    invoiceAmount: "",
    vatAmount: "",
    vatReturnPeriod: "",
    writtenOffDate: "",
    recoverySteps: "",
    connectedParty: false,
    vatPaidToFta: true,
  });
  const [claims, setClaims] = useState<BadDebtClaimRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const result = evaluateBadDebtRelief({
    invoiceNumber: form.invoiceNumber,
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    invoiceAmount: Number(form.invoiceAmount) || 0,
    vatAmount: Number(form.vatAmount) || 0,
    vatReturnPeriod: form.vatReturnPeriod,
    writtenOffDate: form.writtenOffDate,
    recoverySteps: form.recoverySteps,
    connectedParty: form.connectedParty,
    vatPaidToFta: form.vatPaidToFta,
  });

  useEffect(() => {
    if (!wsId) return;
    void listBadDebtClaims(wsId).then(setClaims);
  }, [wsId]);

  const set = (key: keyof typeof form, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSave = async () => {
    if (!wsId) {
      setSaveOk(false);
      setSaveMsg("No active company — complete company setup first.");
      return;
    }
    if (!form.recoverySteps.trim()) {
      setSaveOk(false);
      setSaveMsg('Fill "Recovery steps taken" before saving — otherwise the claim stays ineligible.');
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    setSaveOk(false);
    try {
      const saved = await saveBadDebtClaim(
        wsId,
        activeCompanyId,
        {
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          invoiceAmount: Number(form.invoiceAmount) || 0,
          vatAmount: Number(form.vatAmount) || 0,
          vatReturnPeriod: form.vatReturnPeriod,
          writtenOffDate: form.writtenOffDate,
          recoverySteps: form.recoverySteps,
          connectedParty: form.connectedParty,
        },
        result,
      );
      setClaims((c) => [saved, ...c]);
      setSaveOk(true);
      setSaveMsg(
        saved.eligible
          ? "Claim saved as eligible (draft). Approve it to apply to the VAT return."
          : `Claim saved as ineligible — ${saved.eligibility_reason || result.reasons.join(" ")}`,
      );
    } catch (e) {
      setSaveOk(false);
      setSaveMsg(e instanceof Error ? e.message : "Could not save bad debt claim");
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (id: string) => {
    setApprovingId(id);
    const updated = await approveBadDebtClaim(id);
    setApprovingId(null);
    if (updated) {
      setClaims((c) => c.map((row) => (row.id === id ? updated : row)));
    }
  };

  return (
    <div>
      <p className="text-[11px] font-mono uppercase tracking-widest text-amber-500 mb-1">VAT Advanced</p>
      <h1 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
        <FileWarning className="w-7 h-7 text-amber-400" />
        Bad Debt Relief
      </h1>
      <p className="text-sm text-gray-400 mb-6 max-w-2xl">
        Recover VAT already paid to the FTA on invoices unpaid for more than 6 months, once written off and recovery steps documented.
        <span className="block mt-2 text-amber-400/90">
          Only <strong>approved</strong> eligible claims reduce Box 7 (output adjustments) on the VAT return.
        </span>
      </p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] p-6 space-y-3">
          <h2 className="text-sm font-semibold text-white mb-2">Claim details</h2>
          {(
            [
              ["invoiceNumber", "Original invoice number", "text"],
              ["invoiceDate", "Invoice date", "date"],
              ["dueDate", "Due date", "date"],
              ["invoiceAmount", "Invoice amount (AED)", "number"],
              ["vatAmount", "VAT amount (AED)", "number"],
              ["vatReturnPeriod", "VAT return period when VAT was paid", "text"],
              ["writtenOffDate", "Written off date", "date"],
            ] as const
          ).map(([key, label, type]) => (
            <label key={key} className="block text-xs text-gray-400">
              {label}
              <input
                type={type}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              />
            </label>
          ))}
          <label className="block text-xs text-gray-400">
            Recovery steps taken
            <textarea
              value={form.recoverySteps}
              onChange={(e) => set("recoverySteps", e.target.value)}
              rows={3}
              className="mt-1 w-full bg-gray-900 border border-white/10 rounded-lg px-3 py-2 text-white"
              placeholder="e.g. 3 payment reminders, debt collection agency, legal notice…"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.vatPaidToFta}
              onChange={(e) => set("vatPaidToFta", e.target.checked)}
            />
            VAT was paid to FTA on original return
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={form.connectedParty}
              onChange={(e) => set("connectedParty", e.target.checked)}
            />
            Customer is a connected party
          </label>
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={saving || !wsId}
            className="px-4 py-2 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save claim"}
          </button>
          {saveMsg && (
            <p className={`text-sm ${saveOk ? "text-green-400" : "text-red-400"}`}>{saveMsg}</p>
          )}
        </div>

        <div className="space-y-4">
          <div
            className={`rounded-2xl border p-6 ${
              result.eligible
                ? "border-green-500/40 bg-green-500/10"
                : "border-red-500/40 bg-red-500/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              {result.eligible ? (
                <CheckCircle2 className="w-6 h-6 text-green-400" />
              ) : (
                <XCircle className="w-6 h-6 text-red-400" />
              )}
              <h2 className="text-lg font-semibold text-white">
                {result.eligible ? "Eligible for bad debt relief" : "Not eligible"}
              </h2>
            </div>
            {!result.eligible && (
              <ul className="text-sm text-red-200 space-y-1 mb-4 list-disc pl-5">
                {result.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            {result.eligible && (
              <>
                <div className="text-2xl font-mono text-green-300 mb-1">
                  AED {result.claimableVat.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-gray-400 mb-2">Claimable VAT amount</p>
                {result.claimPeriod && (
                  <p className="text-sm text-white">
                    Claim in VAT return period: <strong>{result.claimPeriod}</strong>
                  </p>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border p-5">
            <h3 className="text-sm font-semibold text-white mb-3">Required documentation</h3>
            <ul className="space-y-2">
              {result.documentation.map((doc) => (
                <li key={doc} className="flex items-start gap-2 text-xs text-gray-300">
                  <CheckCircle2 className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                  {doc}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {claims.length > 0 && (
        <div className="mt-8 rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex justify-between items-center">
            <span className="text-sm font-semibold text-white">Claim history</span>
            <Link href="/dashboard/vat-return" className="text-xs text-amber-400 hover:underline">
              View on VAT Return →
            </Link>
          </div>
          <table className="w-full text-xs">
            <thead className="text-gray-500 bg-black/20">
              <tr>
                <th className="text-left p-3">Invoice</th>
                <th className="text-right p-3">VAT</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Claim period</th>
                <th className="text-right p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="border-t border-white/5">
                  <td className="p-3 text-white">{c.invoice_number}</td>
                  <td className="p-3 text-right font-mono">
                    {Number(c.vat_amount).toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="p-3">
                    <ClaimStatusBadge status={c.status} />
                    {!c.eligible && (
                      <span className="ml-2 text-[10px] text-red-400">Ineligible</span>
                    )}
                  </td>
                  <td className="p-3 text-gray-400">
                    {c.claim_period ?? (c.extra?.claim_period as string) ?? "—"}
                  </td>
                  <td className="p-3 text-right">
                    {c.eligible && c.status !== "approved" && (
                      <button
                        type="button"
                        onClick={() => void onApprove(c.id)}
                        disabled={approvingId === c.id}
                        className="px-2 py-1 rounded text-[10px] font-semibold uppercase tracking-wide bg-green-900/30 text-green-300 border border-green-700/40 hover:bg-green-900/50 disabled:opacity-50"
                      >
                        {approvingId === c.id ? "…" : "Approve"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
