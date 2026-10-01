import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client.js";

/**
 * Free reverse geocoding via OpenStreetMap Nominatim (no key). Results are cached per ~100 m.
 * Nominatim allows ~1 request/second – fine for shift start/end and visit tagging.
 * Set VITE_GEOCODE_URL to use a self-hosted Nominatim/Photon-compatible endpoint, or VITE_GEOCODE_URL=off to disable.
 */
const GEOCODE_URL =
  import.meta.env.VITE_GEOCODE_URL ||
  "https://nominatim.openstreetmap.org/reverse";
const geoCache = new Map();
export async function reverseGeocode(lat, lng) {
  if (GEOCODE_URL === "off") return "";
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(
      `${GEOCODE_URL}?format=jsonv2&zoom=18&addressdetails=0&lat=${lat}&lon=${lng}`,
      {
        signal: ctrl.signal,
        headers: { "Accept-Language": "en" },
      },
    );
    clearTimeout(t);
    if (!res.ok) return "";
    const data = await res.json();
    const address = data.display_name || "";
    geoCache.set(key, address);
    return address;
  } catch {
    return ""; // geocoding is optional – coordinates are still saved
  }
}

/** One-shot high accuracy location capture with free reverse geocoding */
export function useCurrentLocation() {
  const [state, setState] = useState({
    loading: false,
    coords: null,
    address: "",
    error: null,
  });

  const capture = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({
        ...s,
        error: "Location is not supported on this device",
      }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: Math.round(pos.coords.accuracy),
        };
        const address = await reverseGeocode(coords.lat, coords.lng);
        setState({ loading: false, coords, address, error: null });
      },
      (err) =>
        setState((s) => ({
          ...s,
          loading: false,
          error:
            err.code === 1
              ? "Location permission denied. Please allow location access in your browser."
              : "Unable to get your location. Move to open sky and retry.",
        })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 10000 },
    );
  }, []);

  return { ...state, capture };
}

const PING_MS =
  Math.max(15, Number(import.meta.env.VITE_GPS_PING_SECONDS || 60)) * 1000;
const QUEUE_KEY = "fsc_ping_queue";

/** Background GPS tracking while a shift is active. Buffers offline and flushes in batches. */
export function useGpsTracker(shiftId, active) {
  const lastSent = useRef(0);
  const [lastFix, setLastFix] = useState(null);

  useEffect(() => {
    if (!active || !shiftId || !("geolocation" in navigator)) return;
    const readQ = () => {
      try {
        return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      } catch {
        return [];
      }
    };
    const writeQ = (q) => {
      try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500)));
      } catch {
        /* ignore */
      }
    };
    const flush = async () => {
      const q = readQ().filter((p) => p.shiftId === shiftId);
      if (!q.length || !navigator.onLine) return;
      try {
        for (let i = 0; i < q.length; i += 100) {
          await api.post(`/shifts/${shiftId}/pings`, {
            points: q.slice(i, i + 100).map(({ shiftId: _s, ...p }) => p),
          });
        }
        writeQ([]);
      } catch {
        /* retry later */
      }
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        const fix = {
          lat: +pos.coords.latitude.toFixed(6),
          lng: +pos.coords.longitude.toFixed(6),
          accuracy: pos.coords.accuracy,
        };
        setLastFix({ ...fix, at: now });
        if (now - lastSent.current < PING_MS || pos.coords.accuracy > 200)
          return;
        lastSent.current = now;
        writeQ([
          ...readQ(),
          { ...fix, recordedAt: new Date(now).toISOString(), shiftId },
        ]);
        flush();
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 30000 },
    );
    window.addEventListener("online", flush);
    flush();
    return () => {
      navigator.geolocation.clearWatch(watchId);
      window.removeEventListener("online", flush);
    };
  }, [shiftId, active]);

  return lastFix;
}
