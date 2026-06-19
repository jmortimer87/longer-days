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
  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

  const sinDeclination = 0.39782 * sinDeg(trueLongitude);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const zenith = 90.833;
  const cosHourAngle =
    (cosDeg(zenith) - sinDeclination * sinDeg(lat)) /
    (cosDeclination * cosDeg(lat));

  if (cosHourAngle > 1) {
    throw new Error("The sun does not rise at this location on this date.");
  }

  if (cosHourAngle < -1) {
    throw new Error("The sun does not set at this location on this date.");
  }

  const hourAngle = acosDeg(cosHourAngle) / 15;
  const localMeanTime =
    hourAngle + rightAscension - 0.06571 * approximateTime - 6.622;
  const universalTime = normalizeHours(localMeanTime - longitudeHour);

  return date
    .startOf("day")
    .plus({ minutes: Math.round(universalTime * 60) })
    .setZone(DISPLAY_ZONE);
}

// ---------- chart ----------
function gradientLine(ctx) {
  const g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  g.addColorStop(0, "rgba(145,90,50,0.95)");
  g.addColorStop(0.55, "rgba(210,125,75,0.9)");
  g.addColorStop(1, "rgba(90,140,125,0.85)");
  return g;
}

function gradientFill(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, "rgba(145,90,50,0.16)");
  g.addColorStop(1, "rgba(145,90,50,0)");
  return g;
}

function buildChart(labels, values) {
  const canvas = document.getElementById("chart");
  if (!canvas) throw new Error('Missing <canvas id="chart">');
  const ctx = canvas.getContext("2d");

  if (state.chart) state.chart.destroy();

  state.chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: values,
          borderWidth: 2,
          borderColor: gradientLine(ctx),
          backgroundColor: gradientFill(ctx),
          fill: true,
          tension: 0.25,
          pointRadius: 0,
          pointHitRadius: 10,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          callbacks: {
            label: (t) => `${t.parsed.y} min later`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(31,41,51,0.08)" },
          ticks: { maxTicksLimit: 8, color: "rgba(31,41,51,0.55)" },
        },
        y: {
          grid: { color: "rgba(31,41,51,0.08)" },
          ticks: { color: "rgba(31,41,51,0.55)" },
        },
      },
    },
  });
}

// ---------- main render ----------
async function render() {
  const todayISO = DateTime.now().setZone(DISPLAY_ZONE).toISODate();
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

  setText("baselineSunset", formatTime(baselineSunset));
  setText("todaySunset", formatTime(todaySunset));
  setText(
    "metaLine",
    `Location: ${state.lat.toFixed(4)}, ${state.lng.toFixed(4)} · London time`
  );
  setText(
    "dailyLine",
    `Since yesterday: ${gainedSinceYesterday >= 0 ? "+" : ""}${gainedSinceYesterday} min`
  );

  const totalDays = daysBetween(BASELINE_DATE, todayISO);
  const avg = totalDays > 0 ? todayMinutes / totalDays : 0;
  setText("avgGain", `${avg.toFixed(2)} min/day`);
  setText("rangeLine", `${labels[0]} to ${labels[labels.length - 1]} (${labels.length} days)`);

  buildChart(labels, values);
}

// ---------- UI ----------
function wireUI() {
  const latEl = document.getElementById("lat");
  const lngEl = document.getElementById("lng");

  latEl.value = state.lat;
  lngEl.value = state.lng;

  document.getElementById("applyCoords").addEventListener("click", async () => {
    const lat = Number(latEl.value);
    const lng = Number(lngEl.value);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      alert("Enter valid lat/lng (example: 51.5074 and -0.1278).");
      return;
    }

    state.lat = lat;
    state.lng = lng;
    await safeRender();
  });

  document.getElementById("useGeoBtn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported in this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        state.lat = pos.coords.latitude;
        state.lng = pos.coords.longitude;
        latEl.value = state.lat.toFixed(4);
        lngEl.value = state.lng.toFixed(4);
        await safeRender();
      },
      () => alert("Couldn’t get location permission. You can type lat/lng instead.")
    );
  });
}

async function safeRender() {
  try {
    setText("headline", "Loading…");
    await render();
  } catch (err) {
    console.error(err);
    const msg =
      err && err.message ? err.message : typeof err === "string" ? err : "Unknown error";
    setText("headline", `Couldn’t calculate sunset data: ${msg}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  safeRender();
});
