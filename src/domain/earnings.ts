import { wageEarned } from "./dailyWage";
import { sumPaise, type Paise } from "./money";

/** null means unknown — never treated as zero. */
export interface PlatformEntry {
  grossPaise: Paise | null;
  adjustmentPaise: Paise | null;
  cashRetainedPaise: Paise | null;
  advanceOffsetPaise: Paise | null;
  payoutPaise: Paise | null;
  fuelPaise: Paise | null;
  otherExpensePaise: Paise | null;
}

export interface DailyEntry {
  ratePaise: Paise | null;
  fullDays: number | null;
  halfDays: number | null;
  paidPaise: Paise | null;
  advancesPaise: Paise | null;
}

export interface Total {
  value: Paise;
  /** False when at least one contributing value was unknown. */
  complete: boolean;
}

function total(values: Array<Paise | null>): Total {
  const known = values.filter((v): v is Paise => v !== null);
  return { value: known.length ? sumPaise(...known) : 0, complete: known.length === values.length };
}

/**
 * Earnings (gross + adjustments), payout (what reached the bank) and recorded
 * expenses are kept separate so payout differences from cash or advance
 * offsets are not mistaken for lost earnings.
 */
export function summarizePlatform(entries: PlatformEntry[]) {
  const earned = total(entries.flatMap((e) => [e.grossPaise, e.adjustmentPaise ?? 0]));
  const payout = total(entries.map((e) => e.payoutPaise));
  const expenses = total(entries.flatMap((e) => [e.fuelPaise, e.otherExpensePaise]));
  const offsets = total(entries.flatMap((e) => [e.cashRetainedPaise, e.advanceOffsetPaise]));
  return {
    earned,
    payout,
    expenses,
    offsets,
    afterExpenses: earned.complete ? { value: earned.value - expenses.value, complete: expenses.complete } : null,
  };
}

export function summarizeDaily(entries: DailyEntry[]) {
  let earnedValue = 0;
  let earnedComplete = true;
  for (const e of entries) {
    if (e.ratePaise === null || e.fullDays === null) {
      earnedComplete = false;
      continue;
    }
    earnedValue += wageEarned(e.ratePaise, e.fullDays, e.halfDays ?? 0).earned;
    if (e.halfDays === null) earnedComplete = false;
  }
  const received = total(entries.flatMap((e) => [e.paidPaise, e.advancesPaise]));
  const earned = { value: earnedValue, complete: earnedComplete };
  return { earned, received, balance: earned.complete && received.complete ? earned.value - received.value : null };
}
