
i-made-a-website-a-while
outputs
longer-days-fixed
app.js
console.log("Longer Days app loaded");

const { DateTime } = luxon;

const BASELINE_DATE = "2025-12-21";
const DEFAULT_COORDS = { lat: 51.5074, lng: -0.1278 };
const DISPLAY_ZONE = "Europe/London";

let state = {
  lat: DEFAULT_COORDS.lat,
  lng: DEFAULT_COORDS.lng,
  chart: null,
};

// ---------- helpers ----------
function setText(id, text) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`Missing element with id="${id}"`);
    return;
  }
  el.textContent = text;
}

function formatTime(dt) {
  return dt.toFormat("HH:mm");
}

function minutesSinceMidnight(dt) {
  return dt.hour * 60 + dt.minute + dt.second / 60;
}

function minutesLaterByClock(sunsetDt, baselineSunsetDt) {
  return Math.round(
    minutesSinceMidnight(sunsetDt) - minutesSinceMidnight(baselineSunsetDt)
  );
}

function daysBetween(dateA, dateB) {
  const a = DateTime.fromISO(dateA, { zone: "utc" }).startOf("day");
  const b = DateTime.fromISO(dateB, { zone: "utc" }).startOf("day");
  return Math.max(0, Math.round(b.diff(a, "days").days));
}

function dateRange(startISO, endISO) {
  const start = DateTime.fromISO(startISO, { zone: "utc" }).startOf("day");
  const end = DateTime.fromISO(endISO, { zone: "utc" }).startOf("day");
  const out = [];

  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    out.push(d.toISODate());
  }

  return out;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeHours(value) {
  return ((value % 24) + 24) % 24;
}

function sinDeg(value) {
  return Math.sin((value * Math.PI) / 180);
}

function cosDeg(value) {
  return Math.cos((value * Math.PI) / 180);
}

function tanDeg(value) {
  return Math.tan((value * Math.PI) / 180);
}

function acosDeg(value) {
  return (Math.acos(value) * 180) / Math.PI;
}

function atanDeg(value) {
  return (Math.atan(value) * 180) / Math.PI;
}

// ---------- solar calculation ----------
function calculateSunset(dateISO, lat, lng) {
  const date = DateTime.fromISO(dateISO, { zone: "utc" });
  const dayOfYear = date.ordinal;
  const longitudeHour = lng / 15;
  const approximateTime = dayOfYear + (18 - longitudeHour) / 24;

  const meanAnomaly = 0.9856 * approximateTime - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly +
      1.916 * sinDeg(meanAnomaly) +
      0.02 * sinDeg(2 * meanAnomaly) +
      282.634
  );

  let rightAscension = normalizeDegrees(atanDeg(0.91764 * tanDeg(trueLongitude)));
