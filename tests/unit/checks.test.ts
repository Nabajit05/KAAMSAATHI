import { describe, expect, it } from "vitest";
import {
  canRunCheck,
  dateInZone,
  isCheckStale,
  isComplaintApproved,
  withCheck,
  withComplaint,
  withComplaintApproved,
  withComplaintText,
  withFact,
  type CaseRecord,
} from "@/domain/case";
import { checkDailyWage, wageEarned } from "@/domain/dailyWage";
import { applyWorkerEdit, chooseAlternative, confirmFact, markUnknown, recordConflict, type FactSet } from "@/domain/facts";
import { checkIncentive, combineTri, evaluateTier, expectedIncentive } from "@/domain/incentive";
import { rupees } from "@/domain/money";
import { checkSettlement } from "@/domain/settlement";
import { FIXTURES, fixtureCase } from "@/fixtures/demo";

/** Simulates the worker confirming every extracted fact (and "I don't know" for unreadable ones). */
function confirmAll(facts: FactSet): FactSet {
  const out: FactSet = {};
  for (const [k, f] of Object.entries(facts)) {
    if (!f) continue;
    out[k as keyof FactSet] = f.reviewState === "unreadable" ? markUnknown(f) : confirmFact(f);
  }
  return out;
}

function confirmedCase(id: keyof typeof FIXTURES): CaseRecord {
  const c = fixtureCase(id, "en");
  return { ...c, facts: confirmAll(c.facts) };
}

describe("three-valued eligibility", () => {
  it("never treats unknown as met", () => {
    expect(evaluateTier(null, { minOrders: 30, amount: 1 })).toBe("unknown");
    expect(combineTri(["met", "unknown"])).toBe("unknown");
    expect(combineTri(["met", "not_met", "unknown"])).toBe("not_met");
    expect(combineTri(["met", "met"])).toBe("met");
  });

  it("handles tier modes", () => {
    const tiers = [
      { minOrders: 20, amount: rupees(200) },
      { minOrders: 30, amount: rupees(600) },
    ];
    expect(expectedIncentive(25, tiers, null)).toBe(rupees(200));
    expect(expectedIncentive(32, tiers, "highest_only")).toBe(rupees(600));
    expect(expectedIncentive(32, tiers, "stacking")).toBe(rupees(800));
    expect(expectedIncentive(32, tiers, null)).toBeNull();
    expect(expectedIncentive(10, tiers, null)).toBe(0);
  });
});

describe("Fixture A — possible shortfall", () => {
  it("finds a ₹300 possible incentive difference", () => {
    const r = checkIncentive(confirmedCase("A").facts, 1);
    expect(r.outcome).toBe("possible_difference");
    expect(r.expectedPaise).toBe(rupees(600));
    expect(r.observedPaise).toBe(rupees(300));
    expect(r.differencePaise).toBe(rupees(300));
    expect(r.strength).toBe("records");
    expect(r.primary.code).toBe("threshold_met_paid_less");
  });

  it("treats a pending payment as covering the difference", () => {
    const c = confirmedCase("A");
    c.facts.incentive_pending = applyWorkerEdit(c.facts.incentive_pending, rupees(300));
    const r = checkIncentive(c.facts, 2);
    expect(r.outcome).toBe("records_match");
    expect(r.primary.code).toBe("pending_payment_covers_difference");
  });

  it("is unknown when the zone/shift condition is unknown", () => {
    const c = confirmedCase("A");
    c.facts.condition_zone_shift = markUnknown(c.facts.condition_zone_shift);
    const r = checkIncentive(c.facts, 2);
    expect(r.outcome).toBe("more_info_needed");
    expect(r.differencePaise).toBeNull();
    expect(r.missing).toContain("condition_zone_shift");
  });

  it("is not owed when the zone/shift condition was not met", () => {
    const c = confirmedCase("A");
    c.facts.condition_zone_shift = applyWorkerEdit(c.facts.condition_zone_shift, "not_met");
    const r = checkIncentive(c.facts, 2);
    expect(r.outcome).toBe("records_match");
    expect(r.primary.code).toBe("condition_not_met");
  });

  it("refuses to compare activity from a different date", () => {
    const c = confirmedCase("A");
    c.facts.activity_date = applyWorkerEdit(c.facts.activity_date, "2026-10-04");
    const r = checkIncentive(c.facts, 2);
    expect(r.outcome).toBe("more_info_needed");
    expect(r.primary.code).toBe("dates_differ");
  });

  it("labels worker-entered-only results", () => {
    const c = confirmedCase("A");
    for (const k of Object.keys(c.facts) as (keyof FactSet)[]) {
      c.facts[k] = { ...c.facts[k]!, provenance: "worker_entered" };
    }
    const r = checkIncentive(c.facts, 2);
    expect(r.strength).toBe("worker_only");
    expect(r.reasons.map((x) => x.code)).toContain("worker_entered_only");
  });
});

