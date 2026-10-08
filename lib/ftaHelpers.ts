/**
 * FTA / anomaly helpers ported from finreport gulfTaxApi.
 * Uses the shared apiClient (Supabase JWT + X-Company-ID).
 */
import { apiClient } from "@/lib/api";

export type FtaChecklistItem = {
  id: string;
  category: string;
  title: string;
  description: string;
  status: "pass" | "warning" | "fail" | "na";
  risk_level: "low" | "medium" | "high";
  detail: string;
  count?: number;
};

export type FtaAuditChecklist = {
  company_name: string;
  trn: string | null;
  period_start: string;
  period_end: string;
  generated_at: string;
  overall_score_pct: number;
  overall_risk: "low" | "medium" | "high";
  summary: { pass: number; warning: number; fail: number };
  transaction_count: number;
  items: FtaChecklistItem[];
};

export type FtaApRisk = {
  total_invoices?: number;
  total_vat_at_risk_aed?: number;
  blocked_input_vat_aed?: number;
  flag_counts?: { high?: number; medium?: number; low?: number; total?: number };
  anomaly_counts?: { missing_or_invalid_trn?: number; duplicate_invoices?: number };
};

export type VatTxn = {
  id?: number;
  description?: string;
  vendor_or_customer?: string;
  invoice_number?: string;
  vat_treatment?: string;
  confidence_score?: number;
  is_verified?: boolean;
  amount_aed?: number;
};

export function taxPeriodToDateRange(period: string): { start: string; end: string } {
  const m = /^(\d{4})-Q([1-4])$/i.exec(period.trim());
  if (m) {
    const year = Number(m[1]);
    const q = Number(m[2]);
    const startMonth = (q - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const lastDay = new Date(year, endMonth, 0).getDate();
    const end = `${year}-${String(endMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }
  const ym = /^(\d{4})-(\d{2})$/.exec(period.trim());
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { start, end };
  }
  const y = new Date().getFullYear();
  return { start: `${y}-01-01`, end: `${y}-12-31` };
}

export async function fetchFtaApRisk(): Promise<FtaApRisk> {
  const { data } = await apiClient.get<FtaApRisk>("/api/fta/ap-risk-summary");
  return data;
}

export async function fetchVatTransactions(limit = 200): Promise<VatTxn[]> {
  const { data } = await apiClient.get<{ transactions?: VatTxn[] } | VatTxn[]>(
    `/api/vat/transactions`,
    { params: { limit } },
  );
  if (Array.isArray(data)) return data;
  return data.transactions ?? [];
}

/** Optional — not all backends expose this route; callers should catch. */
export async function fetchFtaAuditChecklist(
  periodStart: string,
  periodEnd: string,
): Promise<FtaAuditChecklist> {
  const { data } = await apiClient.get<FtaAuditChecklist>(
    "/api/gulftax/fta/audit-checklist",
    { params: { period_start: periodStart, period_end: periodEnd } },
  );
  return data;
}
