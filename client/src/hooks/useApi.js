import { useCallback, useEffect, useRef, useState } from "react";
import { api, errMsg } from "../api/client.js";

/** GET helper with params, loading/error state and refetch */
export function useApi(url, params, { enabled = true, interval } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const key = JSON.stringify(params || {});
  const reqId = useRef(0);

  const fetcher = useCallback(
    async (silent = false) => {
      if (!enabled || !url) return;
      const id = ++reqId.current;
      if (!silent) setLoading(true);
      try {
        const r = await api.get(url, { params: JSON.parse(key) });
        if (id === reqId.current) {
          setData(r.data);
          setError(null);
        }
      } catch (e) {
        if (id === reqId.current) setError(errMsg(e));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [url, key, enabled],
  );

  useEffect(() => {
    fetcher();
  }, [fetcher]);

  useEffect(() => {
    if (!interval) return;
    const t = setInterval(() => fetcher(true), interval);
    return () => clearInterval(t);
  }, [fetcher, interval]);

  return { data, loading, error, refetch: fetcher, setData };
}

export function useDebounced(value, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
