/** UAE VAT advanced compliance — partial exemption, designated zones, bad debt relief */

export type LocationType = 'mainland' | 'free_zone' | 'designated_zone' | 'overseas';
export type TransactionKind = 'goods' | 'services';

export const DESIGNATED_ZONES = [
  { id: 'jafza', name: 'Jebel Ali Free Zone (JAFZA)', emirate: 'Dubai' },
  { id: 'dafza', name: 'Dubai Airport Free Zone (DAFZA)', emirate: 'Dubai' },
  { id: 'dso', name: 'Dubai Silicon Oasis', emirate: 'Dubai' },
  { id: 'dmc', name: 'Dubai Media City', emirate: 'Dubai' },
  { id: 'dic', name: 'Dubai Internet City', emirate: 'Dubai' },
  { id: 'adgm', name: 'Abu Dhabi Global Market (ADGM)', emirate: 'Abu Dhabi' },
  { id: 'kizad', name: 'Khalifa Industrial Zone (KIZAD)', emirate: 'Abu Dhabi' },
  { id: 'hfz', name: 'Hamriyah Free Zone', emirate: 'Sharjah' },
  { id: 'safz', name: 'Sharjah Airport Free Zone', emirate: 'Sharjah' },
  { id: 'afz', name: 'Ajman Free Zone', emirate: 'Ajman' },
  { id: 'rakez', name: 'Ras Al Khaimah Free Zone (RAKEZ)', emirate: 'RAK' },
  { id: 'ffz', name: 'Fujairah Free Zone', emirate: 'Fujairah' },
] as const;

export interface PartialExemptionInput {
  taxableSupplies: number;
  exemptSupplies: number;
  inputVatPaid: number;
  period: string;
  periodType: 'quarterly' | 'annual';
  provisionalPct?: number;
}

export interface PartialExemptionResult {
  recoveryPct: number;
  recoverableVat: number;
  irrecoverableVat: number;
  totalSupplies: number;
  annualAdjustmentRequired: boolean;
  adjustmentNote: string | null;
  breakdown: Array<{ label: string; value: string }>;
}

export function calculatePartialExemption(input: PartialExemptionInput): PartialExemptionResult {
  const taxable = Math.max(0, input.taxableSupplies);
  const exempt = Math.max(0, input.exemptSupplies);
  const inputVat = Math.max(0, input.inputVatPaid);
  const total = taxable + exempt;

  const recoveryPct = total > 0 ? (taxable / total) * 100 : 0;
  const recoverableVat = inputVat * (recoveryPct / 100);
  const irrecoverableVat = inputVat - recoverableVat;

  const annualAdjustmentRequired =
    input.periodType === 'quarterly' &&
    input.provisionalPct != null &&
    Math.abs(input.provisionalPct - recoveryPct) > 0.01;

  const adjustmentNote = annualAdjustmentRequired
    ? `Provisional recovery ${input.provisionalPct!.toFixed(2)}% differs from actual ${recoveryPct.toFixed(2)}%. File an annual adjustment on the VAT return (Box 7).`
    : input.periodType === 'annual'
      ? 'Annual calculation — use this recovery % for the full tax year.'
      : null;

  const breakdown: Array<{ label: string; value: string }> = [
    { label: 'Taxable supplies (standard + zero-rated)', value: fmtAed(taxable) },
    { label: 'Exempt supplies', value: fmtAed(exempt) },
    { label: 'Total supplies', value: fmtAed(total) },
    { label: 'Recovery percentage', value: `${recoveryPct.toFixed(2)}%` },
    { label: 'Input VAT paid', value: fmtAed(inputVat) },
    { label: 'Recoverable input VAT', value: fmtAed(recoverableVat) },
    { label: 'Irrecoverable input VAT', value: fmtAed(irrecoverableVat) },
    { label: 'Period', value: `${input.period} (${input.periodType})` },
  ];

  return {
    recoveryPct,
    recoverableVat,
    irrecoverableVat,
    totalSupplies: total,
    annualAdjustmentRequired,
    adjustmentNote,
    breakdown,
  };
}

export interface DesignatedZoneInput {
  supplierLocation: LocationType;
  customerLocation: LocationType;
  transactionType: TransactionKind;
  supplierZoneName?: string;
  customerZoneName?: string;
}

export interface DesignatedZoneResult {
  vatTreatment: string;
  vatRate: number;
  explanation: string;
  warning: string | null;
}

