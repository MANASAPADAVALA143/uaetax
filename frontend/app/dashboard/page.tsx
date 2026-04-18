"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Upload, FileText, RefreshCw, Calendar, Building2, Zap } from "lucide-react";

const COMPANY_ID = 1;

interface DashboardSummary {
  current_period: { start_date: string; end_date: string; label: string };
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
  recent_activity: { timestamp: string; actor: string; action: string; entity: string }[];
  pending_approvals: number;
  open_reconciliation_mismatches: number;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function Dashboard() {
  const apiUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await axios.get<DashboardSummary>(`${apiUrl}/api/dashboard/summary`, {
          params: { company_id: COMPANY_ID },
        });
        if (!cancelled) {
          setData(res.data);
          setLoadError(null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e.response?.data?.detail || "Could not load dashboard");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const nextDeadlineLabel = data
    ? Math.min(
        data.vat.days_to_filing,
        data.corporate_tax.days_to_deadline,
        data.e_invoicing.days_to_mandate
      )
    : 0;

  const cards = data
    ? [
        {
          key: "vat",
          label: "VAT (estimated payable)",
          value: `AED ${fmtMoney(data.vat.estimated_payable_aed)}`,
          sub: `${data.vat.transactions_classified} classified · ${data.vat.transactions_needing_review} need review · ${data.vat.days_to_filing}d to filing (${fmtDate(data.vat.filing_deadline)})`,
          href: "/dashboard/vat-classifier",
          icon: "💰",
        },
        {
          key: "ct",
          label: "Corporate Tax",
          value: `AED ${fmtMoney(data.corporate_tax.estimated_liability_aed)}`,
          sub: `${data.corporate_tax.status.replace(/_/g, " ")} · ${data.corporate_tax.days_to_deadline}d to ${fmtDate(data.corporate_tax.filing_deadline)}`,
          href: "/dashboard/corporate-tax",
          icon: "🏢",
        },
        {
          key: "ein",
          label: "E-invoicing readiness",
          value: `${data.e_invoicing.readiness_score}/100`,
          sub: `ASP ${data.e_invoicing.asp_appointed ? "appointed" : "not appointed"} · mandate ${fmtDate(data.e_invoicing.mandate_date)} · ${data.e_invoicing.days_to_mandate}d`,
          href: "/dashboard/e-invoicing",
          icon: "📡",
        },
        {
          key: "deadline",
          label: "Next critical deadline (days)",
          value: String(nextDeadlineLabel),
          sub: `Pending approvals: ${data.pending_approvals} · Open recon mismatches: ${data.open_reconciliation_mismatches} · Period ${data.current_period.label}`,
          href: "/dashboard/vat-return",
          icon: "📅",
        },
      ]
    : [];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-[#7A9BB5]">
          {data ? `Company ID ${COMPANY_ID} · ${data.current_period.label}` : "Loading live metrics…"}
        </p>
        {loadError && (
          <p className="mt-2 text-sm text-[#FF6B6B]">{loadError}</p>
        )}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((stat) => (
          <Link
            key={stat.key}
            href={stat.href}
            className="rounded-xl border border-[rgba(78,168,255,0.12)] bg-[#0A1A35] p-6 transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm uppercase tracking-wide text-[#7A9BB5]">{stat.label}</span>
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <div className="mb-2 text-2xl font-bold text-white xl:text-3xl">{stat.value}</div>
            <div className="text-sm leading-snug text-[#7A9BB5]">{stat.sub}</div>
          </Link>
        ))}
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-xl font-semibold text-white">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <Link
            href="/dashboard/vat-classifier"
            className="flex items-center gap-3 rounded-lg bg-gradient-to-br from-[#C9A84C] to-[#E8C96A] px-6 py-3 font-semibold text-[#040D1F] transition-all hover:shadow-lg"
          >
            <Upload className="h-5 w-5" />
            Upload Transactions
          </Link>
          <Link
            href="/dashboard/vat-return"
            className="flex items-center gap-3 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-6 py-3 font-semibold text-white transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <FileText className="h-5 w-5" />
            Generate Return
          </Link>
          <Link
            href="/dashboard/reconciliation"
            className="flex items-center gap-3 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-6 py-3 font-semibold text-white transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <RefreshCw className="h-5 w-5" />
            Run Reconciliation
          </Link>
          <Link
            href="/dashboard/corporate-tax"
            className="flex items-center gap-3 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-6 py-3 font-semibold text-white transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <Building2 className="h-5 w-5" />
            Corporate Tax
          </Link>
          <Link
            href="/dashboard/e-invoicing"
            className="flex items-center gap-3 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-6 py-3 font-semibold text-white transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <Zap className="h-5 w-5" />
            E-Invoicing
          </Link>
          <Link
            href="/dashboard/vat-return"
            className="flex items-center gap-3 rounded-lg border border-[rgba(78,168,255,0.22)] bg-[#0A1A35] px-6 py-3 font-semibold text-white transition-all hover:border-[rgba(201,168,76,0.22)]"
          >
            <Calendar className="h-5 w-5" />
            Calendar (VAT)
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-[rgba(78,168,255,0.12)] bg-[#0A1A35] p-6">
        <h2 className="mb-4 text-xl font-semibold text-white">Recent activity</h2>
        {!data?.recent_activity?.length ? (
          <p className="text-sm text-[#7A9BB5]">No audit log entries yet. Classify transactions to populate activity.</p>
        ) : (
          <div className="space-y-4">
            {data.recent_activity.map((activity, index) => (
              <div
                key={`${activity.timestamp}-${index}`}
                className="flex items-center gap-4 rounded-lg border border-[rgba(78,168,255,0.12)] bg-[rgba(20,50,100,0.25)] p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[rgba(45,212,160,0.12)] text-sm">
                  ✓
                </div>
                <div className="flex-1">
                  <div className="font-medium text-white">{activity.action}</div>
                  <div className="text-sm text-[#7A9BB5]">
                    {activity.actor}
                    {activity.entity ? ` · ${activity.entity}` : ""} ·{" "}
                    {fmtDate(activity.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
