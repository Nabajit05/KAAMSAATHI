/**
 * Fictional sample documents for "Demo Delivery". These are not real platform
 * screens and must never be presented as current policy of any company.
 * The same lines are used to render the PNG samples (scripts/render-fixtures.ts)
 * and as the quoted excerpts in recorded extraction, so they cannot drift.
 * This file must stay import-free so the render script can load it directly.
 */

export interface SampleDoc {
  id: string;
  filename: string;
  title: string;
  /** Rows rendered top to bottom. "label: value" rows render as two columns. */
  rows: Array<{ text: string; strong?: boolean; muted?: boolean; cut?: boolean }>;
  /** Rows after this index are visually cut off (cropped screenshot). */
  croppedAfter?: number;
}

export const WATERMARK = "FICTIONAL DEMO DATA";

export const SAMPLE_DOCS: Record<string, SampleDoc> = {
  "a-offer": {
    id: "a-offer",
    filename: "demo-offer-3-oct.png",
    title: "Demo Delivery · Weekend offer",
    rows: [
      { text: "Offer ID: DD-OFF-7781", muted: true },
      { text: "Date: 3 Oct 2026", strong: true },
      { text: "Earn ₹600 extra", strong: true },
      { text: "Complete 30 orders" },
      { text: "Zone: Sector 18 · Shift: 11:00–23:00" },
      { text: "Only completed orders in this zone and shift count." },
      { text: "No other conditions apply to this offer." },
      { text: "Paid with the weekly settlement.", muted: true },
    ],
  },
  "a-activity": {
    id: "a-activity",
    filename: "demo-day-summary-3-oct.png",
    title: "Demo Delivery · Day summary",
    rows: [
      { text: "Date: 3 Oct 2026", strong: true },
      { text: "Zone: Sector 18 · Shift: 11:00–23:00" },
      { text: "Completed orders: 32", strong: true },
      { text: "Cancelled by customer: 1", muted: true },
      { text: "Incentive credited: ₹300", strong: true },
      { text: "Pending incentive: ₹0" },
      { text: "Adjustments: none", muted: true },
    ],
  },
  "b-activity": {
    id: "b-activity",
    filename: "demo-day-summary-3-oct-b.png",
    title: "Demo Delivery · Day summary",
    rows: [
      { text: "Date: 3 Oct 2026", strong: true },
      { text: "Zone: Sector 18 · Shift: 11:00–23:00" },
      { text: "Completed orders: 29", strong: true },
      { text: "Incentive credited: ₹0", strong: true },
      { text: "Pending incentive: ₹0" },
      { text: "Adjustments: none", muted: true },
    ],
  },
  "c-offer": {
    id: "c-offer",
    filename: "demo-offer-cropped.png",
    title: "Demo Delivery · Weekend offer",
    rows: [
      { text: "Earn ₹600 extra", strong: true },
      { text: "Complete 30 orders" },
      { text: "Zone: Sector 18 · Shift: 11:00–23:00", cut: true },
      { text: "Only completed orders in this zone and shift count.", cut: true },
    ],
    croppedAfter: 1,
  },
  "c-activity": {
    id: "c-activity",
    filename: "demo-orders-cropped.png",
    title: "Demo Delivery · Orders",
    rows: [
      { text: "Completed orders: 32", strong: true },
      { text: "Incentive credited: ₹300", strong: true },
    ],
  },
  "d-settlement": {
    id: "d-settlement",
    filename: "demo-weekly-settlement.png",
    title: "Demo Delivery · Weekly settlement",
    rows: [
      { text: "Period: 28 Sep – 4 Oct 2026", strong: true },
      { text: "Order pay: ₹1,000" },
      { text: "Incentive earned: ₹200" },
      { text: "Cash collected from customers (COD): −₹300" },
      { text: "Advance recovery: −₹100" },
      { text: "Bank transfer: ₹800", strong: true },
      { text: "Status: Settled on 6 Oct 2026", muted: true },
    ],
  },
};
