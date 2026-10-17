"use client";

import { readStored, writeStored, removeStored } from "@/lib/devicePrefs";
import { api } from "@/features/cases/client";
import type { EarningsEntry, EarningsEntryInput } from "@/shared/contracts";
import { ApiError } from "@/shared/errors";

/**
 * Earnings sync. Each entry has a client-generated id; the server upserts on
 * it, so retries after a timeout, a reconnect or a second tab never create
 * duplicates. Entries wait in a local queue only with explicit device consent;
 * otherwise they live in memory for this visit.
 */

export type SyncState = "saved" | "device" | "waiting" | "syncing" | "failed";
export type LocalEntry = EarningsEntryInput & { createdAt: string; state: SyncState; id?: string };

const QUEUE_KEY = "earnings_queue";
const DEVICE_KEY = "earnings_device";
const CONSENT_KEY = "earnings_device_consent";

let memoryQueue: LocalEntry[] = [];
let memoryDevice: LocalEntry[] = [];

export function deviceConsent(): boolean {
  return readStored<boolean>(CONSENT_KEY) === true;
}

export function setDeviceConsent(v: boolean) {
  if (v) writeStored(CONSENT_KEY, true, 30);
  else {
    removeStored(CONSENT_KEY);
    removeStored(QUEUE_KEY);
    removeStored(DEVICE_KEY);
  }
}

export function readQueue(): LocalEntry[] {
  return deviceConsent() ? readStored<LocalEntry[]>(QUEUE_KEY) ?? [] : memoryQueue;
}

function writeQueue(q: LocalEntry[]) {
  memoryQueue = q;
  if (deviceConsent()) writeStored(QUEUE_KEY, q, 7);
}

/** Device-only entries for people who are not signed in. */
export function readDeviceEntries(): LocalEntry[] {
  return deviceConsent() ? readStored<LocalEntry[]>(DEVICE_KEY) ?? [] : memoryDevice;
}

export function saveDeviceEntry(e: LocalEntry) {
  const all = [e, ...readDeviceEntries().filter((x) => x.clientId !== e.clientId)];
  memoryDevice = all;
  if (deviceConsent()) writeStored(DEVICE_KEY, all, 30);
}

export function removeDeviceEntry(clientId: string) {
  const all = readDeviceEntries().filter((x) => x.clientId !== clientId);
  memoryDevice = all;
  if (deviceConsent()) writeStored(DEVICE_KEY, all, 30);
}

export function enqueue(e: LocalEntry) {
  writeQueue([...readQueue().filter((x) => x.clientId !== e.clientId), { ...e, state: "waiting" }]);
}

export async function fetchEntries(): Promise<EarningsEntry[]> {
  return (await api<{ entries: EarningsEntry[] }>("/api/earnings")).entries;
}

export async function pushEntry(e: EarningsEntryInput): Promise<EarningsEntry> {
  return (await api<{ entry: EarningsEntry }>("/api/earnings", { method: "POST", json: e, timeoutMs: 15_000 })).entry;
}

function toInput(e: LocalEntry): EarningsEntryInput {
  const input: Partial<LocalEntry> = { ...e };
  delete input.state;
  delete input.createdAt;
  delete input.id;
  return input as EarningsEntryInput;
}

/** Sends queued entries; keeps the ones that fail with a retryable error. */
export async function flushQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = readQueue();
  const remaining: LocalEntry[] = [];
  let sent = 0;
  for (const e of queue) {
    try {
      await pushEntry(toInput(e));
      sent++;
    } catch (err) {
      const retryable = !(err instanceof ApiError) || err.retryable || err.status === 0;
      if (retryable) remaining.push({ ...e, state: "waiting" });
      else remaining.push({ ...e, state: "failed" });
    }
  }
  writeQueue(remaining);
  return { sent, remaining: remaining.length };
}
