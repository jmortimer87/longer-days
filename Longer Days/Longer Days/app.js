console.log("✅ app.js loaded");

const { DateTime } = luxon;

const BASELINE_DATE = "2025-12-21";
const DEFAULT_COORDS = { lat: 51.5074, lng: -0.1278 }; // London fallback

let state = {
  lat: DEFAULT_COORDS.lat,
  lng: DEFAULT_COORDS.lng,
  ignoreDst: false, // fixed
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

function formatTime(dt, ignoreDst) {
  return dt.toFormat(ignoreDst ? "HH:mm 'UTC'" : "HH:mm");
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

// ---------- API ----------
async function fetchSunData(dateISO, lat, lng) {
  const url = new URL("https://api.sunrise-sunset.org/json");
  url.searchParams.set("lat", lat);
  url.searchParams.set("lng", lng);
  url.searchParams.set("date", dateISO);
  url.searchParams.set("formatted", "0");

  // timeout so we don’t sit on Loading… forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const json = await res.json();
    if (json.status !== "OK") throw new Error(`API status: ${json.status}`);
    return json.results;
  } catch (e) {
    if (e.name === "AbortError") throw new Error("API request timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function parseSunset(results, ignoreDst) {
  const sunsetUtc = DateTime.fromISO(results.sunset, { zone: "utc" });
  return ignoreDst ? sunsetUtc : sunsetUtc.setZone("Europe/London");
}

// ---------- chart ----------
function gradientLine(ctx) {
  const g = ctx.createLinearGradient(0, 0, ctx.canvas.width, 0);
  g.addColorStop(0, "rgba(120,160,255,0.95)");
  g.addColorStop(0.5, "rgba(255,120,220,0.90)");
  g.addColorStop(1, "rgba(120,255,210,0.85)");
  return g;
}

function gradientFill(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  g.addColorStop(0, "rgba(255,255,255,0.14)");
  g.addColorStop(1, "rgba(255,255,255,0.00)");
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
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { maxTicksLimit: 8, color: "rgba(255,255,255,0.55)" },
        },
        y: {
          grid: { color: "rgba(255,255,255,0.06)" },
          ticks: { color: "rgba(255,255,255,0.55)" },
        },
      },
    },
  });
}

// ---------- main render ----------
async function render() {
  const todayISO = DateTime.now().setZone("Europe/London").toISODate();
  const labels = dateRange(BASELINE_DATE, todayISO);

  const baselineResults = await fetchSunData(BASELINE_DATE, state.lat, state.lng);
  const baselineSunset = parseSunset(baselineResults, state.ignoreDst);

  const values = [];
  for (const d of labels) {
    const r = await fetchSunData(d, state.lat, state.lng);
    const sunset = parseSunset(r, state.ignoreDst);
    values.push(minutesLaterByClock(sunset, baselineSunset));
  }

  const todayMinutes = values[values.length - 1];
  const yesterdayMinutes = values.length > 1 ? values[values.length - 2] : 0;
  const gainedSinceYesterday = todayMinutes - yesterdayMinutes;

document.getElementById("headline").innerHTML =
  `Today sunset is <span class="highlight">${todayMinutes} minutes later</span> than on the shortest day.`;
  setText("baselineSunset", formatTime(baselineSunset, state.ignoreDst));

  const todaySunsetDt = parseSunset(
    await fetchSunData(todayISO, state.lat, state.lng),
    state.ignoreDst
  );
  setText("todaySunset", formatTime(todaySunsetDt, state.ignoreDst));

  setText(
    "metaLine",
    `Location: ${state.lat.toFixed(4)}, ${state.lng.toFixed(4)} • ` +
      `Local time`

  );

  setText(
    "dailyLine",
    `Since yesterday: ${gainedSinceYesterday >= 0 ? "+" : ""}${gainedSinceYesterday} min`
  );

  const totalDays = daysBetween(BASELINE_DATE, todayISO);
  const avg = totalDays > 0 ? todayMinutes / totalDays : 0;
  setText("avgGain", `${avg.toFixed(2)} min/day`);

  setText("rangeLine", `${labels[0]} → ${labels[labels.length - 1]} (${labels.length} days)`);

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
    if (!navigator.geolocation) return alert("Geolocation not supported in this browser.");
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
    setText("headline", "Loading… (fetching data)");
    await render();
  } catch (err) {
    console.error(err);
    const msg =
      err && err.message ? err.message : typeof err === "string" ? err : "Unknown error";
    setText("headline", `Couldn’t load data: ${msg}`);
  }
}

window.addEventListener("DOMContentLoaded", () => {
  wireUI();
  safeRender();
});

