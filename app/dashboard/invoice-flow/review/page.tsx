"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

interface RiskFlag {
  flag: string;
  flag_id?: number;
  severity: "high" | "medium" | "low";
  message?: string;
  title?: string;
  what_is_wrong?: string;
  action_required?: string;
  uae_law_reference?: string;
  vat_at_risk_aed?: number;
  category?: string;
}

interface InvoiceRow {
  id: number;
  filename: string;
  vendor_name?: string;
  vendor_trn?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_aed?: number;
  vat_amount_aed?: number;
  vat_treatment?: string;
  confidence?: number;
  risk_flags: RiskFlag[];
  overall_risk: string;
  status: string;
  reviewed_by?: string;
  reviewed_at?: string;
  zoho_bill_id?: string;
  created_at: string;
}

const VAT_TREATMENTS = [
  "standard_rated",
  "zero_rated",
  "exempt",
  "reverse_charge",
  "out_of_scope",
];

const SEVERITY_COLORS: Record<string, string> = {
  high: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  medium: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  low: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
};

const VAT_BADGE: Record<string, string> = {
  standard_rated: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  zero_rated: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
  exempt: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  reverse_charge: "bg-[rgba(200,100,255,0.12)] text-purple-300 border-purple-400/30",
  out_of_scope: "bg-[rgba(255,255,255,0.06)] text-muted border-border",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[rgba(255,255,255,0.06)] text-muted2 border-border",
  review: "bg-[rgba(255,183,0,0.12)] text-amber border-amber/30",
  approved: "bg-[rgba(45,212,160,0.12)] text-green border-green/30",
  auto_approved: "bg-[rgba(45,212,160,0.18)] text-green border-green/40",
  escalated: "bg-[rgba(255,107,107,0.15)] text-red border-red/30",
  posted: "bg-[rgba(78,168,255,0.1)] text-blue-300 border-blue-400/30",
};

const STATUS_TABS = ["all", "pending", "review", "approved", "auto_approved", "escalated", "posted"];

