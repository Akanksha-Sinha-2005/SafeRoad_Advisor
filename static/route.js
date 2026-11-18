"use strict";

(function () {
  const form = document.getElementById("route-form");
  const sourceInput = document.getElementById("source-input");
  const destInput = document.getElementById("destination-input");
  const departInput = document.getElementById("depart-input");
  const swapBtn = document.getElementById("swap-btn");
  const submitBtn = document.getElementById("submit-btn");
  const datalist = document.getElementById("station-options");
  const statusBanner = document.getElementById("status-banner");
  const emptyState = document.getElementById("empty-state");
  const tableWrapper = document.getElementById("table-wrapper");
  const routesTbody = document.getElementById("routes-tbody");
  const historyTbody = document.getElementById("history-tbody");

  const map = L.map("route-map").setView([12.9716, 77.5946], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  const routeLayerGroup = L.layerGroup().addTo(map);
  const stationLayerGroup = L.layerGroup().addTo(map);

  function setStatus(message, type) {
    if (!message) {
      statusBanner.className = "rs-status hidden";
      statusBanner.textContent = "";
      return;
    }
    statusBanner.className = "rs-status " + (type || "loading");
    statusBanner.textContent = message;
  }

  async function loadStations() {
    try {
      const resp = await fetch("/api/stations", {
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!Array.isArray(data.stations)) return;

      datalist.innerHTML = "";
      data.stations.forEach(function (st) {
        const opt = document.createElement("option");
        opt.value = st.name;
        datalist.appendChild(opt);
      });

      if (data.stations.length > 0) {
        map.setView([data.stations[0].lat, data.stations[0].lon], 12);
      }
    } catch (err) {
      console.warn("Could not load autocomplete stations:", err);
    }
  }

  function getRouteColor(route) {
    if (route.recommended) return "#15803d";
    if (route.tag === "Fastest") return "#3b82f6";
    return "#eab308";
  }

  function renderMap(data) {
    routeLayerGroup.clearLayers();
    stationLayerGroup.clearLayers();

    const boundsPoints = [];
    const seenStations = {};

    // Draw non-recommended routes first so Recommended sits on top
    const ordered = data.routes.slice().sort(function (a, b) {
      return (a.recommended ? 1 : 0) - (b.recommended ? 1 : 0);
    });

    ordered.forEach(function (route) {
      const latLngs = (route.geometry.coordinates || []).map(function (c) {
        boundsPoints.push([c[1], c[0]]);
        return [c[1], c[0]];
      });

      const isHighCong = route.congestion_score >= 0.55;
      const isModCong = !isHighCong && route.congestion_score >= 0.30;
      const pulseClass = isHighCong
        ? "route-congestion-pulse-high"
        : isModCong
        ? "route-congestion-pulse-moderate"
        : "route-congestion-pulse-low";
      const pulseColor = isHighCong ? "#ef4444" : isModCong ? "#f59e0b" : "#22c55e";

      L.polyline(latLngs, {
        color: pulseColor,
        weight: route.recommended ? 14 : 10,
        opacity: 0.45,
        lineCap: "round",
        lineJoin: "round",
        className: pulseClass,
      }).addTo(routeLayerGroup);

      const color = getRouteColor(route);
      const poly = L.polyline(latLngs, {
        color: color,
        weight: route.recommended ? 6 : 5,
        opacity: route.recommended ? 0.98 : 0.85,
        dashArray: "2, 10",
        lineCap: "round",
      }).addTo(routeLayerGroup);

      poly.bindPopup(
        "<strong>" +
          route.tag +
          (route.recommended ? " (Recommended)" : "") +
          "</strong><br/>Distance: " +
          route.distance_km.toFixed(2) +
          " km | ETA: " +
          route.eta_minutes +
          " min<br/>Score: " +
          route.composite_score.toFixed(3) +
          "<br/>" +
          route.explanation
      );

      (route.nearby_stations || []).forEach(function (st) {
        seenStations[st.id] = st;
      });
    });

    // Source & Destination pins
    L.marker([data.source.lat, data.source.lon])
      .bindPopup("<strong>Source:</strong> " + data.source.label)
      .addTo(routeLayerGroup);

    L.marker([data.destination.lat, data.destination.lon])
      .bindPopup("<strong>Destination:</strong> " + data.destination.label)
      .addTo(routeLayerGroup);

    // Risk-coloured station markers (2023 dataset)
    Object.keys(seenStations).forEach(function (id) {
      const st = seenStations[id];
      const isHigh = st.is_high_risk || st.risk_score >= 0.60;
      const isModerate = !isHigh && st.risk_score >= 0.30;
      const fillColor = isHigh ? "#dc2626" : isModerate ? "#eab308" : "#4ade80";
      const riskLabel = isHigh ? "High Risk" : isModerate ? "Moderate Risk" : "Low Risk";
      const marker = L.circleMarker([st.lat, st.lon], {
        radius: isHigh ? 7 : 6,
        fillColor: fillColor,
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.9,
      }).addTo(stationLayerGroup);

      marker.bindPopup(
        "<strong>Station:</strong> " +
          st.name +
          (st.zone ? " (" + st.zone + " / " + st.sub_division + ")" : "") +
          "<br/><strong>2023 Total Cases:</strong> " +
          (st.total_cases_2023 || 0) +
          " (Fatal: " +
          (st.fatal_cases_2023 || 0) +
          ", Killed: " +
          (st.killed_2023 || 0) +
          ", Non-Fatal: " +
          (st.non_fatal_2023 || 0) +
          ", Injured: " +
          (st.injured_2023 || 0) +
          ")" +
          "<br/><strong>Accident Risk:</strong> " +
          (st.risk_score * 100).toFixed(0) +
          "% (" +
          (isHigh ? "High Risk" : "Moderate/Low") +
          ")<br/>Distance to route: " +
          st.distance_km.toFixed(2) +
          " km"
      );
    });

    if (boundsPoints.length > 1) {
      map.fitBounds(boundsPoints, { padding: [28, 28] });
    }
  }

  function renderTable(routes) {
    routesTbody.innerHTML = "";
    routes.forEach(function (r) {
      const tr = document.createElement("tr");
      if (r.recommended) {
        tr.className = "rs-row-recommended";
      }

      const tdTag = document.createElement("td");
      const tagSpan = document.createElement("span");
      tagSpan.className = "rs-tag-text";
      tagSpan.textContent = r.tag;
      tdTag.appendChild(tagSpan);

      if (r.recommended) {
        const recSpan = document.createElement("span");
        recSpan.className = "rs-rec-mark";
        recSpan.textContent = "Recommended";
        tdTag.appendChild(recSpan);
      }

      const tdDist = document.createElement("td");
      tdDist.className = "num";
      tdDist.textContent = r.distance_km.toFixed(2) + " km";

      const tdEta = document.createElement("td");
      tdEta.className = "num";
      tdEta.textContent = r.eta_minutes + " min";

      const tdCong = document.createElement("td");
      tdCong.className = "num";
      tdCong.textContent = r.congestion_score.toFixed(2);

      const tdRisk = document.createElement("td");
      tdRisk.className = "num";
      tdRisk.textContent = r.accident_risk.toFixed(2);

      const tdScore = document.createElement("td");
      tdScore.className = "num";
      tdScore.textContent = r.composite_score.toFixed(3);

      tr.title = r.explanation || "";
      tr.appendChild(tdTag);
      tr.appendChild(tdDist);
      tr.appendChild(tdEta);
      tr.appendChild(tdCong);
      tr.appendChild(tdRisk);
      tr.appendChild(tdScore);
      routesTbody.appendChild(tr);
    });

    emptyState.classList.add("hidden");
    tableWrapper.classList.remove("hidden");
  }

  function renderHistory(historyList) {
    if (!Array.isArray(historyList) || historyList.length === 0) return;
    historyTbody.innerHTML = "";
    historyList.forEach(function (item) {
      const tr = document.createElement("tr");

      const tdTime = document.createElement("td");
      tdTime.className = "mono";
      tdTime.textContent = item.timestamp;

      const tdSrc = document.createElement("td");
      tdSrc.textContent = item.source;

      const tdDst = document.createElement("td");
      tdDst.textContent = item.destination;

      const tdChosen = document.createElement("td");
      tdChosen.textContent = item.chosen_route;

      tr.appendChild(tdTime);
      tr.appendChild(tdSrc);
      tr.appendChild(tdDst);
      tr.appendChild(tdChosen);
      historyTbody.appendChild(tr);
    });
  }

  const voiceSourceBtn = document.getElementById("voice-source-btn");
  const voiceDestBtn = document.getElementById("voice-dest-btn");

  function startVoiceRecognition(targetInput, label) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setStatus("SpeechRecognition is not supported in this browser.", "error");
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = "en-IN";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onstart = function () {
        setStatus("Listening for " + label + "... Speak a location or say 'From X to Y'.", "loading");
      };
      rec.onresult = function (evt) {
        const transcript = (evt.results && evt.results[0] && evt.results[0][0] ? evt.results[0][0].transcript : "")
          .replace(/[.?!,;]+$/g, "")
          .trim();
        if (!transcript) return;
        const fromTo = transcript.match(/^(?:from\s+)?(.+?)\s+to\s+(.+)$/i);
        if (fromTo && fromTo[1] && fromTo[2]) {
          sourceInput.value = fromTo[1].trim();
          destInput.value = fromTo[2].trim();
          setStatus("Voice set: " + sourceInput.value + " -> " + destInput.value, "loading");
          form.requestSubmit();
          return;
        }
        targetInput.value = transcript;
        setStatus("Voice " + label + ": " + transcript, "loading");
      };
      rec.onerror = function (evt) {
        setStatus("Voice recognition error: " + (evt.error || "unknown"), "error");
      };
      rec.start();
    } catch (err) {
      setStatus("Unable to start voice recognition.", "error");
    }
  }

  if (voiceSourceBtn) {
    voiceSourceBtn.addEventListener("click", function () {
      startVoiceRecognition(sourceInput, "Source");
    });
  }
  if (voiceDestBtn) {
    voiceDestBtn.addEventListener("click", function () {
      startVoiceRecognition(destInput, "Destination");
    });
  }

  swapBtn.addEventListener("click", function () {
    const tmp = sourceInput.value;
    sourceInput.value = destInput.value;
    destInput.value = tmp;
  });

  form.addEventListener("submit", async function (evt) {
    evt.preventDefault();
    const source = sourceInput.value.trim();
    const destination = destInput.value.trim();
    const departTime = departInput.value ? departInput.value.trim() : null;
    const weatherEl = document.getElementById("weather-input");
    const weather = weatherEl ? weatherEl.value : "clear";

    if (!source || !destination) {
      setStatus("Please provide both source and destination.", "error");
      return;
    }

    submitBtn.disabled = true;
    setStatus("Computing OSRM alternatives, ML traffic congestion forecast, and station accident risk...", "loading");

    try {
      const resp = await fetch("/api/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: source,
          destination: destination,
          depart_time: departTime,
          weather: weather,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setStatus(data.error || "Unable to compute routes.", "error");
        return;
      }
      setStatus("", "");
      renderMap(data);
      renderTable(data.routes || []);
      renderHistory(data.history || []);

      const recRoute = (data.routes || []).find(function (r) {
        return r.recommended;
      });
      if (recRoute && recRoute.composite_score > 0.80) {
        const alertMsg =
          "Dangerous Route Alert: Recommended " +
          recRoute.tag +
          " route composite score is " +
          recRoute.composite_score.toFixed(3) +
          " (> 0.80 threshold).";
        setStatus(alertMsg, "error");
        if ("Notification" in window) {
          if (Notification.permission === "granted") {
            new Notification("RoadSafe — Dangerous Route Risk Alert", { body: alertMsg });
          } else if (Notification.permission === "default") {
            Notification.requestPermission().then(function (perm) {
              if (perm === "granted") {
                new Notification("RoadSafe — Dangerous Route Risk Alert", { body: alertMsg });
              }
            });
          }
        }
      }
    } catch (err) {
      setStatus("Network error while contacting /api/routes.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadStations();
})();