export function evaluateDesignatedZone(input: DesignatedZoneInput): DesignatedZoneResult {
  const { supplierLocation, customerLocation, transactionType } = input;

  if (transactionType === 'services') {
    const warning =
      supplierLocation === 'designated_zone' || customerLocation === 'designated_zone'
        ? 'Services are always subject to normal UAE VAT rules — Designated Zone status does not apply to services. This is the most common FTA audit finding.'
        : null;
    return {
      vatTreatment: 'Standard rated (5%)',
      vatRate: 5,
      explanation:
        'Under UAE VAT law, Designated Zone treatment applies to goods only. Services follow standard place-of-supply rules regardless of whether parties are in a Designated Zone.',
      warning,
    };
  }

  const sDz = supplierLocation === 'designated_zone';
  const cDz = customerLocation === 'designated_zone';
  const cMain = customerLocation === 'mainland' || customerLocation === 'free_zone';
  const sMain = supplierLocation === 'mainland' || supplierLocation === 'free_zone';

  if (sDz && cDz) {
    return {
      vatTreatment: 'Outside scope',
      vatRate: 0,
      explanation:
        'Transfer of goods between two Designated Zones is outside the scope of UAE VAT — no VAT charge or recovery required on this movement.',
      warning: null,
    };
  }
  if (sDz && cMain) {
    return {
      vatTreatment: 'Import (5% VAT)',
      vatRate: 5,
      explanation:
        'Goods moving from a Designated Zone to the UAE mainland are treated as an import. VAT at 5% is due on import (reverse charge may apply to the mainland recipient).',
      warning: null,
    };
  }
  if (sMain && cDz) {
    return {
      vatTreatment: 'Export (0% VAT)',
      vatRate: 0,
      explanation:
        'Goods supplied from the UAE mainland (or non-designated free zone) to a Designated Zone are treated as an export — zero-rated at 0%.',
      warning: null,
    };
  }
  if (sDz && customerLocation === 'overseas') {
    return {
      vatTreatment: 'Export (0% VAT)',
      vatRate: 0,
      explanation: 'Goods exported from a Designated Zone to overseas are zero-rated exports.',
      warning: null,
    };
  }
  if (supplierLocation === 'overseas' && cDz) {
    return {
      vatTreatment: 'Import (5% VAT)',
      vatRate: 5,
      explanation: 'Goods imported into a Designated Zone from overseas are subject to import VAT at 5%.',
      warning: null,
    };
  }

  return {
    vatTreatment: 'Standard rated (5%)',
    vatRate: 5,
    explanation:
      'This goods movement does not qualify for Designated Zone special treatment — apply standard UAE VAT rules.',
    warning: null,
  };
}

export interface BadDebtInput {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  invoiceAmount: number;
  vatAmount: number;
  vatReturnPeriod: string;
  writtenOffDate: string;
  recoverySteps: string;
  connectedParty: boolean;
  vatPaidToFta: boolean;
}

export interface BadDebtResult {
  eligible: boolean;
  reasons: string[];
  claimableVat: number;
  claimPeriod: string | null;
  documentation: string[];
}

const BAD_DEBT_DOCS = [
  'Copy of original tax invoice',
  'Evidence of VAT payment to FTA on original return',
  'Proof of debt write-off in accounting records',
  'Evidence of recovery attempts (emails, legal notices)',
  'Customer details and TRN (if registered)',
];

export function evaluateBadDebtRelief(input: BadDebtInput): BadDebtResult {
  const reasons: string[] = [];
  const due = new Date(input.dueDate);
  const writtenOff = input.writtenOffDate ? new Date(input.writtenOffDate) : null;
  const today = new Date();
  const monthsOverdue =
    (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24 * 30.44);

  if (!input.vatPaidToFta) reasons.push('VAT must have been paid to the FTA on the original VAT return.');
  if (monthsOverdue < 6) reasons.push('Invoice must be more than 6 months overdue from the due date.');
  if (!writtenOff || Number.isNaN(writtenOff.getTime())) {
    reasons.push('Debt must be written off in accounting records (written-off date required).');
  }
  if (!input.recoverySteps.trim()) {
    reasons.push('Document reasonable steps taken to recover the debt.');
  }
  if (input.connectedParty) {
    reasons.push('Bad debt relief is not available for connected parties.');
  }
  if (!input.invoiceNumber.trim()) reasons.push('Original invoice number is required.');
  if (input.vatAmount <= 0) reasons.push('VAT amount must be greater than zero.');

  const eligible = reasons.length === 0;
  let claimPeriod: string | null = null;
  if (eligible && writtenOff) {
    const y = writtenOff.getFullYear();
    const q = Math.floor(writtenOff.getMonth() / 3) + 1;
    claimPeriod = `${y}-Q${q}`;
  }

  return {
    eligible,
    reasons,
    claimableVat: eligible ? input.vatAmount : 0,
    claimPeriod,
    documentation: BAD_DEBT_DOCS,
  };
}

export function resolveClassifierEntityType(
  workspaceEntityType?: string | null,
  companyEntityType?: string | null,
): 'mainland' | 'free_zone' | 'designated_zone' {
  const raw = (companyEntityType || workspaceEntityType || 'mainland').toLowerCase();
  if (raw.includes('designated')) return 'designated_zone';
  if (raw.includes('free')) return 'free_zone';
  return 'mainland';
}

function fmtAed(n: number): string {
  return `AED ${n.toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