export default function ReviewQueuePage() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  // Initialise from ?status= URL param (e.g. Dashboard "Action Required" links)
  const [activeTab, setActiveTab] = useState(() => {
    const param = searchParams.get("status");
    return STATUS_TABS.includes(param ?? "") ? (param as string) : "all";
  });
  const [overrideModal, setOverrideModal] = useState<InvoiceRow | null>(null);
  const [overrideTreatment, setOverrideTreatment] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [approvalBanner, setApprovalBanner] = useState<{ invoiceName: string; txCount: number } | null>(null);
  const [vendorProfile, setVendorProfile] = useState<{
    vendor_name: string;
    invoice_count: number;
    profile: {
      average_invoice_aed: number;
      max_invoice_aed: number;
      min_invoice_aed: number;
      typical_vat_treatment: string | null;
      first_seen: string | null;
      last_seen: string | null;
      price_trend: string | null;
    } | null;
  } | null>(null);
  const [vendorLoading, setVendorLoading] = useState(false);

  const openVendorProfile = async (vendorName: string) => {
    setVendorLoading(true);
    setVendorProfile(null);
    try {
      const { data } = await apiClient.get(
        `/api/invoice/supplier-profile/${encodeURIComponent(vendorName)}`
      );
      setVendorProfile(data);
    } catch {
      setVendorProfile({ vendor_name: vendorName, invoice_count: 0, profile: null });
    } finally {
      setVendorLoading(false);
    }
  };

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const params = activeTab !== "all" ? `?status=${activeTab}` : "";
      const { data } = await apiClient.get(`/api/invoice/invoices${params}`);
      setInvoices(data);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const doAction = async (
    inv: InvoiceRow,
    action: "approve" | "escalate" | "override",
    opts?: { treatment?: string; reason?: string }
  ) => {
    setActionLoading(true);
    setApprovalBanner(null);
    try {
      const { data } = await apiClient.post(`/api/invoice/invoices/${inv.id}/review`, {
        action,
        override_treatment: opts?.treatment,
        reason: opts?.reason,
        reviewed_by: user?.email || "unknown",
      });
      if (data?.approved && action !== "escalate") {
        setApprovalBanner({
          invoiceName: inv.vendor_name || inv.filename,
          txCount: data.transactions_created ?? 0,
        });
      }
      await fetchInvoices();
    } catch (e) {
      console.error("Review action failed", e);
    } finally {
      setActionLoading(false);
      setOverrideModal(null);
      setOverrideTreatment("");
      setOverrideReason("");
    }
  };

  const counts = STATUS_TABS.reduce(
    (acc, s) => ({
      ...acc,
      [s]: s === "all" ? invoices.length : invoices.filter((i) => i.status === s).length,
    }),
    {} as Record<string, number>
  );

  return (
    <>
      <div className="flex items-center justify-between mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Invoice Review Queue
          </div>
          <h2 className="font-playfair text-[26px] font-bold">AP Review Queue</h2>
          <p className="text-[13px] text-muted mt-1">
            Approve, override, or escalate AI-processed invoices
          </p>
        </div>
        <Link
          href="/dashboard/invoice-flow"
          className="px-4 py-2 rounded-[10px] text-sm font-medium border border-border text-muted hover:border-border-g hover:text-white transition"
        >
          ← Upload more
        </Link>
      </div>

      {/* Approval confirmation banner */}
      {approvalBanner && (
        <div className="mb-5 rounded-[12px] border border-green/30 bg-[rgba(45,212,160,0.08)] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="text-green text-lg">✓</span>
            <div>
              <p className="text-green text-sm font-medium">
                Approved · {approvalBanner.txCount} transaction{approvalBanner.txCount !== 1 ? "s" : ""} added to VAT Classifier
              </p>
              <p className="text-[12px] text-muted2 mt-0.5">{approvalBanner.invoiceName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/vat-classifier"
              className="text-[12px] text-gold-lt hover:underline font-medium"
            >
              View in VAT Classifier →
            </Link>
            <button
              type="button"
              onClick={() => setApprovalBanner(null)}
              className="text-muted2 text-[18px] leading-none hover:text-white transition"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-2 flex-wrap mb-6 border-b border-border pb-3">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-[8px] text-[12px] font-medium capitalize transition-all ${
              activeTab === tab
                ? "bg-gold-pale text-gold-lt border border-border-g"
                : "text-muted hover:bg-[rgba(30,70,150,0.25)] hover:text-white border border-transparent"
            }`}
          >
            {tab} {counts[tab] ? `(${counts[tab]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted2">Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-16 text-muted2">
          <div className="text-4xl mb-3">📭</div>
          <p>No invoices in this queue</p>
          <Link href="/dashboard/invoice-flow" className="text-gold-lt text-sm mt-2 inline-block hover:underline">
            Upload invoices →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {invoices.map((inv) => (
            <div key={inv.id} className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{inv.vendor_name || inv.filename}</p>
                    {inv.vendor_name && (
                      <button
                        type="button"
                        onClick={() => openVendorProfile(inv.vendor_name!)}
                        title="View vendor history"
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-muted2 hover:border-border-g hover:text-gold-lt transition-all"
                      >
                        📊 Profile
                      </button>
                    )}
                  </div>
                  <p className="text-[12px] text-muted2 font-mono">{inv.filename}</p>
                  {inv.vendor_trn && (
                    <p className="text-[11px] text-muted2">TRN: <span className="font-mono">{inv.vendor_trn}</span></p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {inv.vat_treatment && (
                    <span className={`text-[11px] px-2 py-1 rounded-full border font-mono ${VAT_BADGE[inv.vat_treatment] || VAT_BADGE.out_of_scope}`}>
                      {inv.vat_treatment.replace(/_/g, " ")}
                    </span>
                  )}
                  <span className={`text-[11px] px-2 py-1 rounded-full border font-mono capitalize ${STATUS_BADGE[inv.status] || ""}`}>
                    {inv.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px] mb-4">
                <div><span className="text-muted2 block">Invoice #</span><span className="text-white font-mono">{inv.invoice_number || "—"}</span></div>
                <div><span className="text-muted2 block">Date</span><span className="text-white">{inv.invoice_date || "—"}</span></div>
                <div><span className="text-muted2 block">Total AED</span><span className="text-white font-mono">{inv.total_aed ? inv.total_aed.toLocaleString("en-AE") : "—"}</span></div>
                <div><span className="text-muted2 block">AI Confidence</span><span className="text-white">{inv.confidence ? `${(inv.confidence * 100).toFixed(0)}%` : "—"}</span></div>
              </div>

              {/* WHY AI FLAGGED THIS — full decision summary */}
              {inv.risk_flags.length > 0 && (
                <div className="mb-4 rounded-[10px] border border-border bg-[rgba(4,12,30,0.6)] overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-[rgba(255,255,255,0.03)]">
                    <span className="text-[10px] font-mono text-gold uppercase tracking-[0.1em]">// AI Decision Summary</span>
                    <span className="ml-auto text-[10px] text-muted2">{inv.risk_flags.length} flag{inv.risk_flags.length !== 1 ? "s" : ""} detected</span>
                  </div>

                  {/* Passed checks */}
                  <div className="px-4 py-2 border-b border-border space-y-1">
                    {[
                      inv.vendor_trn ? `TRN ${inv.vendor_trn} format verified` : null,
                      inv.vat_treatment ? `VAT treatment classified: ${inv.vat_treatment.replace(/_/g, " ")}` : null,
                      inv.invoice_number ? `Invoice number extracted: ${inv.invoice_number}` : null,
                    ].filter(Boolean).map((check, i) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] text-green/80">
                        <span className="flex-shrink-0">✓</span>
                        <span>{check}</span>
                      </div>
                    ))}
                  </div>

                  {/* Flags */}
                  <div className="divide-y divide-border">
                    {inv.risk_flags.map((rf, j) => (
                      <div key={j} className="px-4 py-3">
                        <div className="flex items-start gap-2 mb-1.5">
                          <span className={`flex-shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded uppercase tracking-wider border ${SEVERITY_COLORS[rf.severity]}`}>
                            {rf.severity}
                          </span>
                          <span className="text-[12px] font-medium text-white leading-tight">
                            {rf.title || rf.message || rf.flag}
                          </span>
                        </div>
                        {rf.what_is_wrong && (
                          <p className="text-[11px] text-muted leading-relaxed ml-0 mb-1.5">{rf.what_is_wrong}</p>
                        )}
                        {rf.action_required && (
                          <div className="flex items-start gap-1.5 text-[10.5px] text-amber/90 mb-1">
                            <span className="flex-shrink-0 mt-0.5">→</span>
                            <span>{rf.action_required}</span>
                          </div>
                        )}
                        {rf.uae_law_reference && (
                          <div className="text-[10px] text-muted2 font-mono">
                            📋 {rf.uae_law_reference}
                          </div>
                        )}
                        {rf.vat_at_risk_aed && rf.vat_at_risk_aed > 0 && (
                          <div className="mt-1 text-[10px] text-red/80 font-mono">
                            VAT at risk: AED {rf.vat_at_risk_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Risk score bar */}
                  <div className="px-4 py-2.5 border-t border-border bg-[rgba(255,255,255,0.02)] flex items-center gap-3">
                    <span className="text-[10px] text-muted2 uppercase tracking-wide">Overall Risk</span>
                    <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${inv.overall_risk === "high" ? "bg-red w-[85%]" : inv.overall_risk === "medium" ? "bg-amber w-[50%]" : "bg-green w-[20%]"}`}
                      />
                    </div>
                    <span className={`text-[11px] font-mono font-bold uppercase ${inv.overall_risk === "high" ? "text-red" : inv.overall_risk === "medium" ? "text-amber" : "text-green"}`}>
                      {inv.overall_risk}
                    </span>
                  </div>
                </div>
              )}

              {inv.reviewed_by && (
                <p className="text-[11px] text-muted2 mb-3">
                  Reviewed by {inv.reviewed_by} · {inv.reviewed_at ? new Date(inv.reviewed_at).toLocaleString() : ""}
                </p>
              )}

              {inv.status === "posted" && inv.zoho_bill_id && (
                <div className="mb-3 rounded-[8px] border border-blue-400/30 bg-[rgba(78,168,255,0.08)] px-3 py-2 text-[12px] text-blue-300">
                  Posted to Zoho Books · Bill ID: <span className="font-mono">{inv.zoho_bill_id}</span>
                </div>
              )}

              {/* Action buttons — pending/review: full set; escalated: FM override only */}
              {!["approved", "auto_approved", "posted"].includes(inv.status) && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  {inv.status === "escalated" ? (
                    <>
                      <div className="w-full text-[11px] text-red/80 mb-1">
                        ⛔ Hard blocked — Finance Manager override required with documented reason
                      </div>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => { setOverrideModal(inv); setOverrideTreatment(inv.vat_treatment || ""); }}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium bg-[rgba(201,168,76,0.12)] text-gold-lt border border-border-g hover:opacity-90 transition disabled:opacity-40"
                      >
                        🔓 Finance Manager Override
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => doAction(inv, "approve")}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium bg-[rgba(45,212,160,0.12)] text-green border border-green/30 hover:opacity-90 transition disabled:opacity-40"
                      >
                        ✓ Approve
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => { setOverrideModal(inv); setOverrideTreatment(inv.vat_treatment || ""); }}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium border border-border text-muted hover:border-border-g hover:text-white transition disabled:opacity-40"
                      >
                        ✎ Override
                      </button>
                      <button
                        type="button"
                        disabled={actionLoading}
                        onClick={() => doAction(inv, "escalate", { reason: "Escalated for manual review" })}
                        className="px-4 py-1.5 rounded-[8px] text-[12px] font-medium bg-[rgba(255,107,107,0.1)] text-red border border-red/30 hover:opacity-90 transition disabled:opacity-40"
                      >
                        ⚠ Escalate
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vendor profile side panel */}
      {(vendorProfile || vendorLoading) && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm" onClick={() => setVendorProfile(null)}>
          <div
            className="w-full max-w-sm bg-[#071228] border-l border-border h-full overflow-y-auto p-7 flex flex-col gap-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-base">Vendor Profile</h3>
              <button
                type="button"
                onClick={() => setVendorProfile(null)}
                className="text-muted2 text-[20px] leading-none hover:text-white transition"
              >
                ×
              </button>
            </div>

            {vendorLoading && (
              <div className="text-muted2 text-sm animate-pulse">Loading vendor history…</div>
            )}

            {vendorProfile && !vendorLoading && (
              <>
                <div>
                  <p className="text-gold-lt font-semibold text-[15px]">{vendorProfile.vendor_name}</p>
                  <p className="text-[12px] text-muted2 mt-0.5">
                    {vendorProfile.invoice_count} invoice{vendorProfile.invoice_count !== 1 ? "s" : ""} on record
                  </p>
                </div>

                {vendorProfile.profile ? (
                  <div className="space-y-3">
                    {[
                      { label: "Avg invoice", value: `AED ${vendorProfile.profile.average_invoice_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}` },
                      { label: "Max invoice", value: `AED ${vendorProfile.profile.max_invoice_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}` },
                      { label: "Min invoice", value: `AED ${vendorProfile.profile.min_invoice_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}` },
                      { label: "Typical VAT treatment", value: vendorProfile.profile.typical_vat_treatment?.replace(/_/g, " ") ?? "—" },
                      { label: "First seen", value: vendorProfile.profile.first_seen ? new Date(vendorProfile.profile.first_seen).toLocaleDateString() : "—" },
                      { label: "Last seen", value: vendorProfile.profile.last_seen ? new Date(vendorProfile.profile.last_seen).toLocaleDateString() : "—" },
                      { label: "Price trend", value: vendorProfile.profile.price_trend ?? "Insufficient data" },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between text-[12px] border-b border-border pb-2">
                        <span className="text-muted2">{row.label}</span>
                        <span className="text-white font-mono">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-[10px] border border-border bg-[rgba(255,255,255,0.03)] px-4 py-4 text-[13px] text-muted2 text-center">
                    No prior invoice history for this vendor
                  </div>
                )}

                <div className="pt-2">
                  <p className="text-[11px] text-muted2 uppercase tracking-wide mb-2">Quick actions</p>
                  <Link
                    href="/dashboard/fta-reports"
                    className="block text-[12px] text-gold-lt hover:underline"
                  >
                    View all transactions for this period →
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Override modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[#071228] border border-border rounded-2xl p-8 w-full max-w-md shadow-2xl space-y-5">
            <h3 className="text-white font-semibold text-lg">
              {overrideModal.status === "escalated" ? "🔓 Finance Manager Override" : "Override VAT Treatment"}
            </h3>
            {overrideModal.status === "escalated" && (
              <div className="rounded-[8px] border border-amber/30 bg-[rgba(255,183,0,0.08)] px-3 py-2 text-[12px] text-amber">
                This invoice was hard-blocked by the risk engine. Your override will be logged for audit trail.
              </div>
            )}
            <p className="text-[13px] text-muted">
              Invoice: <span className="text-white">{overrideModal.vendor_name || overrideModal.filename}</span>
            </p>

            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                VAT Treatment
              </label>
              <select
                value={overrideTreatment}
                onChange={(e) => setOverrideTreatment(e.target.value)}
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none"
              >
                {VAT_TREATMENTS.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] text-muted2 uppercase tracking-wide mb-2">
                Reason <span className="text-red">*</span>
              </label>
              <textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                rows={3}
                placeholder="Explain why you are overriding the AI classification…"
                className="w-full rounded-[10px] bg-[rgba(4,12,30,0.85)] border border-border px-4 py-2.5 text-white text-sm focus:border-border-g focus:outline-none resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={!overrideReason.trim() || actionLoading}
                onClick={() => doAction(overrideModal, "override", { treatment: overrideTreatment, reason: overrideReason })}
                className="flex-1 py-2.5 rounded-[10px] text-sm font-semibold bg-gradient-to-br from-gold to-gold-lt text-deep disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "Saving…" : "Save Override"}
              </button>
              <button
                type="button"
                onClick={() => setOverrideModal(null)}
                className="px-5 py-2.5 rounded-[10px] text-sm border border-border text-muted hover:border-border-g hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