describe("Fixture B — correctly paid", () => {
  it("reports threshold not met and no difference", () => {
    const r = checkIncentive(confirmedCase("B").facts, 1);
    expect(r.outcome).toBe("records_match");
    expect(r.primary.code).toBe("threshold_not_met");
    expect(r.differencePaise).toBeNull();
  });
});

describe("Fixture C — incomplete evidence", () => {
  it("needs more information and claims no amount", () => {
    const r = checkIncentive(confirmedCase("C").facts, 1);
    expect(r.outcome).toBe("more_info_needed");
    expect(r.expectedPaise).toBeNull();
    expect(r.differencePaise).toBeNull();
    expect(r.missing.length).toBeGreaterThan(0);
  });

  it("cannot be checked until unreadable fields are reviewed", () => {
    const c = fixtureCase("C", "en");
    const gate = canRunCheck(c);
    expect(gate.ok).toBe(false);
  });
});

describe("Fixture D — settlement", () => {
  it("explains COD and advance offsets without a false difference", () => {
    const r = checkSettlement(confirmedCase("D").facts, 1);
    expect(r.outcome).toBe("records_match");
    expect(r.expectedPaise).toBe(rupees(800));
    expect(r.extras.grossEarnings).toBe(rupees(1200));
    // Fuel is an operating expense, not a platform deduction.
    expect(r.extras.netAfterRecordedExpenses).toBe(rupees(1050));
    const codes = r.reasons.map((x) => x.code);
    expect(codes).toContain("advance_is_not_lost_earnings");
    expect(codes).toContain("cash_retained_explained");
    expect(codes).toContain("expenses_incomplete");
  });

  it("flags a lower settlement", () => {
    const c = confirmedCase("D");
    c.facts.bank_settlement = applyWorkerEdit(c.facts.bank_settlement, rupees(700));
    const r = checkSettlement(c.facts, 2);
    expect(r.outcome).toBe("possible_difference");
    expect(r.differencePaise).toBe(rupees(100));
  });

  it("blocks on pending settlement and unclassified deductions", () => {
    const c = confirmedCase("D");
    c.facts.settlement_status = applyWorkerEdit(c.facts.settlement_status, "pending");
    expect(checkSettlement(c.facts, 2).primary.code).toBe("settlement_pending");
    const d = confirmedCase("D");
    d.facts.unclassified_deduction = applyWorkerEdit(undefined, rupees(50));
    expect(checkSettlement(d.facts, 2).outcome).toBe("more_info_needed");
  });

  it("handles negative earnings adjustments", () => {
    const c = confirmedCase("D");
    c.facts.earnings_adjustment = applyWorkerEdit(undefined, -rupees(50));
    const r = checkSettlement(c.facts, 2);
    expect(r.expectedPaise).toBe(rupees(750));
    expect(r.outcome).toBe("records_match"); // received more than expected → no shortfall claim
  });

  it("treats unknown expenses as unknown, not zero", () => {
    const c = confirmedCase("D");
    delete c.facts.fuel_expense;
    const r = checkSettlement(c.facts, 2);
    expect(r.extras.netAfterRecordedExpenses).toBeNull();
  });
});

