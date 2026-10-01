import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "../api/client.js";

/**
 * Categories, products and plans for dropdowns.
 * Active items are cached for the session and shared by every form; call `invalidateCatalog()` after edits.
 */
let cache = null;
let inflight = null;
const listeners = new Set();

export function invalidateCatalog() {
  cache = null;
  inflight = null;
  listeners.forEach((fn) => fn());
}

async function loadActive() {
  if (cache) return cache;
  inflight ||= api.get("/catalog").then((r) => (cache = r.data));
  return inflight;
}

export function useCatalog() {
  const [data, setData] = useState(
    cache || { categories: [], products: [], plans: [] },
  );
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState(null);
  const load = useCallback(() => {
    setLoading(true);
    loadActive()
      .then((d) => (setData(d), setError(null)))
      .catch((e) => {
        inflight = null;
        setError(errMsg(e));
      })
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
    listeners.add(load);
    return () => listeners.delete(load);
  }, [load]);
  return { ...data, loading, error, reload: load };
}
