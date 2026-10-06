/**
 * GulfTax VAT Advanced — FastAPI only (RDS, with server-side Supabase fallback).
 * Do not write from the browser Supabase client — RLS blocks anon inserts.
 *
 * Auth and company headers are injected by the shared api client.
 */
import axios from "axios";
import { apiClient } from "@/lib/api";
import type { BadDebtResult, DesignatedZoneResult, PartialExemptionResult } from "@/lib/gulftax/vatAdvanced";

function parseApiError(data: unknown, status: number): string {
  if (typeof data === "string" && data.trim()) return data;
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          typeof d === "object" && d && "msg" in d
            ? String((d as { msg: string }).msg)
            : JSON.stringify(d),
        )
        .join("; ");
    }
  }
  return `Request failed (${status})`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  let body: unknown;
  if (typeof init?.body === "string" && init.body) {
    body = JSON.parse(init.body);
  }
  try {
    const res = await apiClient.request<T>({
      url: path,
      method,
      data: body,
    });
    return res.data;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      throw new Error(parseApiError(e.response?.data, e.response?.status ?? 0));
    }
    throw e;
  }
}

export interface PartialExemptionRecord {
  id: string;
  period: string;
  period_type?: string;
  taxable_supplies: number;
  exempt_supplies: number;
  input_vat_paid: number;
  recovery_pct: number;
  recoverable_vat: number;
  irrecoverable_vat: number;
  breakdown: unknown;
  status?: string;
  created_at: string;
}

export interface BadDebtClaimRecord {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  invoice_amount: number;
  vat_amount: number;
  status: string;
  eligible: boolean;
  eligibility_reason: string | null;
  claim_period?: string | null;
  extra?: Record<string, unknown>;
  created_at?: string;
}

export async function savePartialExemption(
  _workspaceId: string,
  _companyId: string | null,
  period: string,
  periodType: string,
  inputs: { taxable: number; exempt: number; inputVat: number; provisionalPct?: number },
  result: PartialExemptionResult,
): Promise<PartialExemptionRecord> {
  // Production OpenAPI still types breakdown as object|null — sending the UI's
  // label/value array causes 422 "Input should be a valid dictionary".
  const breakdownDict: Record<string, string> = {};
  for (const row of result.breakdown ?? []) {
    if (row?.label != null) breakdownDict[String(row.label)] = String(row.value ?? "");
  }

  return apiFetch<PartialExemptionRecord>("/api/gulftax/vat-advanced/partial-exemption", {
    method: "POST",
    body: JSON.stringify({
      period,
      period_type: periodType,
      taxable_supplies: inputs.taxable,
      exempt_supplies: inputs.exempt,
      input_vat_paid: inputs.inputVat,
      recovery_pct: result.recoveryPct,
      recoverable_vat: result.recoverableVat,
      irrecoverable_vat: result.irrecoverableVat,
      breakdown: breakdownDict,
    }),
  });
}

export async function listPartialExemptions(_workspaceId: string): Promise<PartialExemptionRecord[]> {
  try {
    const data = await apiFetch<{ items: PartialExemptionRecord[] }>(
      "/api/gulftax/vat-advanced/partial-exemption",
    );
    return data.items ?? [];
  } catch (e) {
    console.warn("[vatAdvanced] list PE:", e);
    return [];
  }
}

export async function approvePartialExemption(recordId: string): Promise<PartialExemptionRecord | null> {
  try {
    return await apiFetch<PartialExemptionRecord>(
      `/api/gulftax/vat-advanced/partial-exemption/${recordId}/approve`,
      { method: "PATCH" },
    );
  } catch (e) {
    console.warn("[vatAdvanced] approve PE:", e);
    return null;
  }
}

export async function saveBadDebtClaim(
  _workspaceId: string,
  companyId: string | null,
  input: {
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    invoiceAmount: number;
    vatAmount: number;
    vatReturnPeriod: string;
    writtenOffDate: string;
    recoverySteps: string;
    connectedParty: boolean;
  },
  result: BadDebtResult,
): Promise<BadDebtClaimRecord> {
  const payload = {
    invoice_number: input.invoiceNumber,
    invoice_date: input.invoiceDate,
    due_date: input.dueDate,
    invoice_amount: input.invoiceAmount,
    vat_amount: input.vatAmount,
    status: result.eligible ? "eligible" : "ineligible",
    eligible: result.eligible,
    eligibility_reason: result.eligible ? null : result.reasons.join(" "),
    company_id: companyId || undefined,
    vat_return_period: input.vatReturnPeriod,
    written_off_date: input.writtenOffDate,
    recovery_steps: input.recoverySteps,
    connected_party: input.connectedParty,
    claim_period: result.claimPeriod,
    extra: {
      vat_return_period: input.vatReturnPeriod,
      written_off_date: input.writtenOffDate,
      recovery_steps: input.recoverySteps,
      connected_party: input.connectedParty,
      claim_period: result.claimPeriod,
    },
  };
  try {
    return await apiFetch<BadDebtClaimRecord>("/api/gulftax/bad-debt/claim", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (primary) {
    return apiFetch<BadDebtClaimRecord>("/api/gulftax/vat-advanced/bad-debt", {
      method: "POST",
      body: JSON.stringify(payload),
    }).catch(() => {
      throw primary instanceof Error ? primary : new Error(String(primary));
    });
  }
}

export async function listBadDebtClaims(_workspaceId: string): Promise<BadDebtClaimRecord[]> {
  try {
    const data = await apiFetch<{ items: BadDebtClaimRecord[] }>("/api/gulftax/vat-advanced/bad-debt");
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function approveBadDebtClaim(recordId: string): Promise<BadDebtClaimRecord | null> {
  try {
    return await apiFetch<BadDebtClaimRecord>(
      `/api/gulftax/vat-advanced/bad-debt/${recordId}/approve`,
      { method: "PATCH" },
    );
  } catch (e) {
    console.warn("[vatAdvanced] approve bad debt:", e);
    return null;
  }
}

export async function getPendingBadDebtTotal(workspaceId: string): Promise<number> {
  const items = await listBadDebtClaims(workspaceId);
  return items
    .filter((r) => r.eligible && ["eligible", "draft", "pending"].includes(r.status))
    .reduce((sum, r) => sum + Number(r.vat_amount || 0), 0);
}

export async function saveDesignatedZoneTransaction(
  _workspaceId: string,
  companyId: string | null,
  input: {
    supplierLocation: string;
    customerLocation: string;
    transactionType: string;
    supplierZoneName?: string;
    customerZoneName?: string;
  },
  result: DesignatedZoneResult,
): Promise<{ id?: string; vat_treatment?: string }> {
  const payload = {
    transaction_type: input.transactionType === "services" ? "Services" : "Goods",
    supplier_location: input.supplierLocation,
    supplier_zone: input.supplierZoneName || "",
    customer_location: input.customerLocation,
    vat_treatment: result.vatTreatment,
    vat_rate: result.vatRate,
    explanation: result.explanation,
    warning: result.warning,
    company_id: companyId || undefined,
    supplier_zone_name: input.supplierZoneName || null,
    customer_zone_name: input.customerZoneName || null,
  };
  return apiFetch<{ id?: string; vat_treatment?: string }>("/api/gulftax/designated-zones/log", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
