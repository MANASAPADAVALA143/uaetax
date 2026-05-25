"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { useCompanyId } from "@/hooks/useAuth";

interface DashboardSummary {
  current_period: {
    start_date: string;
    end_date: string;
    label: string;
  };
  vat: {
    estimated_payable_aed: number;
    transactions_classified: number;
    transactions_needing_review: number;
    days_to_filing: number;
    filing_deadline: string;
  };
  corporate_tax: {
    estimated_liability_aed: number;
    filing_deadline: string;
    days_to_deadline: number;
    status: string;
  };
  e_invoicing: {
    readiness_score: number;
    mandate_date: string;
    days_to_mandate: number;
    asp_appointed: boolean;
  };
  recent_activity: Array<{
    timestamp: string;
    actor: string;
    action: string;
    entity: string;
  }>;
  pending_approvals: number;
  open_reconciliation_mismatches: number;
  invoice_flow: {
    pending_review: number;
    escalated: number;
    auto_approved_today: number;
    total_invoices: number;
    total_vat_at_risk_aed: number;
  };
}

type LoadState = "loading" | "ok" | "error";

function fmtAed(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AE", {
    style: "currency",
    currency: "AED",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dubai",
  });
}

function dashStr(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return String(n);
}

function KpiSkeleton() {
  return (
    <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 animate-pulse">
      <div className="h-3 w-24 bg-[rgba(78,168,255,0.12)] rounded mb-4" />
      <div className="h-8 w-36 bg-[rgba(78,168,255,0.1)] rounded mb-3" />
      <div className="h-3 w-28 bg-[rgba(78,168,255,0.08)] rounded" />
    </div>
  );
}

