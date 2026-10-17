import { newCase, type CaseRecord, type EvidenceItem, type IssueType, type WorkType } from "@/domain/case";
import type { Fact, FactSet, FactValue, Provenance, ReviewState } from "@/domain/facts";
import { rupees } from "@/domain/money";
import { SAMPLE_DOCS } from "./documents";

/**
 * Fictional fixtures (brief section 14). Every view built from these is
 * labelled "Fictional demo data". The extracted facts below are a recorded
 * result, shown as "Recorded demo result" unless a live extraction ran.
 */

export type FixtureId = "A" | "B" | "C" | "D" | "E";

function fact(
  value: FactValue,
  docId: string | null,
  excerpt: string | null,
  opts: { state?: ReviewState; provenance?: Provenance } = {},
): Fact {
  return {
    value,
    provenance: opts.provenance ?? (docId ? "record" : "worker_entered"),
    reviewState: opts.state ?? "unreviewed",
    sourceDocumentId: docId,
    sourceExcerpt: excerpt,
    rawText: excerpt,
    unknownReason: null,
    alternative: null,
  };
}

function unreadable(docId: string, reason: string): Fact {
  return { ...fact(null, docId, null, { state: "unreadable" }), unknownReason: reason };
}

function sampleEvidence(docId: string): EvidenceItem {
  const d = SAMPLE_DOCS[docId];
  return {
    id: d.id,
    kind: "sample",
    filename: d.filename,
    mime: "image/png",
    byteSize: null,
    sha256: null,
    status: "read",
    workerRedacted: false,
    metadataNote: null,
    createdAt: "2026-10-03T18:30:00.000Z",
  };
}

const OFFER_FACTS: FactSet = {
  offer_date: fact("2026-10-03", "a-offer", "Date: 3 Oct 2026"),
  offer_threshold_orders: fact(30, "a-offer", "Complete 30 orders"),
  offer_amount: fact(rupees(600), "a-offer", "Earn ₹600 extra"),
  offer_conditions_visible: fact("met", "a-offer", "No other conditions apply to this offer."),
  condition_zone_shift: fact("met", "a-activity", "Zone: Sector 18 · Shift: 11:00–23:00"),
};

export interface Fixture {
  id: FixtureId;
  workType: WorkType;
  issueType: IssueType;
  platformLabel: string | null;
  periodStart: string;
  periodEnd: string;
  docIds: string[];
  facts: FactSet;
  /** What the worker might say, for the intake step. */
  descriptionEn: string;
  descriptionHi: string;
}

