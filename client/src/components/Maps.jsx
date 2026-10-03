import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { statusMeta } from "../utils/constants.js";
import { fmtTime, timeAgo } from "../utils/format.js";

/**
 * Free maps: Leaflet + OpenStreetMap tiles. No API key, no billing.
 * For heavy production traffic, point VITE_MAP_TILE_URL at a tile provider you control
 * (self-hosted tiles, MapTiler/Stadia free tier, etc.) to respect OSM's tile usage policy.
 */
const TILE_URL =
  import.meta.env.VITE_MAP_TILE_URL ||
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTR =
  import.meta.env.VITE_MAP_TILE_ATTRIBUTION ||
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const DEFAULT_CENTER = [12.9716, 77.5946];
const STATUS_COLORS = {
  OPEN: "#0ea5e9",
  FOLLOW_UP: "#f59e0b",
  DEAL_DONE: "#10b981",
  LEAVE_OUT: "#f43f5e",
};

/** Kept for compatibility with App.jsx – Leaflet needs no provider/key. */
export function MapsProvider({ children }) {
  return children;
}

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** Round coloured pin with a label (no image assets needed) */
const pinIcon = (color, label = "", size = 28) =>
  L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;color:#fff;font:700 12px 'Plus Jakarta Sans',sans-serif">${esc(label)}</div>`,
  });

