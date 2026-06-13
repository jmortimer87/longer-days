
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
