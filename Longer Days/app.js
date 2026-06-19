console.log("Longer Days app loaded");

const BASELINE_DATE = "2025-12-21";
const DEFAULT_COORDS = { lat: 51.5074, lng: -0.1278 };
const DISPLAY_ZONE = "Europe/London";

let state = {
  lat: DEFAULT_COORDS.lat,
  lng: DEFAULT_COORDS.lng,
};

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function isoDateInZone(date = new Date(), zone = DISPLAY_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function utcDateFromISO(dateISO) {
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dayOfYear(date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.floor((date - start) / 86400000) + 1;
}

function addDaysISO(dateISO, days) {
  const date = utcDateFromISO(dateISO);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(startISO, endISO) {
  return Math.max(0, Math.round((utcDateFromISO(endISO) - utcDateFromISO(startISO)) / 86400000));
}

function dateRange(startISO, endISO) {
  const total = daysBetween(startISO, endISO);
  const out = [];
  for (let i = 0; i <= total; i += 1) out.push(addDaysISO(startISO, i));
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

function getTimeZoneOffsetMinutes(date, zone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  }).formatToParts(date);
  const timeZoneName = parts.find((part) => part.type === "timeZoneName")?.value || "GMT";
  const match = timeZoneName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function calculateSunsetMinutesUTC(dateISO, lat, lng) {
  const date = utcDateFromISO(dateISO);
  const longitudeHour = lng / 15;
  const approximateTime = dayOfYear(date) + (18 - longitudeHour) / 24;

  const meanAnomaly = 0.9856 * approximateTime - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly +
      1.916 * sinDeg(meanAnomaly) +
      0.02 * sinDeg(2 * meanAnomaly) +
      282.634
  );

  let rightAscension = normalizeDegrees(atanDeg(0.91764 * tanDeg(trueLongitude)));
  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

  const sinDeclination = 0.39782 * sinDeg(trueLongitude);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const zenith = 90.833;
  const cosHourAngle =
    (cosDeg(zenith) - sinDeclination * sinDeg(lat)) /
    (cosDeclination * cosDeg(lat));

  if (cosHourAngle > 1) throw new Error("The sun does not rise at this location on this date.");
  if (cosHourAngle < -1) throw new Error("The sun does not set at this location on this date.");

  const hourAngle = acosDeg(cosHourAngle) / 15;
  const localMeanTime = hourAngle + rightAscension - 0.06571 * approximateTime - 6.622;
  return Math.round(normalizeHours(localMeanTime - longitudeHour) * 60);
}

function calculateSunset(dateISO, lat, lng) {
  const utcMinutes = calculateSunsetMinutesUTC(dateISO, lat, lng);
  const utcDate = utcDateFromISO(dateISO);
  const instant = new Date(utcDate.getTime() + utcMinutes * 60000);
  const localMinutes = normalizeHours((utcMinutes + getTimeZoneOffsetMinutes(instant, DISPLAY_ZONE)) / 60) * 60;

  return {
    iso: dateISO,
    utcMinutes,
    localMinutes: Math.round(localMinutes),
    label: formatMinutesAsTime(Math.round(localMinutes)),
  };
}

function formatMinutesAsTime(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function minutesLaterByClock(sunset, baselineSunset) {
  return Math.round(sunset.localMinutes - baselineSunset.localMinutes);
}

function drawChart(labels, values) {
  const canvas = document.getElementById("chart");
  if (!canvas) return;

  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round((rect.height || 120) * scale));

  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height || 120);

  const width = rect.width;
  const height = rect.height || 120;
  const pad = { top: 12, right: 12, bottom: 22, left: 34 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const xFor = (index) => pad.left + (index / Math.max(1, values.length - 1)) * (width - pad.left - pad.right);
  const yFor = (value) => height - pad.bottom - ((value - min) / span) * (height - pad.top - pad.bottom);

  ctx.strokeStyle = "rgba(31,41,51,0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = pad.top + (i / 3) * (height - pad.top - pad.bottom);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  const fill = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  fill.addColorStop(0, "rgba(145,90,50,0.16)");
  fill.addColorStop(1, "rgba(145,90,50,0)");

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(values.length - 1), height - pad.bottom);
  ctx.lineTo(xFor(0), height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  const line = ctx.createLinearGradient(pad.left, 0, width - pad.right, 0);
  line.addColorStop(0, "rgba(145,90,50,0.95)");
  line.addColorStop(0.55, "rgba(210,125,75,0.9)");
  line.addColorStop(1, "rgba(90,140,125,0.85)");

  ctx.beginPath();
  values.forEach((value, index) => {
    const x = xFor(index);
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = line;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = "rgba(31,41,51,0.55)";
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(String(Math.round(max)), 4, yFor(max) + 4);
  ctx.fillText(String(Math.round(min)), 4, yFor(min) + 4);
}

function render() {
  const todayISO = isoDateInZone();
  const labels = dateRange(BASELINE_DATE, todayISO);
  const baselineSunset = calculateSunset(BASELINE_DATE, state.lat, state.lng);
  const values = labels.map((dateISO) => {
    const sunset = calculateSunset(dateISO, state.lat, state.lng);
    return minutesLaterByClock(sunset, baselineSunset);
  });

  const todayMinutes = values[values.length - 1];
  const yesterdayMinutes = values.length > 1 ? values[values.length - 2] : 0;
  const gainedSinceYesterday = todayMinutes - yesterdayMinutes;
  const todaySunset = calculateSunset(todayISO, state.lat, state.lng);

  document.getElementById("headline").innerHTML =
    `Today sunset is <span class="highlight">${todayMinutes} minutes later</span> than on the shortest day.`;

  setText("baselineSunset", baselineSunset.label);
  setText("todaySunset", todaySunset.label);
  setText("metaLine", `Location: ${state.lat.toFixed(4)}, ${state.lng.toFixed(4)} · London time`);
  setText("dailyLine", `Since yesterday: ${gainedSinceYesterday >= 0 ? "+" : ""}${gainedSinceYesterday} min`);

  const totalDays = daysBetween(BASELINE_DATE, todayISO);
  const avg = totalDays > 0 ? todayMinutes / totalDays : 0;
  setText("avgGain", `${avg.toFixed(2)} min/day`);
  setText("rangeLine", `${labels[0]} to ${labels[labels.length - 1]} (${labels.length} days)`);

  drawChart(labels, values);
}

function wireUI() {
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");

  latEl.value = state.lat;
  lngEl.value = state.lng;

  document.getElementById("applyCoords").addEventListener("click", () => {
    const lat = Number(latEl.value);
    const lng = Number(lngEl.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Enter valid lat/lng (example: 51.5074 and -0.1278).");
      return;
    }

    state.lat = lat;
    state.lng = lng;
    safeRender();
  });

  document.getElementById("useGeoBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        latEl.value = state.lat.toFixed(4);
        lngEl.value = state.lng.toFixed(4);
        safeRender();
      },
      () => alert("Couldn't get location permission. You can type lat/lng instead.")
    );
  });

  window.addEventListener("resize", safeRender);
}

function safeRender() {
  try {
    setText("headline", "Loading...");
    render();
  } catch (err) {
    console.error(err);
    const msg = err && err.message ? err.message : "Unknown error";
    setText("headline", `Couldn't calculate sunset data: ${msg}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  safeRender();
});
