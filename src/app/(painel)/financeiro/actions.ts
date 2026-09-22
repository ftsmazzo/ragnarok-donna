"use server";

import {
  upsertFinanceEntry,
  settleFinanceEntry,
  softDeleteFinanceEntry,
  reconcileFinanceEntry,
  upsertBankAccount,
  upsertChartAccount,
  upsertCreditCard,
  openCardInvoice,
  seedTreasuryFromDonnaSample,
  saveTreasuryBridgeSettings,
  backfillTreasuryBridge,
  importTreasuryEntriesFromFile,
  importChartAccountsFromFile,
  type FinanceEntryInput,
} from "@/server/treasury";

export async function saveFinanceEntryAction(input: FinanceEntryInput) {
  return upsertFinanceEntry(input);
}

export async function settleEntryAction(input: {
  id: string;
  actualCents?: number;
  bankAccountId?: string | null;
}) {
  return settleFinanceEntry(input);
}

export async function deleteEntryAction(id: string) {
  return softDeleteFinanceEntry(id);
}

export async function reconcileEntryAction(id: string, reconciled: boolean) {
  return reconcileFinanceEntry({ id, reconciled });
}

export async function saveBankAccountAction(input: {
  id?: string;
  name: string;
  institution?: string;
  accountType?: "checking" | "savings" | "internal" | "other";
  bankCode?: string;
  openingBalanceCents?: number;
  openingBalanceDate?: string;
}) {
  return upsertBankAccount(input);
}

export async function saveChartAccountAction(input: {
  id?: string;
  code: string;
  name: string;
  syntheticName?: string;
  dfcGroup1?: string;
  dfcGroup2?: string;
  dreGroup1?: string;
  dreGroup2?: string;
}) {
  return upsertChartAccount(input);
}

export async function saveCreditCardAction(input: {
  id?: string;
  name: string;
  institution?: string;
  limitCents: number;
  closingDay: number;
  dueDay: number;
}) {
  return upsertCreditCard(input);
}

export async function openCardInvoiceAction(input: {
  creditCardId: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
}) {
  return openCardInvoice(input);
}

export async function seedDonnaAction() {
  return seedTreasuryFromDonnaSample();
}

export async function saveBridgeSettingsAction(input: {
  enabled: boolean;
  methodCodes: string[];
  defaultChartAccountCode?: string;
}) {
  return saveTreasuryBridgeSettings(input);
}

export async function backfillBridgeAction() {
  return backfillTreasuryBridge(100);
}

export async function importEntriesFileAction(input: {
  base64: string;
  fileName: string;
}) {
  return importTreasuryEntriesFromFile(input);
}

export async function importChartFileAction(input: {
  base64: string;
  fileName: string;
}) {
  return importChartAccountsFromFile(input);
}