export const FIXTURES: Record<FixtureId, Fixture> = {
  A: {
    id: "A",
    workType: "platform",
    issueType: "missing_incentive",
    platformLabel: "Demo Delivery",
    periodStart: "2026-10-03",
    periodEnd: "2026-10-03",
    docIds: ["a-offer", "a-activity"],
    descriptionEn: "I completed 32 orders on 3 October for the ₹600 offer, but only ₹300 incentive came.",
    descriptionHi: "मैंने 3 अक्टूबर को ₹600 वाले ऑफ़र के लिए 32 ऑर्डर पूरे किए, लेकिन सिर्फ़ ₹300 इंसेंटिव आया।",
    facts: {
      ...OFFER_FACTS,
      activity_date: fact("2026-10-03", "a-activity", "Date: 3 Oct 2026"),
      qualifying_orders: fact(32, "a-activity", "Completed orders: 32"),
      incentive_credited: fact(rupees(300), "a-activity", "Incentive credited: ₹300"),
      incentive_pending: fact(0, "a-activity", "Pending incentive: ₹0"),
    },
  },
  B: {
    id: "B",
    workType: "platform",
    issueType: "missing_incentive",
    platformLabel: "Demo Delivery",
    periodStart: "2026-10-03",
    periodEnd: "2026-10-03",
    docIds: ["a-offer", "b-activity"],
    descriptionEn: "I did many orders on 3 October but got no incentive.",
    descriptionHi: "मैंने 3 अक्टूबर को बहुत ऑर्डर किए लेकिन कोई इंसेंटिव नहीं मिला।",
    facts: {
      ...OFFER_FACTS,
      condition_zone_shift: fact("met", "b-activity", "Zone: Sector 18 · Shift: 11:00–23:00"),
      activity_date: fact("2026-10-03", "b-activity", "Date: 3 Oct 2026"),
      qualifying_orders: fact(29, "b-activity", "Completed orders: 29"),
      incentive_credited: fact(0, "b-activity", "Incentive credited: ₹0"),
      incentive_pending: fact(0, "b-activity", "Pending incentive: ₹0"),
    },
  },
  C: {
    id: "C",
    workType: "platform",
    issueType: "missing_incentive",
    platformLabel: "Demo Delivery",
    periodStart: "2026-10-03",
    periodEnd: "2026-10-03",
    docIds: ["c-offer", "c-activity"],
    descriptionEn: "The offer said ₹600 for 30 orders. I did 32 but got ₹300.",
    descriptionHi: "ऑफ़र में 30 ऑर्डर पर ₹600 लिखा था। मैंने 32 किए लेकिन ₹300 मिले।",
    facts: {
      offer_threshold_orders: fact(30, "c-offer", "Complete 30 orders"),
      offer_amount: fact(rupees(600), "c-offer", "Earn ₹600 extra"),
      offer_date: unreadable("c-offer", "The date is not visible in this screenshot."),
      offer_conditions_visible: fact("not_met", "c-offer", "Screenshot is cut off below “Complete 30 orders”."),
      condition_zone_shift: unreadable("c-offer", "The zone and shift line is cut off."),
      activity_date: unreadable("c-activity", "The orders screenshot does not show a date."),
      qualifying_orders: fact(32, "c-activity", "Completed orders: 32"),
      incentive_credited: fact(rupees(300), "c-activity", "Incentive credited: ₹300"),
      incentive_pending: unreadable("c-activity", "Pending incentive is not shown."),
    },
  },
  D: {
    id: "D",
    workType: "platform",
    issueType: "payout_mismatch",
    platformLabel: "Demo Delivery",
    periodStart: "2026-09-28",
    periodEnd: "2026-10-04",
    docIds: ["d-settlement"],
    descriptionEn: "I earned ₹1,200 this week but only ₹800 came to my bank.",
    descriptionHi: "इस हफ़्ते मेरी कमाई ₹1,200 थी लेकिन बैंक में सिर्फ़ ₹800 आए।",
    facts: {
      base_earnings: fact(rupees(1000), "d-settlement", "Order pay: ₹1,000"),
      incentive_earned: fact(rupees(200), "d-settlement", "Incentive earned: ₹200"),
      cash_retained: fact(rupees(300), "d-settlement", "Cash collected from customers (COD): −₹300"),
      advance_offset: fact(rupees(100), "d-settlement", "Advance recovery: −₹100"),
      bank_settlement: fact(rupees(800), "d-settlement", "Bank transfer: ₹800"),
      settlement_status: fact("settled", "d-settlement", "Status: Settled on 6 Oct 2026"),
      fuel_expense: fact(rupees(150), null, null, { provenance: "worker_entered" }),
    },
  },
  E: {
    id: "E",
    workType: "daily_wage",
    issueType: "wage_due",
    platformLabel: null,
    periodStart: "2026-09-21",
    periodEnd: "2026-09-30",
    docIds: [],
    descriptionEn: "I worked 8 days for the contractor at ₹700 a day. He paid ₹2,000 only.",
    descriptionHi: "मैंने ठेकेदार के लिए ₹700 रोज़ पर 8 दिन काम किया। उन्होंने सिर्फ़ ₹2,000 दिए।",
    facts: {
      agreed_daily_rate: fact(rupees(700), null, null, { provenance: "worker_entered" }),
      full_days_confirmed: fact(8, null, null, { provenance: "worker_entered" }),
      half_days_confirmed: fact(0, null, null, { provenance: "worker_entered" }),
      payments_received: fact(rupees(2000), null, null, { provenance: "worker_entered" }),
      advances_received: fact(0, null, null, { provenance: "worker_entered" }),
    },
  },
};

export function fixtureCase(id: FixtureId, locale: "en" | "hi", now = new Date()): CaseRecord {
  const fx = FIXTURES[id];
  return newCase(
    {
      mode: "demo",
      fixtureId: id,
      workType: fx.workType,
      issueType: fx.issueType,
      platformLabel: fx.platformLabel,
      periodStart: fx.periodStart,
      periodEnd: fx.periodEnd,
      description: locale === "hi" ? fx.descriptionHi : fx.descriptionEn,
      descriptionSource: "typed",
      evidence: fx.docIds.map(sampleEvidence),
      facts: structuredClone(fx.facts),
    },
    now,
  );
}

export function sampleDocUrl(docId: string): string | null {
  const d = SAMPLE_DOCS[docId];
  return d ? `/demo/${d.filename}` : null;
}