/** Name chip for live tracking */
const chipIcon = (name, active, ago, focused) =>
  L.divIcon({
    className: "",
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,-100%) ${focused ? "scale(1.12)" : ""};display:flex;flex-direction:column;align-items:center;white-space:nowrap">
      <div style="background:${active ? "#059669" : "#64748b"};color:#fff;padding:3px 10px;border-radius:9999px;border:2px solid #fff;box-shadow:0 3px 8px rgba(0,0,0,.3);font:700 12px 'Plus Jakarta Sans',sans-serif">${esc(name)}</div>
      <div style="width:2px;height:8px;background:${active ? "#059669" : "#64748b"}"></div>
      <div style="width:10px;height:10px;border-radius:9999px;background:${active ? "#059669" : "#64748b"};border:2px solid #fff"></div>
      <div style="font:600 10px sans-serif;color:#334155;text-shadow:0 0 3px #fff">${esc(ago)}</div>
    </div>`,
  });

function FitBounds({ points, single = 15 }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) map.setView(points[0], single);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/** Fix grey tiles when a map is mounted inside a modal that animates in */
function InvalidateOnMount() {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 250);
    return () => clearTimeout(t);
  }, [map]);
  return null;
}

function BaseMap({ center, zoom = 13, height, children, interactive = true }) {
  return (
    <div style={{ height }} className="relative z-0 overflow-hidden rounded-xl">
      <MapContainer
        center={center || DEFAULT_CENTER}
        zoom={zoom}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={interactive}
        dragging={interactive}
        zoomControl={interactive}
        attributionControl
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTR} maxZoom={19} />
        <InvalidateOnMount />
        {children}
      </MapContainer>
    </div>
  );
}

/** Day route: start → GPS trail + client visits → end */
export function RouteMap({ shift, pings = [], visits = [], height = 420 }) {
  const start =
    shift?.startLat != null ? [shift.startLat, shift.startLng] : null;
  const end = shift?.endLat != null ? [shift.endLat, shift.endLng] : null;
  const visitPts = visits.filter((v) => v.lat != null && v.lng != null);

  const path = useMemo(() => {
    const p = pings.map((x) => [x.lat, x.lng]);
    if (start && !p.length) p.push(start);
    if (end) p.push(end);
    return p;
  }, [pings, start?.[0], end?.[0]]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = [
    ...(start ? [start] : []),
    ...visitPts.map((v) => [v.lat, v.lng]),
    ...(end ? [end] : []),
    ...path,
  ];

  return (
    <BaseMap center={all[0]} height={height}>
      <FitBounds points={all} />
      {path.length > 1 && (
        <Polyline
          positions={path}
          pathOptions={{ color: "#4f46e5", weight: 4, opacity: 0.85 }}
        />
      )}
      {start && (
        <Marker position={start} icon={pinIcon("#10b981", "S")}>
          <Popup>
            <b>Day start</b>
            <br />
            {fmtTime(shift.startTime)} · {shift.startKm} KM
            {shift.startAddress && (
              <>
                <br />
                <span style={{ color: "#64748b" }}>{shift.startAddress}</span>
              </>
            )}
          </Popup>
        </Marker>
      )}
      {visitPts.map((v, i) => (
        <Marker
          key={v.id}
          position={[v.lat, v.lng]}
          icon={pinIcon(STATUS_COLORS[v.status] || "#4f46e5", i + 1)}
        >
          <Popup>
            <b>{v.companyName}</b>
            <br />
            <span style={{ color: "#64748b" }}>{v.address}</span>
            <br />
            {statusMeta(v.status).label} · {fmtTime(v.visitedAt)}
            {v.odometerKm != null && (
              <>
                <br />
                Odometer: {v.odometerKm} KM
              </>
            )}
          </Popup>
        </Marker>
      ))}
      {end && (
        <Marker position={end} icon={pinIcon("#e11d48", "E")}>
          <Popup>
            <b>Day end</b>
            <br />
            {fmtTime(shift.endTime)} · {shift.endKm} KM
            {shift.endAddress && (
              <>
                <br />
                <span style={{ color: "#64748b" }}>{shift.endAddress}</span>
              </>
            )}
          </Popup>
        </Marker>
      )}
    </BaseMap>
  );
}

/** Live positions of field visitors */
export function LiveMap({ reps = [], height = 520, focusId, onSelect }) {
  const located = reps.filter((r) => r.last);
  const pts = located.map((r) => [r.last.lat, r.last.lng]);
  const focus = located.find((r) => r.shiftId === focusId);

  return (
    <BaseMap center={pts[0]} zoom={12} height={height}>
      <FitBounds
        points={focus ? [[focus.last.lat, focus.last.lng]] : pts}
        single={focus ? 16 : 14}
      />
      {located.map((r) => (
        <Marker
          key={r.shiftId}
          position={[r.last.lat, r.last.lng]}
          icon={chipIcon(
            r.user.name.split(" ")[0],
            r.status === "ACTIVE",
            timeAgo(r.last.recordedAt),
            focusId === r.shiftId,
          )}
          eventHandlers={{ click: () => onSelect?.(r.shiftId) }}
          zIndexOffset={focusId === r.shiftId ? 1000 : 0}
        >
          <Popup>
            <b>{r.user.name}</b>
            <br />
            {r.status === "ACTIVE"
              ? `On field since ${fmtTime(r.startTime)}`
              : `Shift ended ${fmtTime(r.endTime)}`}
            <br />
            {r.visits} visits · last seen {timeAgo(r.last.recordedAt)}
          </Popup>
        </Marker>
      ))}
    </BaseMap>
  );
}

/** Small map preview for a single point */
export function PointMap({ lat, lng, height = 180 }) {
  if (lat == null || lng == null) return null;
  return (
    <BaseMap center={[lat, lng]} zoom={16} height={height}>
      <FitBounds points={[[lat, lng]]} single={16} />
      <Marker position={[lat, lng]} icon={pinIcon("#4f46e5", "")} />
    </BaseMap>
  );
}

/** Places database on a map – green = visited, amber = not visited yet */
export function PlacesMap({ places = [], height = 520, onSelect, me }) {
  const pts = places.filter((p) => p.lat != null && p.lng != null);
  const all = [
    ...pts.map((p) => [p.lat, p.lng]),
    ...(me ? [[me.lat, me.lng]] : []),
  ];
  return (
    <BaseMap center={all[0]} zoom={14} height={height}>
      <FitBounds points={all} single={15} />
      {me && (
        <Marker
          position={[me.lat, me.lng]}
          icon={pinIcon("#4f46e5", "●", 22)}
          zIndexOffset={1000}
        />
      )}
      {pts.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={pinIcon(
            p.visit ? "#10b981" : "#f59e0b",
            p.visit ? "✓" : "",
            24,
          )}
          eventHandlers={{ click: () => onSelect?.(p) }}
        >
          <Popup>
            <b>{p.name}</b>
            <br />
            {[p.category?.name, p.area].filter(Boolean).join(" · ")}
            <br />
            {p.visit ? `Visited · ${p.visit.lastBy || ""}` : "Not visited yet"}
          </Popup>
        </Marker>
      ))}
    </BaseMap>
  );
}
