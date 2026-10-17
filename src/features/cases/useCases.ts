"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CaseRecord } from "@/domain/case";
import { ApiError } from "@/shared/errors";
import { caseClient } from "./client";

export function useCaseList() {
  const [cases, setCases] = useState<CaseRecord[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setCases(await caseClient.list());
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("internal", "failed", 0, true));
      setCases([]);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { cases, error, reload: load };
}

/**
 * Loads one case and runs mutations against it. A revision conflict reloads
 * the latest server copy instead of overwriting it.
 */
export function useCaseRecord(id: string) {
  const [data, setData] = useState<CaseRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const latest = useRef<CaseRecord | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await caseClient.get(id);
      latest.current = c;
      setData(c);
      if (!c) setError(new ApiError("not_found", "not found", 404));
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError("internal", "failed", 0, true));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const mutate = useCallback(
    async <R,>(
      label: string,
      fn: (c: CaseRecord) => Promise<R>,
      pick: (r: R) => CaseRecord = (r) => r as unknown as CaseRecord,
      opts: { rethrow?: boolean } = {},
    ): Promise<R | null> => {
      const current = latest.current;
      if (!current) return null;
      setBusy(label);
      setError(null);
      try {
        const r = await fn(current);
        const next = pick(r);
        latest.current = next;
        setData(next);
        return r;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError("internal", (e as Error).message, 0, true);
        setError(err);
        if (err.code === "revision_conflict") await load();
        if (opts.rethrow) {
          setError(null);
          throw err;
        }
        return null;
      } finally {
        setBusy(null);
      }
    },
    [load],
  );

  return { data, loading, error, busy, mutate, reload: load, setError };
}