describe("Fixture E — daily wage", () => {
  it("computes 8 × ₹700 − ₹2,000 = ₹3,600", () => {
    const r = checkDailyWage(confirmedCase("E").facts, 1);
    expect(r.outcome).toBe("possible_difference");
    expect(r.expectedPaise).toBe(rupees(5600));
    expect(r.differencePaise).toBe(rupees(3600));
    expect(r.strength).toBe("worker_only");
  });

  it("handles half-days, advances and odd-paise rounding", () => {
    expect(wageEarned(rupees(700), 2, 1)).toEqual({ earned: rupees(1750), rounded: false });
    expect(wageEarned(70001, 0, 1)).toEqual({ earned: 35001, rounded: true });
    const c = confirmedCase("E");
    c.facts.half_days_confirmed = applyWorkerEdit(c.facts.half_days_confirmed, 2);
    c.facts.advances_received = applyWorkerEdit(c.facts.advances_received, rupees(500));
    const r = checkDailyWage(c.facts, 2);
    expect(r.expectedPaise).toBe(rupees(6300));
    expect(r.differencePaise).toBe(rupees(3800));
  });

  it("never counts unconfirmed days", () => {
    const c = confirmedCase("E");
    c.facts.days_unconfirmed = applyWorkerEdit(undefined, 3);
    const r = checkDailyWage(c.facts, 2);
    expect(r.expectedPaise).toBe(rupees(5600));
    expect(r.reasons.map((x) => x.code)).toContain("unconfirmed_days_excluded");
  });

  it("rejects invalid day counts", () => {
    expect(() => wageEarned(rupees(700), -1, 0)).toThrow();
    expect(() => wageEarned(rupees(700), 1.5, 0)).toThrow();
  });

  it("needs info when payments are unknown", () => {
    const c = confirmedCase("E");
    c.facts.payments_received = markUnknown(c.facts.payments_received);
    expect(checkDailyWage(c.facts, 2).outcome).toBe("more_info_needed");
  });
});

describe("conflicts and provenance", () => {
  it("preserves both values when the worker disagrees with a record", () => {
    const docFact = confirmedCase("A").facts.qualifying_orders!;
    const conflicted = recordConflict(docFact, 34);
    expect(conflicted.reviewState).toBe("conflict");
    expect(conflicted.value).toBe(32);
    expect(conflicted.alternative?.value).toBe(34);
    const chosen = chooseAlternative(conflicted, true);
    expect(chosen.value).toBe(34);
    expect(chosen.provenance).toBe("worker_stated");
  });
});

describe("stale results and approvals", () => {
  it("makes check and complaint approval stale after a fact edit", () => {
    let c = withCheck(confirmedCase("A"));
    c = withComplaint(c, { locale: "en", text: "draft", source: "template" });
    c = withComplaintApproved(c);
    expect(isComplaintApproved(c.complaint)).toBe(true);

    c = withFact(c, "incentive_credited", applyWorkerEdit(c.facts.incentive_credited, rupees(400)));
    expect(isCheckStale(c)).toBe(true);
    expect(isComplaintApproved(c.complaint)).toBe(false);
    expect(c.workflowStatus).toBe("draft");
    expect(() => withComplaintApproved(c)).toThrow();
  });

  it("withdraws approval when the complaint text changes", () => {
    let c = withCheck(confirmedCase("A"));
    c = withComplaint(c, { locale: "en", text: "draft", source: "template" });
    c = withComplaintApproved(c);
    c = withComplaintText(c, "draft edited");
    expect(isComplaintApproved(c.complaint)).toBe(false);
  });

  it("does not bump the revision when a value is re-confirmed unchanged", () => {
    const c = confirmedCase("A");
    const same = withFact(c, "qualifying_orders", c.facts.qualifying_orders!);
    expect(same.inputRevision).toBe(c.inputRevision);
  });
});

describe("period boundaries", () => {
  it("uses the market timezone for calendar dates", () => {
    // 20:00 UTC on 2 Oct is 01:30 on 3 Oct in India.
    expect(dateInZone(new Date("2026-10-02T20:00:00Z"), "Asia/Kolkata")).toBe("2026-10-03");
    expect(dateInZone(new Date("2026-10-02T18:00:00Z"), "Asia/Kolkata")).toBe("2026-10-02");
  });
});