export default function DashboardOverview() {
  const companyId = useCompanyId();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await apiClient.get<DashboardSummary>(
          `/api/dashboard/summary`,
          { timeout: 15000 } as Parameters<typeof apiClient.get>[1]
        );
        if (!cancelled) {
          setSummary(data);
          setLoadState("ok");
        }
      } catch {
        if (!cancelled) {
          setSummary(null);
          setLoadState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const s = loadState === "ok" ? summary : null;

  const vatDue = s ? s.vat.estimated_payable_aed : null;
  const classified = s ? s.vat.transactions_classified : null;
  const mismatches = s ? s.open_reconciliation_mismatches : null;
  const daysFiling = s ? s.vat.days_to_filing : null;
  const filingDeadline = s ? s.vat.filing_deadline : null;
  const periodLabel = s ? s.current_period.label : null;
  const periodRange =
    s && s.current_period.start_date && s.current_period.end_date
      ? `${fmtDate(s.current_period.start_date)} – ${fmtDate(s.current_period.end_date)}`
      : null;

  const kpis = [
    {
      label: "VAT Due (est. Box 8)",
      icon: "🧾",
      val:
        loadState === "loading"
          ? null
          : loadState === "error"
            ? "—"
            : fmtAed(vatDue ?? 0),
      valClass:
        loadState === "ok" && vatDue !== null && vatDue > 0
          ? "gold"
          : loadState === "ok" && vatDue === 0
            ? "green"
            : "",
      change:
        loadState === "loading"
          ? ""
          : loadState === "error"
            ? "—"
            : s && s.vat.transactions_needing_review > 0
              ? `${s.vat.transactions_needing_review} txn need review`
              : "Current quarter estimate",
      changeClass: s && s.vat.transactions_needing_review > 0 ? "down" : "up",
      changeColor: "" as const,
    },
    {
      label: "Transactions classified",
      icon: "✅",
      val:
        loadState === "loading" ? null : loadState === "error" ? "—" : dashStr(classified),
      valClass: "",
      change:
        loadState === "loading"
          ? ""
          : loadState === "error"
            ? "—"
            : periodLabel
              ? `In ${periodLabel}`
              : "—",
      changeClass: "up",
      changeColor: "" as const,
    },
    {
      label: "AP invoices in queue",
      icon: "📄",
      val:
        loadState === "loading"
          ? null
          : loadState === "error"
            ? "—"
            : dashStr(s?.invoice_flow ? s.invoice_flow.pending_review + s.invoice_flow.escalated : 0),
      valClass:
        loadState === "ok" && s?.invoice_flow && s.invoice_flow.escalated > 0
          ? "red"
          : loadState === "ok" && s?.invoice_flow && s.invoice_flow.pending_review > 0
            ? "amber"
            : "",
      change:
        loadState === "loading"
          ? ""
          : loadState === "error"
            ? "—"
            : s?.invoice_flow && s.invoice_flow.escalated > 0
              ? `${s.invoice_flow.escalated} hard blocked`
              : s?.invoice_flow && s.invoice_flow.pending_review > 0
                ? `${s.invoice_flow.pending_review} awaiting review`
                : "All clear",
      changeClass:
        loadState === "ok" && s?.invoice_flow && s.invoice_flow.escalated > 0
          ? "down"
          : loadState === "ok" && s?.invoice_flow && s.invoice_flow.pending_review > 0
            ? "amber"
            : "up",
      changeColor: "" as const,
    },
    {
      label: "FTA filing deadline",
      icon: "📅",
      val:
        loadState === "loading"
          ? null
          : loadState === "error"
            ? "—"
            : fmtDate(filingDeadline),
      valClass: "",
      change:
        loadState === "loading"
          ? ""
          : loadState === "error"
            ? "—"
            : daysFiling !== null
              ? `${daysFiling} days remaining`
              : "—",
      changeClass: "",
      changeColor:
        loadState === "ok" && daysFiling !== null && daysFiling <= 14
          ? ("amber" as const)
          : ("" as const),
    },
  ];

  return (
    <>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-7">
        <div>
          <div className="font-mono text-[11px] text-gold uppercase tracking-[0.1em] mb-1.5">
            // Dashboard Overview
          </div>
          <h2 className="font-playfair text-[26px] font-bold">Al Baraka Trading LLC</h2>
          <div className="text-[13px] text-muted mt-1">
            TRN: 100123456700003 · Mainland ·{" "}
            {loadState === "loading" ? (
              <span className="inline-block h-3 w-40 bg-[rgba(78,168,255,0.12)] rounded align-middle animate-pulse" />
            ) : loadState === "error" ? (
              <span>Period —</span>
            ) : (
              <>
                {periodLabel ?? "—"}
                {periodRange ? ` (${periodRange})` : ""}
              </>
            )}
          </div>
          {loadState === "error" && (
            <p className="text-[12px] text-amber mt-2">
              Live metrics unavailable — check API or <span className="font-mono">NEXT_PUBLIC_API_URL</span>.
            </p>
          )}
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <Link
            href="/dashboard/vat-classifier"
            className="inline-flex items-center justify-center px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer border border-border-g text-gold hover:bg-gold-pale transition-all"
          >
            📥 Import CSV
          </Link>
          <Link
            href="/dashboard/vat-return"
            className="inline-flex items-center justify-center px-5 py-2 rounded-lg text-xs font-semibold cursor-pointer bg-gradient-to-br from-gold to-gold-lt text-deep shadow-[0_4px_18px_rgba(201,168,76,0.38)] hover:shadow-[0_6px_24px_rgba(201,168,76,0.52)] hover:-translate-y-px transition-all"
          >
            ⚡ Generate VAT Return
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
        {loadState === "loading"
          ? Array.from({ length: 4 }).map((_, i) => <KpiSkeleton key={i} />)
          : kpis.map((kpi) => (
              <div
                key={kpi.label}
                className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl p-6 transition-all hover:border-border-g hover:-translate-y-0.5"
              >
                <div className="text-xs text-muted uppercase tracking-[0.07em] font-medium mb-2.5 flex items-center justify-between">
                  {kpi.label} <span className="text-base">{kpi.icon}</span>
                </div>
                <div
                  className={`font-playfair text-[30px] font-black leading-none mb-2 ${
                    kpi.val === null
                      ? "text-muted2 animate-pulse"
                      : kpi.val === "—"
                        ? "text-muted2"
                        : kpi.valClass === "gold"
                          ? "text-gold-lt"
                          : kpi.valClass === "red"
                            ? "text-red"
                            : kpi.valClass === "amber"
                              ? "text-amber"
                              : kpi.valClass === "green"
                                ? "text-green"
                                : "text-white"
                  }`}
                >
                  {kpi.val === null ? "\u00a0" : kpi.val}
                </div>
                <div
                  className={`text-xs font-mono ${
                    kpi.changeClass === "up"
                      ? "text-green"
                      : kpi.changeClass === "down"
                        ? "text-red"
                        : kpi.changeClass === "amber"
                          ? "text-amber"
                          : kpi.changeColor === "amber"
                            ? "text-amber"
                            : "text-muted"
                  }`}
                >
                  {kpi.change || "\u00a0"}
                </div>
              </div>
            ))}
      </div>

      {/* Action Required panel — only shown when there's something to act on */}
      {loadState === "ok" && s?.invoice_flow && (s.invoice_flow.escalated > 0 || s.invoice_flow.pending_review > 0 || s.invoice_flow.auto_approved_today > 0) && (
        <div className="mb-5 rounded-2xl border border-border bg-gradient-to-br from-card to-[#071228] overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <span className="text-sm font-semibold text-white">Action Required</span>
            </div>
            <Link
              href="/dashboard/invoice-flow/review"
              className="text-[11px] text-gold-lt hover:underline font-medium"
            >
              Open Review Queue →
            </Link>
          </div>
          <div className="grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {/* Hard blocked */}
            <div className={`px-6 py-5 flex items-start gap-4 ${s.invoice_flow.escalated > 0 ? "" : "opacity-40"}`}>
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${s.invoice_flow.escalated > 0 ? "bg-[rgba(255,107,107,0.15)]" : "bg-[rgba(255,255,255,0.06)]"}`}>
                🔴
              </div>
              <div>
                <div className={`text-[22px] font-black font-mono leading-none mb-1 ${s.invoice_flow.escalated > 0 ? "text-red" : "text-muted2"}`}>
                  {s.invoice_flow.escalated}
                </div>
                <div className="text-[12px] font-medium text-white">Hard blocked</div>
                <div className="text-[11px] text-muted2 mt-0.5">Finance Manager override required</div>
                {s.invoice_flow.escalated > 0 && (
                  <Link href="/dashboard/invoice-flow/review?status=escalated" className="text-[11px] text-red hover:underline mt-1 inline-block">
                    Review now →
                  </Link>
                )}
              </div>
            </div>

            {/* Pending review */}
            <div className={`px-6 py-5 flex items-start gap-4 ${s.invoice_flow.pending_review > 0 ? "" : "opacity-40"}`}>
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${s.invoice_flow.pending_review > 0 ? "bg-[rgba(255,183,0,0.15)]" : "bg-[rgba(255,255,255,0.06)]"}`}>
                🟡
              </div>
              <div>
                <div className={`text-[22px] font-black font-mono leading-none mb-1 ${s.invoice_flow.pending_review > 0 ? "text-amber" : "text-muted2"}`}>
                  {s.invoice_flow.pending_review}
                </div>
                <div className="text-[12px] font-medium text-white">Awaiting review</div>
                <div className="text-[11px] text-muted2 mt-0.5">AP accountant approval needed</div>
                {s.invoice_flow.pending_review > 0 && (
                  <Link href="/dashboard/invoice-flow/review?status=review" className="text-[11px] text-amber hover:underline mt-1 inline-block">
                    Review queue →
                  </Link>
                )}
              </div>
            </div>

            {/* Auto-approved today */}
            <div className="px-6 py-5 flex items-start gap-4">
              <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${s.invoice_flow.auto_approved_today > 0 ? "bg-[rgba(45,212,160,0.15)]" : "bg-[rgba(255,255,255,0.06)]"}`}>
                🟢
              </div>
              <div>
                <div className={`text-[22px] font-black font-mono leading-none mb-1 ${s.invoice_flow.auto_approved_today > 0 ? "text-green" : "text-muted2"}`}>
                  {s.invoice_flow.auto_approved_today}
                </div>
                <div className="text-[12px] font-medium text-white">Auto-approved today</div>
                <div className="text-[11px] text-muted2 mt-0.5">Clean invoices · in VAT Return</div>
                {s.invoice_flow.auto_approved_today > 0 && (
                  <Link href="/dashboard/vat-classifier" className="text-[11px] text-green hover:underline mt-1 inline-block">
                    View in classifier →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* VAT at risk bar */}
          {s.invoice_flow.total_vat_at_risk_aed > 0 && (
            <div className="px-6 py-3 border-t border-border flex items-center justify-between">
              <span className="text-[11px] text-muted2">HIGH-severity VAT at risk across all invoices</span>
              <span className="text-[12px] font-mono font-semibold text-red">
                AED {s.invoice_flow.total_vat_at_risk_aed.toLocaleString("en-AE", { minimumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 mb-5">
        <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden min-h-[320px]">
          <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)] flex items-center justify-between flex-wrap gap-2">
            <div className="text-sm font-semibold text-white flex items-center gap-2">
              Recent activity
              <span className="font-mono text-[11px] text-gold bg-gold-pale px-2 py-0.5 rounded">
                Audit log
              </span>
            </div>
            <Link
              href="/dashboard/vat-classifier"
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-border-g text-gold hover:bg-gold-pale transition-all"
            >
              Classify transactions
            </Link>
          </div>
          <div className="p-6">
            {loadState === "loading" && (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 rounded-lg bg-[rgba(78,168,255,0.08)] animate-pulse" />
                ))}
              </div>
            )}
            {loadState === "error" && (
              <p className="text-sm text-muted text-center py-12">—</p>
            )}
            {loadState === "ok" && s && (
              <>
                {s.recent_activity.length === 0 ? (
                  <p className="text-sm text-muted text-center py-8">No recent audit events.</p>
                ) : (
                  <ul className="divide-y divide-[rgba(78,168,255,0.1)]">
                    {s.recent_activity.map((row, i) => (
                      <li key={i} className="py-3.5 flex flex-col gap-1">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[13px] text-white font-medium">{row.action}</span>
                          <span className="text-[11px] font-mono text-muted">
                            {row.timestamp
                              ? new Date(row.timestamp).toLocaleString("en-GB", {
                                  day: "2-digit",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  timeZone: "Asia/Dubai",
                                })
                              : "—"}
                          </span>
                        </div>
                        <div className="text-[12px] text-muted">
                          <span className="text-gold-lt">{row.actor}</span>
                          {row.entity ? (
                            <>
                              {" "}
                              · <span className="font-mono text-[11px]">{row.entity}</span>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)] flex items-center justify-between">
              <div className="text-sm font-semibold text-white">
                {loadState === "ok" && s ? `VAT snapshot · ${s.current_period.label}` : "VAT snapshot"}
              </div>
              <Link
                href="/dashboard/vat-return"
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-border-g text-gold hover:bg-gold-pale transition-all"
              >
                Open return
              </Link>
            </div>
            <div className="p-6 space-y-3">
              {loadState === "loading" && (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 rounded-[10px] bg-[rgba(78,168,255,0.08)] animate-pulse" />
                  ))}
                </div>
              )}
              {(loadState === "error" || loadState === "ok") && (
                <>
                  <MetricRow label="Est. VAT payable (Box 8+)" value={loadState === "ok" ? fmtAed(vatDue ?? 0) : "—"} />
                  <MetricRow
                    label="Transactions classified (period)"
                    value={loadState === "ok" ? dashStr(classified) : "—"}
                  />
                  <MetricRow
                    label="Invoices in review queue"
                    value={loadState === "ok" ? dashStr(s?.invoice_flow?.pending_review ?? 0) : "—"}
                  />
                  <MetricRow
                    label="Hard-blocked invoices"
                    value={loadState === "ok" ? dashStr(s?.invoice_flow?.escalated ?? 0) : "—"}
                  />
                  <MetricRow
                    label="E-invoicing readiness"
                    value={
                      loadState === "ok" && s
                        ? `${s.e_invoicing.readiness_score}/100`
                        : "—"
                    }
                  />
                  <div className="h-1 bg-[rgba(255,255,255,0.07)] rounded-full mt-2 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-gold to-gold-lt transition-all"
                      style={{
                        width:
                          loadState === "ok" && s
                            ? `${Math.min(100, Math.max(8, s.e_invoicing.readiness_score))}%`
                            : "0%",
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-muted font-mono">
                    {loadState === "ok" && s
                      ? `${s.e_invoicing.days_to_mandate}d to e-invoicing mandate · ASP ${s.e_invoicing.asp_appointed ? "on file" : "not recorded"}`
                      : "—"}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="bg-gradient-to-br from-card to-[#071228] border border-border rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-[rgba(78,168,255,0.14)]">
              <div className="text-sm font-semibold text-white">Compliance deadlines</div>
            </div>
            <div className="p-6 flex flex-col gap-2.5">
              {loadState === "loading" ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 rounded-[10px] bg-[rgba(78,168,255,0.08)] animate-pulse" />
                  ))}
                </>
              ) : loadState === "error" ? (
                <p className="text-sm text-muted py-4 text-center">—</p>
              ) : (
                s && (
                  <>
                    <DeadlineRow
                      icon="🧾"
                      title="VAT return filing"
                      date={fmtDate(s.vat.filing_deadline)}
                      days={`${s.vat.days_to_filing}d`}
                      status={s.vat.days_to_filing <= 14 ? "soon" : "ok"}
                    />
                    <DeadlineRow
                      icon="🏛️"
                      title="Corporate tax filing"
                      date={fmtDate(s.corporate_tax.filing_deadline)}
                      days={`${s.corporate_tax.days_to_deadline}d`}
                      status="ok"
                    />
                    <DeadlineRow
                      icon="⚖️"
                      title="ESR annual report"
                      date="—"
                      days="—"
                      status="ok"
                    />
                  </>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-[10px] border bg-[rgba(15,40,90,0.35)] border-border">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-mono text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function DeadlineRow({
  icon,
  title,
  date,
  days,
  status,
}: {
  icon: string;
  title: string;
  date: string;
  days: string;
  status: "urgent" | "soon" | "ok";
}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 rounded-[10px] bg-[rgba(15,40,90,0.35)] border border-border">
      <div className="text-xl flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-white">{title}</div>
        <div className="text-[11px] text-muted font-mono mt-0.5 truncate">{date}</div>
      </div>
      <div
        className={`font-mono text-xs font-semibold px-2.5 py-1 rounded-md flex-shrink-0 ${
          status === "urgent"
            ? "bg-[rgba(255,107,107,0.12)] text-red"
            : status === "soon"
              ? "bg-[rgba(255,169,64,0.12)] text-amber"
              : "bg-[rgba(45,212,160,0.1)] text-green"
        }`}
      >
        {days}
      </div>
    </div>
  );
}
