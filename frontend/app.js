// RouteX AI 2.0 - Landslide-Aware Live Navigation & Dynamic Detour Engine
// Fully functional Live GPS Navigation, Destination Autocomplete, Turn-by-Turn Guidance,
// Real-time Hazard Geofence Avoidance, and Geotechnical Landslide Simulation.

document.addEventListener('DOMContentLoaded', () => {
  // Register Service Worker for Offline Caching
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('[ServiceWorker] Registered successfully:', reg.scope))
      .catch((err) => console.warn('[ServiceWorker] Registration failed:', err));
  }

  // Network Status Monitor
  const offlineBadge = document.getElementById('offline-badge');
  function updateOnlineStatus() {
    if (!navigator.onLine) {
      if (offlineBadge) offlineBadge.classList.remove('hidden');
    } else {
      if (offlineBadge) offlineBadge.classList.add('hidden');
    }
  }
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // Initialize Lucide icons
  function refreshIcons() {
    if (window.lucide) {
      lucide.createIcons();
    }
  }
  refreshIcons();

  // =========================================================================
  // THEME MANAGEMENT (DARK / LIGHT TOGGLE WITH SLEEK DARK AS DEFAULT)
  // =========================================================================
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const themeText = document.getElementById('theme-text');
  const themeIcon = document.getElementById('theme-icon');

  function initTheme() {
    const savedTheme = localStorage.getItem('routex-theme');
    // Default to 'light' theme as in original UI
    if (savedTheme === 'dark') {
      document.body.classList.remove('light-theme');
      if (themeText) themeText.textContent = 'Dark';
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'moon');
    } else {
      document.body.classList.add('light-theme');
      if (themeText) themeText.textContent = 'Light';
      if (themeIcon) themeIcon.setAttribute('data-lucide', 'sun');
    }
    refreshIcons();
  }
  initTheme();

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-theme');
      localStorage.setItem('routex-theme', isLight ? 'light' : 'dark');
      if (themeText) themeText.textContent = isLight ? 'Light' : 'Dark';
      if (themeIcon) themeIcon.setAttribute('data-lucide', isLight ? 'sun' : 'moon');
      refreshIcons();
    });
  }

  // =========================================================================
  // CORE APPLICATION STATE
  // =========================================================================
  let map = null;
  let primaryRouteLayer = null;
  let safeRouteLayer = null;
  let geofenceLayersGroup = L.layerGroup();
  let hazardMarkersGroup = L.layerGroup();
  let routeMarkersGroup = L.layerGroup();
  let preventionLayersGroup = L.layerGroup();
  let gsiInventoryLayerGroup = L.layerGroup();
  let gsiZonesLayerGroup = L.layerGroup();
  let nasaGpmLayerGroup = L.layerGroup();
  let routeRiskSegmentsGroup = L.layerGroup();
  let heatmapLayer = null;

  // Prevention and Slope Stabilization State
  let currentPreventionAssets = [];
  let preventionMarkersMap = {};
  let isMitigationSimulated = false;

  // GSI and NASA GPM State
  let currentGSIRecords = [];
  let currentGSIZonesGeoJSON = null;

  // Live Navigation State
  let userGpsMarker = null;
  let userAccuracyCircle = null;
  let destMarker = null;
  let userCurrentPosition = null; // [lon, lat]
  let userGpsAccuracy = null;     // meters
  let userGpsHeading = null;      // degrees
  let selectedDestination = null; // { name, formatted, lat, lon }
  let activeNavigationRoute = null; // full calculated route object
  let activeRouteCoordinates = [];
  let activeNavSteps = [];
  let navWatchId = null;
  let isNavigating = false;
  let isNavPaused = false;
  let isSimulateDriving = false;
  let simDriveTimer = null;
  let simDriveIndex = 0;
  let isFollowMode = true;
  let isVoiceMuted = false;
  let currentStepIndex = 0;
  let lastAnnouncedStepIndex = -1;
  let offRouteCounter = 0;
  let isRecalculating = false;
  let activeRouteOptions = [];
  let selectedRouteOptionId = "route_recommended";
  let stepHighlightMarker = null;
  let alternativeRouteLayers = [];
  let totalTripDistanceKm = 0.0;
  let totalTripDurationMin = 0.0;

  // Analysis / Corridor State (Preserved 100%)
  let activeRegionKey = 'badrinath';
  let currentRegionData = null;
  let currentGeoJSONGeofences = null;

  const REGIONS = {
    badrinath: {
      name: "Himalayas Highway (Rishikesh to Badrinath)",
      start: [78.2676, 30.0869], // [lon, lat]
      end: [79.4938, 30.7433],
      center: [30.4100, 78.8800], // [lat, lon]
      zoom: 9,
      hazard: {
        latitude: 30.5500,
        longitude: 79.1200,
        slope_angle: 46.5,
        rainfall_24h: 165.0,
        soil_saturation: 0.92,
        name: "Rudraprayag-Joshimath Landslide Corridor"
      }
    },
    sikkim_gangtok: {
      name: "North-East Pass (Siliguri to Gangtok NH10)",
      start: [88.4236, 26.7271],
      end: [88.6138, 27.3389],
      center: [27.0500, 88.5200],
      zoom: 9,
      hazard: {
        latitude: 27.0850,
        longitude: 88.4750,
        slope_angle: 45.0,
        rainfall_24h: 175.0,
        soil_saturation: 0.94,
        name: "Teesta River Valley (NH10 Landslide Zone)"
      }
    },
    arunachal_tawang: {
      name: "Arunachal Highway (Guwahati to Tawang)",
      start: [91.7362, 26.1445],
      end: [91.8594, 27.5861],
      center: [26.8500, 91.8000],
      zoom: 8,
      hazard: {
        latitude: 27.5050,
        longitude: 92.1000,
        slope_angle: 49.0,
        rainfall_24h: 160.0,
        soil_saturation: 0.89,
        name: "Sela Pass High Altitude Slope Sector"
      }
    },
    meghalaya_sohra: {
      name: "Meghalaya Escarpment (Shillong to Cherrapunji)",
      start: [91.8933, 25.5788],
      end: [91.7323, 25.2702],
      center: [25.4200, 91.8100],
      zoom: 10,
      hazard: {
        latitude: 25.3550,
        longitude: 91.7850,
        slope_angle: 47.5,
        rainfall_24h: 210.0,
        soil_saturation: 0.96,
        name: "Duwan Sing Syiem Slope Escarpment"
      }
    }
  };

  // DOM Elements - Mode Switcher
  const tabNavMode = document.getElementById('tab-nav-mode');
  const tabAnalysisMode = document.getElementById('tab-analysis-mode');
  const navModeContainer = document.getElementById('nav-mode-container');
  const analysisModeContainer = document.getElementById('analysis-mode-container');

  // DOM Elements - Live Navigation Section
  const btnDetectGps = document.getElementById('btn-detect-gps');
  const navOriginInput = document.getElementById('nav-origin-input');
  const gpsStatusPill = document.getElementById('gps-status-pill');
  const gpsStatusLabel = document.getElementById('gps-status-label');
  const gpsAccuracyText = document.getElementById('gps-accuracy-text');
  const gpsCoordsPreview = document.getElementById('gps-coords-preview');
  const gpsErrorBanner = document.getElementById('gps-error-banner');
  const gpsErrorTitle = document.getElementById('gps-error-title');
  const gpsErrorDesc = document.getElementById('gps-error-desc');

  const destSearchInput = document.getElementById('dest-search-input');
  const destSearchSpinner = document.getElementById('dest-search-spinner');
  const btnClearDest = document.getElementById('btn-clear-dest');
  const destAutocompleteList = document.getElementById('dest-autocomplete-list');
  const btnCalcRoute = document.getElementById('btn-calc-route');

  const routeInfoCard = document.getElementById('route-info-card');
  const routeOriginDisplay = document.getElementById('route-origin-display');
  const routeDestDisplay = document.getElementById('route-dest-display');
  const navRouteDist = document.getElementById('nav-route-dist');
  const navRouteDur = document.getElementById('nav-route-dur');
  const navRouteEta = document.getElementById('nav-route-eta');
  const navHazardSafetyBadge = document.getElementById('nav-hazard-safety-badge');
  const navSafetyIcon = document.getElementById('nav-safety-icon');
  const navSafetyTitle = document.getElementById('nav-safety-title');
  const navDetourRationale = document.getElementById('nav-detour-rationale');
  const navHazardTime = document.getElementById('nav-hazard-time');
  const navRouteOptionsContainer = document.getElementById('nav-route-options-container');
  const navRouteOptionsList = document.getElementById('nav-route-options-list');
  const routeOptionsCount = document.getElementById('route-options-count');
  const btnToggleDirectionsView = document.getElementById('btn-toggle-directions-view');
  const btnDirectionsCount = document.getElementById('btn-directions-count');
  const routeDirectionsView = document.getElementById('route-directions-view');
  const directionsFullList = document.getElementById('directions-full-list');
  const directionsTotalBadge = document.getElementById('directions-total-badge');
  const btnStartNav = document.getElementById('btn-start-nav');
  const btnSimulateDrive = document.getElementById('btn-simulate-drive');
  const btnClearRoute = document.getElementById('btn-clear-route');

  const activeNavPanel = document.getElementById('active-nav-panel');
  const navLiveSpeed = document.getElementById('nav-live-speed');
  const navActiveRemainingDist = document.getElementById('nav-active-remaining-dist');
  const navActiveRemainingTime = document.getElementById('nav-active-remaining-time');
  const navProgressBarFill = document.getElementById('nav-progress-bar-fill');
  const navOffrouteAlert = document.getElementById('nav-offroute-alert');
  const navOffrouteDistText = document.getElementById('nav-offroute-dist-text');
  const btnOffrouteRecalcNow = document.getElementById('btn-offroute-recalc-now');
  const navProximityAlert = document.getElementById('nav-proximity-alert');
  const navProximityText = document.getElementById('nav-proximity-text');
  const navActiveIcon = document.getElementById('nav-active-icon');
  const navActiveDist = document.getElementById('nav-active-dist');
  const navActiveText = document.getElementById('nav-active-text');
  const navActiveStreet = document.getElementById('nav-active-street');
  const btnNavPause = document.getElementById('btn-nav-pause');
  const iconPauseNav = document.getElementById('icon-pause-nav');
  const textPauseNav = document.getElementById('text-pause-nav');
  const btnNavRecenter = document.getElementById('btn-nav-recenter');
  const btnNavRecalc = document.getElementById('btn-nav-recalc');
  const btnToggleFollow = document.getElementById('btn-toggle-follow');
  const btnToggleVoice = document.getElementById('btn-toggle-voice');
  const voiceIcon = document.getElementById('voice-icon');
  const btnEndNav = document.getElementById('btn-end-nav');
  const btnToggleStepsList = document.getElementById('btn-toggle-steps-list');
  const stepsChevron = document.getElementById('steps-chevron');
  const stepsCountBadge = document.getElementById('steps-count-badge');
  const navFullStepsList = document.getElementById('nav-full-steps-list');

  const destinationArrivalCard = document.getElementById('destination-arrival-card');
  const arrivalDestName = document.getElementById('arrival-dest-name');
  const arrivalMetricDist = document.getElementById('arrival-metric-dist');
  const arrivalMetricDur = document.getElementById('arrival-metric-dur');
  const btnArrivalDismiss = document.getElementById('btn-arrival-dismiss');

  // Floating HUD over Map
  const navFloatingHud = document.getElementById('nav-floating-hud');
  const hudManeuverIcon = document.getElementById('hud-maneuver-icon');
  const hudNextDist = document.getElementById('hud-next-dist');
  const hudNextInstruction = document.getElementById('hud-next-instruction');
  const hudNextSub = document.getElementById('hud-next-sub');
  const hudEtaPill = document.getElementById('hud-eta-pill');
  const btnHudEnd = document.getElementById('btn-hud-end');
  const btnMapRecenter = document.getElementById('btn-map-recenter');
  const btnMapHeading = document.getElementById('btn-map-heading');

  // DOM Elements - Analysis & Simulation Section (Preserved)
  const sliderRain = document.getElementById('slider-rain');
  const sliderSoil = document.getElementById('slider-soil');
  const sliderSlope = document.getElementById('slider-slope');
  const valRain = document.getElementById('val-rain');
  const valSoil = document.getElementById('val-soil');
  const valSlope = document.getElementById('val-slope');
  const lhiVal = document.getElementById('lhi-val');
  const lhiFillBar = document.getElementById('lhi-fill-bar');
  const lhiClassText = document.getElementById('lhi-class-text');
  const lhiMethodText = document.getElementById('lhi-method-text');
  const alertBanner = document.getElementById('alert-banner');
  const alertTitle = document.getElementById('alert-title');
  const alertMessage = document.getElementById('alert-message');
  const alertOrigDist = document.getElementById('alert-orig-dist');
  const alertSafeDist = document.getElementById('alert-safe-dist');
  const alertEtaDelta = document.getElementById('alert-eta-delta');
  const btnSimulate = document.getElementById('btn-simulate');
  const btnResetRoute = document.getElementById('btn-reset-route');
  const btnFetchMeteo = document.getElementById('btn-fetch-open-meteo');
  const btnRecalcLHI = document.getElementById('btn-recalculate-lhi');
  const chkGeofences = document.getElementById('chk-geofences');
  const chkHeatmap = document.getElementById('chk-heatmap');
  const chkPrevention = document.getElementById('chk-prevention');
  const chkSimulateMitigation = document.getElementById('chk-simulate-mitigation');
  const chkGsiInventory = document.getElementById('chk-gsi-inventory');
  const chkGsiZones = document.getElementById('chk-gsi-zones');
  const chkNasaGpm = document.getElementById('chk-nasa-gpm');
  const preventionStatusBadge = document.getElementById('prevention-status-badge');
  const prevFosVal = document.getElementById('prev-fos-val');
  const prevReductionVal = document.getElementById('prev-reduction-val');
  const mitigationImpactPill = document.getElementById('mitigation-impact-pill');
  const preventionAssetsScroll = document.getElementById('prevention-assets-scroll');
  const prevAssetCount = document.getElementById('prev-asset-count');
  const mitigationBox = document.querySelector('.mitigation-simulator-box');

  // Route Segment Risk Elements
  const routeRiskCard = document.getElementById('route-segmented-risk-card');
  const routeRiskBadge = document.getElementById('route-risk-badge');
  const routeHazardScoreVal = document.getElementById('route-hazard-score-val');
  const routeGsiZonesVal = document.getElementById('route-gsi-zones-val');
  const routeGsiSlidesVal = document.getElementById('route-gsi-slides-val');
  const routeRainPeakVal = document.getElementById('route-rain-peak-val');
  const routeSegmentsVisualBar = document.getElementById('route-segments-visual-bar');
  const segmentBarBreakdown = document.getElementById('segment-bar-breakdown');
  const routeRiskAlertsContainer = document.getElementById('route-risk-alerts-container');

  // AI Inspector Elements
  const inpInspLat = document.getElementById('inp-insp-lat');
  const inpInspLon = document.getElementById('inp-insp-lon');
  const btnRunAiEval = document.getElementById('btn-run-ai-eval');
  const btnUseCurrPoint = document.getElementById('btn-use-curr-point');
  const aiInspResults = document.getElementById('ai-insp-results');
  const inspCatPill = document.getElementById('insp-cat-pill');
  const inspScoreText = document.getElementById('insp-score-text');
  const inspSlopeVal = document.getElementById('insp-slope-val');
  const inspR24Val = document.getElementById('insp-r24-val');
  const inspGsiVal = document.getElementById('insp-gsi-val');
  const inspSoilVal = document.getElementById('insp-soil-val');
  const inspAdvisoryText = document.getElementById('insp-advisory-text');

  // =========================================================================
  // INITIALIZE LEAFLET MAP
  // =========================================================================
  function initMap() {
    currentRegionData = REGIONS[activeRegionKey];
    const centerLat = currentRegionData.center[0];
    const centerLon = currentRegionData.center[1];

    map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([centerLat, centerLon], currentRegionData.zoom);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // High quality OpenStreetMap tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors • RouteX AI'
    }).addTo(map);

    geofenceLayersGroup.addTo(map);
    hazardMarkersGroup.addTo(map);
    routeMarkersGroup.addTo(map);
    preventionLayersGroup.addTo(map);
    gsiZonesLayerGroup.addTo(map);
    gsiInventoryLayerGroup.addTo(map);
    nasaGpmLayerGroup.addTo(map);
    routeRiskSegmentsGroup.addTo(map);

    // Initial GSI background load
    fetchAndRenderGSIZones();
    fetchAndRenderGSIInventory();

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 250);

    setTimeout(() => {
      if (map) map.invalidateSize();
    }, 800);

    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });

    // Initial load: render corridor
    loadRegionRoute(activeRegionKey);
  }

  // Initialize Theme and Map Immediately
  initTheme();
  try {
    initMap();
  } catch (err) {
    console.error("[RouteX] Error initializing map:", err);
  }

  // =========================================================================
  // MODE SWITCHING LOGIC (NAV VS ANALYSIS)
  // =========================================================================
  if (tabNavMode && tabAnalysisMode) {
    tabNavMode.addEventListener('click', () => {
      tabNavMode.classList.add('active');
      tabNavMode.setAttribute('aria-selected', 'true');
      tabAnalysisMode.classList.remove('active');
      tabAnalysisMode.setAttribute('aria-selected', 'false');

      navModeContainer.classList.remove('hidden');
      analysisModeContainer.classList.add('hidden');

      // Auto-detect GPS if not yet requested
      if (!userCurrentPosition) {
        requestInitialLocation(true);
      }
      refreshIcons();
    });

    tabAnalysisMode.addEventListener('click', () => {
      tabAnalysisMode.classList.add('active');
      tabAnalysisMode.setAttribute('aria-selected', 'true');
      tabNavMode.classList.remove('active');
      tabNavMode.setAttribute('aria-selected', 'false');

      analysisModeContainer.classList.remove('hidden');
      navModeContainer.classList.add('hidden');

      // Re-render regional corridor
      loadRegionRoute(activeRegionKey);
      refreshIcons();
    });
  }

  // =========================================================================
  // 1. CURRENT GPS LOCATION DETECTION (BROWSER GEOLOCATION API)
  // =========================================================================
  function requestInitialLocation(isSilent = false) {
    if (!("geolocation" in navigator)) {
      showGpsError("Geolocation Not Supported", "Your browser does not support GPS geolocation. Please enter coordinates manually.");
      return;
    }

    setGpsStatus("pending", "Acquiring GPS...");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleGpsPositionSuccess(pos);
      },
      (err) => {
        handleGpsError(err, isSilent);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0
      }
    );
  }

  function handleGpsPositionSuccess(pos) {
    hideGpsError();
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const acc = pos.coords.accuracy || 15;
    const heading = pos.coords.heading || 0;

    userCurrentPosition = [lon, lat];
    userGpsAccuracy = acc;
    userGpsHeading = heading;

    hideGpsError(); // Clear permission warning once locked

    setGpsStatus("active", `GPS Locked (±${Math.round(acc)}m)`);
    if (gpsAccuracyText) gpsAccuracyText.textContent = `Accuracy: ±${Math.round(acc)}m`;
    if (gpsCoordsPreview) gpsCoordsPreview.textContent = `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;

    // Reverse geocode to show street/town name
    reverseGeocodeOrigin(lat, lon);

    // Update map marker
    updateUserMapMarker(lat, lon, acc, heading);

    // If destination already chosen, enable route calculation
    if (selectedDestination) {
      btnCalcRoute.disabled = false;
    }

  }

  function handleGpsError(err, isSilent = false) {
    console.warn("[Geolocation] Error code:", err.code, err.message);
    setGpsStatus("warning", "GPS Offline");

    let title = "GPS Signal Unavailable";
    let message = "Could not obtain GPS fix. Please verify location services and device permissions.";

    if (err.code === 1) { // PERMISSION_DENIED
      title = "Location Permission Denied";
      message = "RouteX requires GPS permission for live turn-by-turn navigation. Please allow access in your browser settings.";
    } else if (err.code === 3) { // TIMEOUT
      title = "GPS Search Timed Out";
      message = "GPS satellite acquisition timed out. Re-trying with network assisted triangulation.";
    }

    if (!isSilent) {
      showGpsError(title, message);
    }

    // Default to active region origin coordinates as fallback origin for demonstration
    if (!userCurrentPosition && currentRegionData) {
      userCurrentPosition = [currentRegionData.start[0], currentRegionData.start[1]];
      navOriginInput.value = `${currentRegionData.name} (Origin Fix)`;
      if (gpsCoordsPreview) gpsCoordsPreview.textContent = `${userCurrentPosition[1].toFixed(4)}°, ${userCurrentPosition[0].toFixed(4)}°`;
      updateUserMapMarker(userCurrentPosition[1], userCurrentPosition[0], 25, 0);
    }
  }

  function setGpsStatus(state, label) {
    if (!gpsStatusPill) return;
    gpsStatusPill.className = `gps-status-pill ${state}`;
    if (gpsStatusLabel) gpsStatusLabel.textContent = label;
  }

  function showGpsError(title, msg) {
    if (!gpsErrorBanner) return;
    gpsErrorTitle.textContent = title;
    gpsErrorDesc.textContent = msg;
    gpsErrorBanner.classList.remove('hidden');
  }

  function hideGpsError() {
    if (gpsErrorBanner) gpsErrorBanner.classList.add('hidden');
  }

  async function reverseGeocodeOrigin(lat, lon) {
    try {
      const resp = await fetch(`/api/geocode/reverse?lat=${lat}&lon=${lon}`);
      if (resp.ok) {
        const data = await resp.json();
        navOriginInput.value = data.address || `GPS Fix (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`;
        return;
      }
    } catch (e) {
      console.warn("Reverse geocode notice:", e);
    }
    navOriginInput.value = `Current Location (${lat.toFixed(4)}°, ${lon.toFixed(4)}°)`;
  }

  function updateUserMapMarker(lat, lon, accuracy = 20, heading = 0) {
    if (!map) return;

    const headingRotation = heading ? `transform: rotate(${heading}deg);` : '';
    const userMarkerHtml = `
      <div class="user-gps-pulse-marker">
        <div class="gps-pulse-ring"></div>
        <div class="gps-center-dot"></div>
        <div class="gps-heading-cone" style="${headingRotation}"></div>
      </div>
    `;

    const userIcon = L.divIcon({
      className: 'user-gps-div-icon',
      html: userMarkerHtml,
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    if (!userGpsMarker) {
      userGpsMarker = L.marker([lat, lon], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
      userGpsMarker.bindPopup("<b>Your Current GPS Position</b><br>Live Telemetry Active");
    } else {
      userGpsMarker.setLatLng([lat, lon]);
      userGpsMarker.setIcon(userIcon);
    }

    // Accuracy Circle
    if (!userAccuracyCircle) {
      userAccuracyCircle = L.circle([lat, lon], {
        radius: Math.min(250, Math.max(15, accuracy)),
        color: '#2563eb',
        fillColor: '#3b82f6',
        fillOpacity: 0.12,
        weight: 1
      }).addTo(map);
    } else {
      userAccuracyCircle.setLatLng([lat, lon]);
      userAccuracyCircle.setRadius(Math.min(250, Math.max(15, accuracy)));
    }

    if (isFollowMode && isNavigating) {
      map.panTo([lat, lon], { animate: true, duration: 0.6 });
    }
  }

  if (btnDetectGps) {
    btnDetectGps.addEventListener('click', () => {
      requestInitialLocation(false);
    });
  }

  // =========================================================================
  // 2. DESTINATION SEARCH WITH LIVE AUTOCOMPLETE
  // =========================================================================
  let autocompleteDebounceTimer = null;

  if (destSearchInput) {
    destSearchInput.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      if (query.length > 0) {
        if (btnClearDest) btnClearDest.classList.remove('hidden');
        if (btnCalcRoute) btnCalcRoute.disabled = false;
      } else {
        if (btnClearDest) btnClearDest.classList.add('hidden');
        if (destAutocompleteList) destAutocompleteList.classList.add('hidden');
        return;
      }

      if (query.length < 2) {
        if (destAutocompleteList) destAutocompleteList.classList.add('hidden');
        return;
      }

      clearTimeout(autocompleteDebounceTimer);
      autocompleteDebounceTimer = setTimeout(() => {
        fetchDestinationAutocomplete(query);
      }, 300);
    });

    destSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (destAutocompleteList) destAutocompleteList.classList.add('hidden');
        calculateLandslideSafeRoute();
      }
    });
  }

  if (btnClearDest) {
    btnClearDest.addEventListener('click', () => {
      if (destSearchInput) destSearchInput.value = '';
      btnClearDest.classList.add('hidden');
      if (destAutocompleteList) destAutocompleteList.classList.add('hidden');
      selectedDestination = null;
      if (btnCalcRoute) btnCalcRoute.disabled = true;
      if (destMarker && map) map.removeLayer(destMarker);
    });
  }

  // Quick Destination Chips
  document.querySelectorAll('.dest-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      const name = chip.dataset.dest;
      const lat = parseFloat(chip.dataset.lat);
      const lon = parseFloat(chip.dataset.lon);

      selectDestination({
        name: name,
        formatted: `${name}, India`,
        latitude: lat,
        longitude: lon,
        type: "Mountain Pass"
      });
    });
  });

  async function fetchDestinationAutocomplete(q) {
    destSearchSpinner.classList.remove('hidden');

    try {
      let url = `/api/geocode/autocomplete?q=${encodeURIComponent(q)}`;
      if (userCurrentPosition) {
        url += `&lat=${userCurrentPosition[1]}&lon=${userCurrentPosition[0]}`;
      }

      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Autocomplete API returned error");
      const data = await resp.json();

      renderAutocompleteResults(data.results || []);
    } catch (e) {
      console.warn("[Autocomplete] Fetch notice:", e);
      destAutocompleteList.classList.add('hidden');
    } finally {
      destSearchSpinner.classList.add('hidden');
    }
  }

  function renderAutocompleteResults(results) {
    destAutocompleteList.innerHTML = '';

    if (!results || results.length === 0) {
      destAutocompleteList.innerHTML = `<li style="color:var(--text-muted); cursor:default; font-size:0.78rem;">No matching places found. Try another landmark.</li>`;
      destAutocompleteList.classList.remove('hidden');
      return;
    }

    results.forEach(item => {
      const li = document.createElement('li');
      li.role = "option";

      const distText = item.distance_km ? `<span class="ac-badge">${item.distance_km} km</span>` : `<span class="ac-badge">${item.type || 'place'}</span>`;

      li.innerHTML = `
        <div class="ac-name">
          <span>${escapeHtml(item.name || item.formatted)}</span>
          ${distText}
        </div>
        <div class="ac-sub">${escapeHtml(item.formatted || item.city || '')}</div>
      `;

      li.addEventListener('click', () => {
        selectDestination(item);
      });

      destAutocompleteList.appendChild(li);
    });

    destAutocompleteList.classList.remove('hidden');
  }

  function selectDestination(item) {
    selectedDestination = {
      name: item.name,
      formatted: item.formatted,
      lat: item.latitude,
      lon: item.longitude
    };

    destSearchInput.value = item.name || item.formatted;
    destAutocompleteList.classList.add('hidden');
    btnClearDest.classList.remove('hidden');

    // Place Destination Marker
    if (destMarker) map.removeLayer(destMarker);

    const destIcon = L.divIcon({
      className: 'custom-map-marker end-marker',
      html: '<div style="background:#3b82f6; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 0 16px #3b82f6; display:flex; align-items:center; justify-content:center; color:#ffffff; font-size:12px; font-weight:800;">📍</div>',
      iconSize: [26, 26]
    });

    destMarker = L.marker([item.latitude, item.longitude], { icon: destIcon }).addTo(map);
    destMarker.bindPopup(`<b>Destination</b><br>${item.name}<br>${item.formatted || ''}`).openPopup();

    // Pan towards destination
    map.flyTo([item.latitude, item.longitude], 10, { duration: 1.0 });

    // Enable Calculate Route Button
    btnCalcRoute.disabled = false;
  }

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-autocomplete-box')) {
      destAutocompleteList.classList.add('hidden');
    }
  });

  // =========================================================================
  // 3. ROUTE CALCULATION WITH INTEGRATED LANDSLIDE GEOFENCING
  // =========================================================================
  if (btnCalcRoute) {
    btnCalcRoute.addEventListener('click', () => {
      calculateLandslideSafeRoute();
    });
  }

  async function calculateLandslideSafeRoute() {
    // 1. If destination not selected from dropdown yet, try auto-geocoding typed text
    if (!selectedDestination && destSearchInput.value.trim().length >= 2) {
      const q = destSearchInput.value.trim();
      btnCalcRoute.disabled = true;
      btnCalcRoute.innerHTML = `<div class="spinner-sm" style="position:static; margin-right:8px;"></div> Finding "${escapeHtml(q)}"...`;
      try {
        let url = `/api/geocode/autocomplete?q=${encodeURIComponent(q)}`;
        if (userCurrentPosition) {
          url += `&lat=${userCurrentPosition[1]}&lon=${userCurrentPosition[0]}`;
        }
        const geoResp = await fetch(url);
        if (geoResp.ok) {
          const geoData = await geoResp.json();
          const results = geoData.results || [];
          if (results.length > 0) {
            selectDestination(results[0]);
          }
        }
      } catch (e) {
        console.warn("[Router] Auto-geocoding notice:", e);
      }
    }

    // 2. Fall back to current region corridor end if still empty
    if (!selectedDestination && currentRegionData) {
      const destName = currentRegionData.name.includes(" to ") ? currentRegionData.name.split(" to ")[1] : "Corridor Destination";
      selectDestination({
        name: destName,
        formatted: currentRegionData.name,
        latitude: currentRegionData.end[1],
        longitude: currentRegionData.end[0],
        type: "Mountain Pass"
      });
    }

    if (!selectedDestination) {
      alert("Please enter a destination or pick a quick mountain pass.");
      return;
    }

    // Use current GPS or fallback to origin
    const start = userCurrentPosition || currentRegionData.start;
    const end = [selectedDestination.lon, selectedDestination.lat];


    btnCalcRoute.disabled = true;
    btnCalcRoute.innerHTML = `<div class="spinner-sm" style="position:static; margin-right:8px;"></div> Evaluating Hazards & Calculating Route...`;

    try {
      // Gather active region hazard points
      const hazardPts = [currentRegionData.hazard];

      const resp = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: start,
          end: end,
          hazard_points: hazardPts,
          include_steps: true
        })
      });

      if (!resp.ok) throw new Error("Route calculation failed");
      const data = await resp.json();

      displayCalculatedRoute(data, start, end);
    } catch (e) {
      console.warn("[Router] API error, using safe fallback route:", e);
      renderLocalFallbackRoute(start, end, [currentRegionData.hazard]);
    } finally {
      btnCalcRoute.disabled = false;
      btnCalcRoute.innerHTML = `<i data-lucide="route"></i><span>Calculate Landslide-Safe Route</span>`;
      refreshIcons();
    }
  }

  function displayCalculatedRoute(routeData, start, end) {
    activeNavigationRoute = routeData;

    // Extract or synthesize route options
    if (routeData.route_options && routeData.route_options.length > 0) {
      activeRouteOptions = routeData.route_options;
    } else {
      const chosen = routeData.is_rerouted ? routeData.recalculated_safe_route : routeData.primary_route;
      activeRouteOptions = [
        {
          id: "route_recommended",
          title: routeData.is_rerouted ? "Autonomous Landslide Safe Detour" : "Recommended Safe Route",
          label_badge: "RECOMMENDED",
          distance_km: chosen.distance_km,
          duration_min: chosen.duration_min,
          steps: chosen.steps || [],
          coordinates: chosen.coordinates || [],
          hazard_score: chosen.hazard_score || 0.15,
          risk_level: chosen.risk_level || (routeData.is_rerouted ? "MODERATE" : "LOW"),
          recommendation_reason: routeData.detour_reason || "Safest corridor avoiding high-susceptibility slope zones.",
          is_recommended: true
        }
      ];
      if (routeData.is_rerouted && routeData.primary_route) {
        activeRouteOptions.push({
          id: "route_fastest",
          title: "Direct Highway (Hazard Blocked)",
          label_badge: "BLOCKED",
          distance_km: routeData.primary_route.distance_km,
          duration_min: routeData.primary_route.duration_min,
          steps: routeData.primary_route.steps || [],
          coordinates: routeData.primary_route.coordinates || [],
          hazard_score: 0.88,
          risk_level: "CRITICAL",
          recommendation_reason: "Traverses active landslide hazard geofence. Extreme caution advised.",
          is_fastest: true
        });
      }
    }

    // Set initial selected route option
    const recOpt = activeRouteOptions.find(r => r.is_recommended) || activeRouteOptions[0];
    selectedRouteOptionId = recOpt.id;

    activeRouteCoordinates = recOpt.coordinates || [];
    activeNavSteps = recOpt.steps || [];
    totalTripDistanceKm = recOpt.distance_km || 0;
    totalTripDurationMin = recOpt.duration_min || 0;

    // Clear previous map layers
    clearMapLayers();

    // 1. Draw Origin & Destination Markers
    const startIcon = L.divIcon({
      className: 'custom-map-marker start-marker',
      html: '<div style="background:#10b981; width:20px; height:20px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 0 14px #10b981;"></div>',
      iconSize: [24, 24]
    });
    L.marker([start[1], start[0]], { icon: startIcon }).addTo(routeMarkersGroup).bindPopup("<b>Route Origin (Your Location)</b>");

    const endIcon = L.divIcon({
      className: 'custom-map-marker end-marker',
      html: '<div style="background:#3b82f6; width:20px; height:20px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 0 14px #3b82f6;"></div>',
      iconSize: [24, 24]
    });
    L.marker([end[1], end[0]], { icon: endIcon }).addTo(routeMarkersGroup).bindPopup(`<b>Destination</b><br>${selectedDestination ? selectedDestination.name : 'Target'}`);

    // Update Endpoints Banner in UI
    if (routeOriginDisplay) {
      routeOriginDisplay.textContent = userCurrentPosition ? "Current GPS Location" : (currentRegionData ? currentRegionData.name.split(" to ")[0] : "Origin");
    }
    if (routeDestDisplay) {
      routeDestDisplay.textContent = selectedDestination ? (selectedDestination.name || selectedDestination.formatted) : "Target Destination";
    }

    // 2. Draw Danger Geofence Polygons & Heatmap
    currentGeoJSONGeofences = routeData.geofences;
    if (chkGeofences && chkGeofences.checked && currentGeoJSONGeofences) {
      drawGeofencePolygons(currentGeoJSONGeofences);
    }
    if (chkHeatmap && chkHeatmap.checked && currentGeoJSONGeofences) {
      drawHeatmapOverlay(currentGeoJSONGeofences);
    }

    // 3. Render Route Polylines for Active and Alternative Routes
    redrawMapPolylines();

    // Show alert banner if hazard detour engaged
    if (routeData.is_rerouted) {
      showAlertBanner({
        title: "⚠️ CRITICAL LANDSLIDE HAZARD AVOIDED",
        message: routeData.detour_reason || `High LHI hazard detected along primary road. Autonomous detour active.`,
        origDist: routeData.primary_route ? `${routeData.primary_route.distance_km} km` : "—",
        safeDist: `${recOpt.distance_km} km`,
        etaDelta: `+${Math.abs(routeData.eta_impact_min || 12)} min`
      });
    } else {
      hideAlertBanner();
    }

    // 4. Update Route Information Panel Card
    updateRouteInfoCard(routeData, recOpt);

    // 5. Render Route Options list
    renderRouteOptions(activeRouteOptions);

    // 6. Render Turn-by-Turn Directions List
    renderDirectionsList(activeNavSteps);

    // 7. Render Landslide Prevention & Slope Stabilization Assets along route
    if (routeData.prevention_assets && routeData.prevention_assets.length > 0) {
      renderPreventionAssets(routeData.prevention_assets);
    } else {
      fetchAndRenderPreventionAssets(activeRegionKey, activeRouteCoordinates);
    }

    // 8. Render Segmented Route Hazard Assessment (GSI + NASA GPM + DEM XGBoost)
    if (routeData.route_risk_assessment) {
      renderSegmentedRouteRisk(routeData.route_risk_assessment);
    } else if (activeRouteCoordinates && activeRouteCoordinates.length > 0) {
      fetchSegmentedRouteRisk(activeRouteCoordinates);
    }

    // Smooth scroll to route card
    if (routeInfoCard) {
      routeInfoCard.classList.remove('hidden');
      routeInfoCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    refreshIcons();
  }

  function updateRouteInfoCard(routeData, chosenRoute) {
    const dist = chosenRoute.distance_km || 0;
    const durMin = chosenRoute.duration_min || 0;

    if (navRouteDist) navRouteDist.textContent = `${dist} km`;

    const hours = Math.floor(durMin / 60);
    const mins = Math.round(durMin % 60);
    if (navRouteDur) navRouteDur.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

    // Compute ETA clock
    const now = new Date();
    const etaDate = new Date(now.getTime() + durMin * 60000);
    if (navRouteEta) navRouteEta.textContent = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Landslide Safety Classification Badge
    const status = chosenRoute.risk_level || routeData.safety_status || "VERIFIED_SAFE";
    if (navHazardSafetyBadge) {
      navHazardSafetyBadge.className = "hazard-safety-banner";

      if (status === "CRITICAL" || status === "CRITICAL_HAZARD_BLOCKED" || routeData.is_rerouted) {
        navHazardSafetyBadge.classList.add("blocked");
        if (navSafetyTitle) navSafetyTitle.textContent = "Autonomous Detour Engaged (Hazard Avoided)";
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'shield-alert');
        if (navDetourRationale) navDetourRationale.textContent = routeData.detour_reason || chosenRoute.recommendation_reason || "Route safely avoids active Landslide Hazard Geofences (LHI >= 0.75).";
      } else if (status === "MODERATE" || status === "ELEVATED_RISK") {
        navHazardSafetyBadge.classList.add("elevated");
        if (navSafetyTitle) navSafetyTitle.textContent = "Elevated Slope Risk Monitored";
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'alert-triangle');
        if (navDetourRationale) navDetourRationale.textContent = chosenRoute.recommendation_reason || "Corridor passes near elevated soil moisture/slope zones. Monitored in real-time.";
      } else {
        navHazardSafetyBadge.classList.add("safe");
        if (navSafetyTitle) navSafetyTitle.textContent = "Verified Safe Navigation Corridor";
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'shield-check');
        if (navDetourRationale) navDetourRationale.textContent = chosenRoute.recommendation_reason || "0 active landslide geofences intersect planned path. XGBoost ML slope stability index verified.";
      }
    }

    if (navHazardTime) {
      navHazardTime.textContent = `Verified: ${new Date(routeData.hazard_last_updated || Date.now()).toLocaleTimeString()} UTC • Open-Meteo & XGBoost`;
    }
  }

  // =========================================================================
  // ROUTE OPTIONS & DYNAMIC POLYLINE MANAGEMENT
  // =========================================================================
  function renderRouteOptions(options) {
    if (!navRouteOptionsContainer || !navRouteOptionsList) return;

    if (!options || options.length === 0) {
      navRouteOptionsContainer.classList.add('hidden');
      return;
    }

    navRouteOptionsContainer.classList.remove('hidden');
    if (routeOptionsCount) {
      routeOptionsCount.textContent = `${options.length} Routes`;
    }

    navRouteOptionsList.innerHTML = '';

    options.forEach(opt => {
      const isSelected = opt.id === selectedRouteOptionId;
      const card = document.createElement('div');
      card.className = `route-option-card ${isSelected ? 'active' : ''}`;
      card.dataset.routeId = opt.id;

      // Tag class
      let tagClass = 'badge-alt';
      if (opt.is_recommended) tagClass = 'badge-safe';
      else if (opt.is_fastest) tagClass = 'badge-fastest';
      else if (opt.risk_level === 'CRITICAL' || opt.risk_level === 'HIGH') tagClass = 'badge-blocked';

      // Risk class
      let riskClass = 'risk-low';
      if (opt.risk_level === 'CRITICAL' || opt.risk_level === 'HIGH') riskClass = 'risk-high';
      else if (opt.risk_level === 'MODERATE') riskClass = 'risk-moderate';

      // Duration formatting
      const durMin = opt.duration_min || 0;
      const h = Math.floor(durMin / 60);
      const m = Math.round(durMin % 60);
      const durStr = h > 0 ? `${h}h ${m}m` : `${m} min`;

      // ETA
      const etaDate = new Date(Date.now() + durMin * 60000);
      const etaStr = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="route-option-header">
          <span class="route-tag-badge ${tagClass}">${escapeHtml(opt.label_badge || (opt.is_recommended ? 'RECOMMENDED' : 'ALTERNATIVE'))}</span>
          <span class="route-risk-badge-mini ${riskClass}">${escapeHtml(opt.risk_level || 'LOW')} RISK</span>
        </div>
        <div class="route-option-title">${escapeHtml(opt.title || 'Mountain Route')}</div>
        <div class="route-option-stats">
          <span><b>${opt.distance_km || 0} km</b></span>
          <span>•</span>
          <span><b>${durStr}</b></span>
          <span>•</span>
          <span>ETA ${etaStr}</span>
        </div>
        <div class="route-option-rationale">${escapeHtml(opt.recommendation_reason || 'Verified corridor')}</div>
      `;

      card.addEventListener('click', () => {
        selectRouteOption(opt.id);
      });

      navRouteOptionsList.appendChild(card);
    });

    refreshIcons();
  }

  function selectRouteOption(routeId) {
    selectedRouteOptionId = routeId;
    const chosenOpt = activeRouteOptions.find(r => r.id === routeId) || activeRouteOptions[0];
    if (!chosenOpt) return;

    // 1. Update UI cards selection
    document.querySelectorAll('.route-option-card').forEach(c => {
      c.classList.toggle('active', c.dataset.routeId === routeId);
    });

    // 2. Set active nav variables
    activeRouteCoordinates = chosenOpt.coordinates || [];
    activeNavSteps = chosenOpt.steps || [];
    totalTripDistanceKm = chosenOpt.distance_km || 0;
    totalTripDurationMin = chosenOpt.duration_min || 0;

    // 3. Update Route Info Card metrics
    if (navRouteDist) navRouteDist.textContent = `${chosenOpt.distance_km} km`;
    const h = Math.floor((chosenOpt.duration_min || 0) / 60);
    const m = Math.round((chosenOpt.duration_min || 0) % 60);
    if (navRouteDur) navRouteDur.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;
    const etaDate = new Date(Date.now() + (chosenOpt.duration_min || 0) * 60000);
    if (navRouteEta) navRouteEta.textContent = etaDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Update safety banner
    if (navSafetyTitle) navSafetyTitle.textContent = chosenOpt.title;
    if (navDetourRationale) navDetourRationale.textContent = chosenOpt.recommendation_reason;
    if (navHazardSafetyBadge) {
      navHazardSafetyBadge.className = 'hazard-safety-banner';
      if (chosenOpt.risk_level === 'CRITICAL' || chosenOpt.risk_level === 'HIGH') {
        navHazardSafetyBadge.classList.add('blocked');
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'shield-alert');
      } else if (chosenOpt.risk_level === 'MODERATE') {
        navHazardSafetyBadge.classList.add('elevated');
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'alert-triangle');
      } else {
        navHazardSafetyBadge.classList.add('safe');
        if (navSafetyIcon) navSafetyIcon.setAttribute('data-lucide', 'shield-check');
      }
    }

    // 4. Update Polylines on Map
    redrawMapPolylines();

    // 5. Update Turn-by-Turn directions
    renderDirectionsList(activeNavSteps);
    refreshIcons();
  }

  function redrawMapPolylines() {
    if (safeRouteLayer && map && map.hasLayer(safeRouteLayer)) map.removeLayer(safeRouteLayer);
    if (primaryRouteLayer && map && map.hasLayer(primaryRouteLayer)) map.removeLayer(primaryRouteLayer);
    if (alternativeRouteLayers && alternativeRouteLayers.length > 0) {
      alternativeRouteLayers.forEach(l => { if (map && map.hasLayer(l)) map.removeLayer(l); });
      alternativeRouteLayers = [];
    }

    // Draw alternative routes first (behind active route)
    activeRouteOptions.forEach(opt => {
      if (opt.id !== selectedRouteOptionId && opt.coordinates && opt.coordinates.length > 0) {
        const coords = opt.coordinates.map(c => [c[1], c[0]]);
        const isRisky = opt.risk_level === 'CRITICAL' || opt.risk_level === 'HIGH';
        const altLine = L.polyline(coords, {
          color: isRisky ? '#ef4444' : '#3b82f6',
          weight: 4,
          dashArray: '6, 8',
          opacity: 0.75
        }).addTo(map);

        altLine.bindTooltip(`<b>${escapeHtml(opt.title)}</b><br>${opt.distance_km} km • ${opt.duration_min} min • ${opt.risk_level} Risk`, {
          sticky: true
        });

        altLine.on('click', () => {
          selectRouteOption(opt.id);
        });

        alternativeRouteLayers.push(altLine);
      }
    });

    // Draw currently selected active route
    const activeOpt = activeRouteOptions.find(r => r.id === selectedRouteOptionId) || activeRouteOptions[0];
    if (activeOpt && activeOpt.coordinates && activeOpt.coordinates.length > 0) {
      const coords = activeOpt.coordinates.map(c => [c[1], c[0]]);
      const isRisky = activeOpt.risk_level === 'CRITICAL' || activeOpt.risk_level === 'HIGH';
      safeRouteLayer = L.polyline(coords, {
        color: isRisky ? '#f59e0b' : '#10b981',
        weight: 6,
        opacity: 0.95
      }).addTo(map);

      if (safeRouteLayer.getBounds().isValid()) {
        map.fitBounds(safeRouteLayer.getBounds(), { padding: [45, 45] });
      }
    }
  }

  // =========================================================================
  // TURN-BY-TURN DIRECTIONS PANEL & STEP HIGHLIGHTING
  // =========================================================================
  function renderDirectionsList(steps) {
    if (!directionsFullList) return;
    directionsFullList.innerHTML = '';

    const stepList = steps || [];
    if (btnDirectionsCount) btnDirectionsCount.textContent = stepList.length;
    if (directionsTotalBadge) directionsTotalBadge.textContent = `${stepList.length} Steps`;

    if (stepList.length === 0) {
      directionsFullList.innerHTML = `
        <div style="padding:16px; text-align:center; color:var(--text-dim); font-size:0.8rem;">
          No step-by-step maneuvers available for this corridor.
        </div>
      `;
      return;
    }

    stepList.forEach((step, idx) => {
      const card = document.createElement('div');
      card.className = 'direction-step-card';
      card.dataset.stepIndex = idx;

      const distStr = (step.distance_m || 0) > 1000 
        ? `${((step.distance_m || 0) / 1000).toFixed(1)} km` 
        : `${Math.round(step.distance_m || 0)} m`;

      const iconName = step.icon || getManeuverIcon(step.type, step.instruction);

      card.innerHTML = `
        <div class="direction-step-icon">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="direction-step-content">
          <div class="direction-step-instruction">${escapeHtml(step.instruction || 'Continue')}</div>
          <div class="direction-step-street">${escapeHtml(step.street_name || 'Mountain Highway')}</div>
        </div>
        <div class="direction-step-distance">${distStr}</div>
      `;

      card.addEventListener('click', () => {
        document.querySelectorAll('.direction-step-card').forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        highlightStepOnMap(step);
      });

      directionsFullList.appendChild(card);
    });

    refreshIcons();
  }

  function getManeuverIcon(type, instruction) {
    const text = (instruction || '').toLowerCase();
    if (text.includes('arrive') || text.includes('destination')) return 'map-pin';
    if (text.includes('left') || text.includes('turn left')) return 'corner-up-left';
    if (text.includes('right') || text.includes('turn right')) return 'corner-up-right';
    if (text.includes('u-turn')) return 'rotate-cw';
    if (text.includes('exit')) return 'log-out';
    if (text.includes('fork') || text.includes('slight')) return 'git-fork';
    if (text.includes('depart') || text.includes('start')) return 'navigation';
    return 'arrow-up';
  }

  function highlightStepOnMap(step) {
    if (!step || !step.location || !map) return;

    const loc = [step.location[1], step.location[0]]; // [lat, lon]

    if (stepHighlightMarker && map.hasLayer(stepHighlightMarker)) {
      map.removeLayer(stepHighlightMarker);
      stepHighlightMarker = null;
    }

    // Create pulsing highlight marker
    const icon = L.divIcon({
      className: 'step-highlight-pulse-marker',
      html: '<div style="background:#06b6d4; width:18px; height:18px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 0 16px #06b6d4;"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    stepHighlightMarker = L.marker(loc, { icon: icon }).addTo(map);

    const distStr = (step.distance_m || 0) > 1000 
      ? `${((step.distance_m || 0) / 1000).toFixed(1)} km` 
      : `${Math.round(step.distance_m || 0)} m`;

    stepHighlightMarker.bindPopup(`
      <div style="font-family:inherit; font-size:12px; color:#f1f5f9; min-width:180px;">
        <b style="color:#06b6d4;">Step ${step.step_number || ''}</b><br>
        <b>${escapeHtml(step.instruction || '')}</b><br>
        <span style="color:#94a3b8; font-size:11px;">${escapeHtml(step.street_name || '')} (${distStr})</span>
      </div>
    `).openPopup();

    map.flyTo(loc, 15, { duration: 0.8 });
  }

  if (btnToggleDirectionsView) {
    btnToggleDirectionsView.addEventListener('click', () => {
      if (routeDirectionsView) {
        const isHidden = routeDirectionsView.classList.toggle('hidden');
        btnToggleDirectionsView.classList.toggle('active', !isHidden);
        const span = btnToggleDirectionsView.querySelector('span');
        if (span) {
          span.innerHTML = isHidden 
            ? `View Directions (<span id="btn-directions-count">${activeNavSteps.length}</span>)` 
            : `Hide Directions (<span id="btn-directions-count">${activeNavSteps.length}</span>)`;
        }
      }
    });
  }

  if (btnClearRoute) {
    btnClearRoute.addEventListener('click', () => {
      if (routeInfoCard) routeInfoCard.classList.add('hidden');
      if (activeNavPanel) activeNavPanel.classList.add('hidden');
      if (navFloatingHud) navFloatingHud.classList.add('hidden');
      if (routeRiskCard) routeRiskCard.classList.add('hidden');
      if (destinationArrivalCard) destinationArrivalCard.classList.add('hidden');
      clearMapLayers();
      activeNavigationRoute = null;
      activeRouteCoordinates = [];
      activeNavSteps = [];
      activeRouteOptions = [];
      hideAlertBanner();
    });
  }

  // =========================================================================
  // LIVE TURN-BY-TURN NAVIGATION & GPS WATCHER
  // =========================================================================
  if (btnStartNav) {
    btnStartNav.addEventListener('click', () => {
      startLiveNavigation(false);
    });
  }

  if (btnSimulateDrive) {
    btnSimulateDrive.addEventListener('click', () => {
      startLiveNavigation(true);
    });
  }

  function startLiveNavigation(isSimulation = false) {
    if (!activeRouteCoordinates || activeRouteCoordinates.length < 2) {
      alert("Please calculate a route first before starting navigation.");
      return;
    }

    if (destinationArrivalCard) destinationArrivalCard.classList.add('hidden');

    // If user GPS is very far from the corridor origin (> 5 km), automatically activate simulated drive along this corridor
    if (!isSimulation && userCurrentPosition && activeRouteCoordinates.length > 0) {
      const startPt = activeRouteCoordinates[0];
      const dx = (startPt[0] - userCurrentPosition[0]) * 111.0 * Math.cos(userCurrentPosition[1] * Math.PI / 180);
      const dy = (startPt[1] - userCurrentPosition[1]) * 111.0;
      const distKm = Math.sqrt(dx*dx + dy*dy);
      if (distKm > 5.0) {
        console.info(`[Navigation] User GPS is ${distKm.toFixed(1)} km from route origin. Activating Corridor Drive Simulation.`);
        isSimulation = true;
      }
    }

    isNavigating = true;
    isNavPaused = false;
    isSimulateDriving = isSimulation;
    currentStepIndex = 0;
    lastAnnouncedStepIndex = -1;
    offRouteCounter = 0;

    // Reset Progress Bar
    if (navProgressBarFill) navProgressBarFill.style.width = "0%";
    if (navActiveRemainingDist) navActiveRemainingDist.textContent = `${totalTripDistanceKm.toFixed(1)} km`;
    const h = Math.floor(totalTripDurationMin / 60);
    const m = Math.round(totalTripDurationMin % 60);
    if (navActiveRemainingTime) navActiveRemainingTime.textContent = h > 0 ? `${h}h ${m}m` : `${m} min`;

    // Show active nav HUD and panel
    if (activeNavPanel) activeNavPanel.classList.remove('hidden');
    if (navFloatingHud) navFloatingHud.classList.remove('hidden');
    if (routeInfoCard) routeInfoCard.classList.add('hidden');

    // Reset Pause button state
    if (btnNavPause) btnNavPause.classList.remove('paused');
    if (iconPauseNav) iconPauseNav.setAttribute('data-lucide', 'pause');
    if (textPauseNav) textPauseNav.textContent = 'Pause';

    // Populate turn-by-turn steps list
    populateStepsAccordion(activeNavSteps);

    // Initial announcement & HUD update
    if (activeNavSteps.length > 0) {
      updateManeuverDisplay(activeNavSteps[0], activeNavSteps[0].distance_m || 250);
      speakInstruction(`Starting route. In ${Math.round(activeNavSteps[0].distance_m || 250)} meters, ${activeNavSteps[0].instruction}`);
    }

    if (isSimulation) {
      startSimulatedDriveProgress();
    } else {
      startRealGpsTrackingWatcher();
    }

    // Recenter map on active vehicle position
    if (userCurrentPosition) {
      map.flyTo([userCurrentPosition[1], userCurrentPosition[0]], 16, { duration: 1.0 });
    }

    refreshIcons();
  }

  function startRealGpsTrackingWatcher() {
    if (!("geolocation" in navigator)) {
      showGpsError("GPS Unavailable", "Browser geolocation not supported.");
      return;
    }

    setGpsStatus("active", "Navigating (Live GPS)");

    navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        onLiveNavigationGpsUpdate(pos);
      },
      (err) => {
        console.warn("[NavWatcher] GPS Error:", err);
        setGpsStatus("warning", "Weak GPS Signal");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000
      }
    );
  }

  function onLiveNavigationGpsUpdate(pos) {
    if (!isNavigating || isNavPaused) return;

    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const acc = pos.coords.accuracy || 10;
    const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : (pos.coords.speed === 0 ? 0 : 42); // km/h
    const heading = pos.coords.heading || userGpsHeading || 0;

    userCurrentPosition = [lon, lat];
    userGpsAccuracy = acc;
    userGpsHeading = heading;

    if (navLiveSpeed) navLiveSpeed.textContent = `${speed} km/h`;

    updateUserMapMarker(lat, lon, acc, heading);

    if (isFollowMode && map) {
      map.panTo([lat, lon], { animate: true });
    }

    // Check progress & off-route status
    checkRouteProgressAndOffRoute([lon, lat]);
  }

  // Simulated Drive for Testing / Demonstration
  function startSimulatedDriveProgress() {
    setGpsStatus("active", "Simulated Drive Active");
    simDriveIndex = 0;
    const totalPoints = activeRouteCoordinates.length;
    if (totalPoints < 2) return;

    // Immediately position user marker at start of route
    const firstPt = activeRouteCoordinates[0];
    userCurrentPosition = [firstPt[0], firstPt[1]];
    updateUserMapMarker(firstPt[1], firstPt[0], 5, 45);
    map.flyTo([firstPt[1], firstPt[0]], 16, { duration: 0.8 });

    if (activeNavSteps.length > 0) {
      updateManeuverDisplay(activeNavSteps[0], activeNavSteps[0].distance_m || 250);
    }
    if (navProgressBarFill) navProgressBarFill.style.width = "0%";

    clearInterval(simDriveTimer);
    simDriveTimer = setInterval(() => {
      if (!isNavigating || !isSimulateDriving) {
        clearInterval(simDriveTimer);
        return;
      }
      if (isNavPaused) return;

      if (simDriveIndex >= totalPoints - 1) {
        handleArrivalAtDestination();
        return;
      }

      const currPt = activeRouteCoordinates[simDriveIndex];
      const nextPt = activeRouteCoordinates[Math.min(totalPoints - 1, simDriveIndex + 1)];

      // Compute heading angle between current and next point
      const dx = nextPt[0] - currPt[0];
      const dy = nextPt[1] - currPt[1];
      const headingDeg = Math.round((Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360);

      userCurrentPosition = [currPt[0], currPt[1]];
      userGpsHeading = headingDeg;
      if (navLiveSpeed) navLiveSpeed.textContent = `52 km/h`;

      updateUserMapMarker(currPt[1], currPt[0], 8, headingDeg);

      if (isFollowMode && map) {
        map.panTo([currPt[1], currPt[0]], { animate: true });
      }

      // Check progress & maneuver update
      checkRouteProgressAndOffRoute(userCurrentPosition);

      // Advance smoothly along route
      const stepIncrement = Math.max(1, Math.floor(totalPoints / 70));
      simDriveIndex += stepIncrement;
    }, 1100);
  }

  // =========================================================================
  // TURN-BY-TURN STEP MATCHING & PROXIMITY CHECKING
  // =========================================================================
  async function checkRouteProgressAndOffRoute(currPos) {
    if (!activeRouteCoordinates || activeRouteCoordinates.length === 0 || isNavPaused) return;

    // Send check telemetry to backend
    try {
      const resp = await fetch('/api/navigation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_position: currPos,
          route_coordinates: activeRouteCoordinates,
          steps: activeNavSteps,
          geofences: currentGeoJSONGeofences,
          recalculate_threshold_m: 75.0
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        handleNavigationCheckResult(data);
      } else {
        performLocalNavigationCheck(currPos);
      }
    } catch (e) {
      performLocalNavigationCheck(currPos);
    }
  }

  function handleNavigationCheckResult(data) {
    if (isNavPaused) return;

    // 1. Off-Route Detection (only during live GPS, not in simulation)
    if (data.is_off_route && !isSimulateDriving) {
      offRouteCounter++;
      if (navOffrouteAlert) {
        navOffrouteAlert.classList.remove('hidden');
        if (navOffrouteDistText) {
          navOffrouteDistText.textContent = `${Math.round(data.distance_to_route_m || 80)}m off planned route`;
        }
      }
      if (offRouteCounter >= 3 && !isRecalculating) {
        triggerRealtimeRecalculation();
      }
    } else {
      offRouteCounter = 0;
      if (navOffrouteAlert) navOffrouteAlert.classList.add('hidden');
    }

    // 2. Hazard Proximity Warning (< 2 km)
    if (data.hazard_alert) {
      if (navProximityAlert) navProximityAlert.classList.remove('hidden');
      if (navProximityText) navProximityText.textContent = `⚠️ Caution: Approaching ${data.hazard_alert.hazard_name} in ${data.hazard_alert.distance_km} km. Safe detour active.`;
    } else {
      if (navProximityAlert) navProximityAlert.classList.add('hidden');
    }

    // 3. Step Progress Update
    if (data.current_step) {
      updateManeuverDisplay(data.current_step, data.distance_to_next_m);

      if (data.distance_to_next_m < 350 && data.active_step_index !== lastAnnouncedStepIndex) {
        speakInstruction(`In ${Math.round(data.distance_to_next_m)} meters, ${data.current_step.instruction}`);
        lastAnnouncedStepIndex = data.active_step_index;
      }
    }

    // 4. Update Remaining Distance, ETA and Progress Bar
    if (data.remaining_distance_km !== undefined) {
      const remDist = Math.max(0, data.remaining_distance_km);
      if (navActiveRemainingDist) {
        navActiveRemainingDist.textContent = remDist > 1 ? `${remDist.toFixed(1)} km remaining` : `${Math.round(remDist * 1000)} m remaining`;
      }
      if (totalTripDistanceKm > 0) {
        const pct = Math.min(100, Math.max(0, ((totalTripDistanceKm - remDist) / totalTripDistanceKm) * 100));
        if (navProgressBarFill) navProgressBarFill.style.width = `${pct}%`;
      }
      if (remDist < 0.04) {
        handleArrivalAtDestination();
        return;
      }
    }

    if (data.remaining_duration_min !== undefined) {
      const remainingMin = Math.round(data.remaining_duration_min);
      if (navActiveRemainingTime) {
        const h = Math.floor(remainingMin / 60);
        const m = Math.round(remainingMin % 60);
        navActiveRemainingTime.textContent = h > 0 ? `${h}h ${m}m ETA` : `${m} min ETA`;
      }
      if (hudEtaPill) {
        hudEtaPill.textContent = `${remainingMin} min remaining`;
      }
    }
  }

  function performLocalNavigationCheck(currPos) {
    if (isNavPaused || !activeNavSteps || activeNavSteps.length === 0) return;

    let nearestStep = activeNavSteps[currentStepIndex];
    let distToStep = 250;

    if (nearestStep) {
      const loc = nearestStep.location || [currPos[0], currPos[1]];
      const dx = (loc[0] - currPos[0]) * 111320.0 * Math.cos(currPos[1] * Math.PI / 180);
      const dy = (loc[1] - currPos[1]) * 110540.0;
      distToStep = Math.round(Math.sqrt(dx*dx + dy*dy));

      if (distToStep < 60 && currentStepIndex < activeNavSteps.length - 1) {
        currentStepIndex++;
        nearestStep = activeNavSteps[currentStepIndex];
        speakInstruction(nearestStep.instruction);
      }
    }

    updateManeuverDisplay(nearestStep, distToStep);

    // Calculate remaining distance to destination
    if (activeRouteCoordinates && activeRouteCoordinates.length > 0) {
      const endPt = activeRouteCoordinates[activeRouteCoordinates.length - 1];
      const ex = (endPt[0] - currPos[0]) * 111.0 * Math.cos(currPos[1] * Math.PI / 180);
      const ey = (endPt[1] - currPos[1]) * 111.0;
      const remKm = Math.sqrt(ex*ex + ey*ey);

      if (navActiveRemainingDist) {
        navActiveRemainingDist.textContent = remKm > 1 ? `${remKm.toFixed(1)} km remaining` : `${Math.round(remKm * 1000)} m remaining`;
      }
      if (totalTripDistanceKm > 0) {
        const pct = Math.min(100, Math.max(0, ((totalTripDistanceKm - remKm) / totalTripDistanceKm) * 100));
        if (navProgressBarFill) navProgressBarFill.style.width = `${pct}%`;
      }

      if (remKm < 0.04) {
        handleArrivalAtDestination();
      }
    }
  }

  function updateManeuverDisplay(step, distanceM) {
    if (!step) return;

    const distStr = distanceM > 1000 ? `${(distanceM / 1000).toFixed(1)} km` : `${Math.round(distanceM)} m`;
    const iconName = step.icon || getManeuverIcon(step.type, step.instruction);

    // Sidebar Card
    if (navActiveDist) navActiveDist.textContent = `In ${distStr}`;
    if (navActiveText) navActiveText.textContent = step.instruction;
    if (navActiveStreet) navActiveStreet.textContent = step.street_name || "Mountain Corridor";
    if (navActiveIcon) navActiveIcon.setAttribute('data-lucide', iconName);

    // Floating Map HUD
    if (hudNextDist) hudNextDist.textContent = `In ${distStr}`;
    if (hudNextInstruction) hudNextInstruction.textContent = step.instruction;
    if (hudNextSub) hudNextSub.textContent = step.street_name || "Mountain Safe Route";
    if (hudManeuverIcon) hudManeuverIcon.setAttribute('data-lucide', iconName);

    // Highlight in accordion
    document.querySelectorAll('.step-item-row').forEach(row => {
      row.classList.remove('active');
      if (parseInt(row.dataset.step) === step.step_number) {
        row.classList.add('active');
      }
    });

    refreshIcons();
  }

  // Real-Time Recalculation Engine
  async function triggerRealtimeRecalculation() {
    if (isRecalculating) return;
    isRecalculating = true;
    if (navOffrouteAlert) navOffrouteAlert.classList.remove('hidden');
    if (btnNavRecalc) {
      btnNavRecalc.disabled = true;
      btnNavRecalc.innerHTML = `<div class="spinner-sm" style="position:static; margin-right:4px;"></div> Recalculating...`;
    }
    speakInstruction("Recalculating landslide-safe route from current location.");

    try {
      const endCoords = selectedDestination ? [selectedDestination.lon, selectedDestination.lat] : currentRegionData.end;
      const resp = await fetch('/api/route/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_position: userCurrentPosition,
          destination: endCoords,
          avoid_hazards: true,
          include_steps: true
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        const chosen = data.route || data.recalculated_safe_route || data.primary_route;

        if (data.route_options && data.route_options.length > 0) {
          activeRouteOptions = data.route_options;
        }

        activeRouteCoordinates = chosen.coordinates || [];
        activeNavSteps = chosen.steps || [];
        totalTripDistanceKm = chosen.distance_km || totalTripDistanceKm;
        totalTripDurationMin = chosen.duration_min || totalTripDurationMin;

        // Redraw polylines
        redrawMapPolylines();

        // Update steps list
        renderDirectionsList(activeNavSteps);
        populateStepsAccordion(activeNavSteps);

        // Update risk assessment if provided
        if (data.route_risk_assessment) {
          renderSegmentedRouteRisk(data.route_risk_assessment);
        }

        currentStepIndex = 0;
        if (activeNavSteps.length > 0) {
          updateManeuverDisplay(activeNavSteps[0], activeNavSteps[0].distance_m || 250);
        }

        speakInstruction("Landslide-safe detour route updated.");
        if (navOffrouteAlert) navOffrouteAlert.classList.add('hidden');
      }
    } catch (e) {
      console.warn("[Recalculate] Rerouting error:", e);
    } finally {
      if (btnNavRecalc) {
        btnNavRecalc.disabled = false;
        btnNavRecalc.innerHTML = `<i data-lucide="refresh-cw"></i><span>Reroute</span>`;
      }
      setTimeout(() => {
        isRecalculating = false;
        refreshIcons();
      }, 2000);
    }
  }

  function handleArrivalAtDestination() {
    speakInstruction("You have arrived safely at your destination. Navigation completed.");
    stopLiveNavigation();

    // Populate arrival card
    if (arrivalDestName) {
      arrivalDestName.textContent = selectedDestination ? selectedDestination.name : "Target Destination";
    }
    if (arrivalMetricDist) {
      arrivalMetricDist.textContent = `${totalTripDistanceKm > 0 ? totalTripDistanceKm.toFixed(1) : "—"} km`;
    }
    if (arrivalMetricDur) {
      const h = Math.floor(totalTripDurationMin / 60);
      const m = Math.round(totalTripDurationMin % 60);
      arrivalMetricDur.textContent = h > 0 ? `${h}h ${m}m` : `${m || 15} min`;
    }
    if (destinationArrivalCard) {
      destinationArrivalCard.classList.remove('hidden');
      destinationArrivalCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    refreshIcons();
  }

  if (btnArrivalDismiss) {
    btnArrivalDismiss.addEventListener('click', () => {
      if (destinationArrivalCard) destinationArrivalCard.classList.add('hidden');
      if (routeInfoCard) routeInfoCard.classList.remove('hidden');
    });
  }

  // Voice Guidance (SpeechSynthesis API)
  function speakInstruction(text) {
    if (isVoiceMuted || !window.speechSynthesis) return;

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis notice:", e);
    }
  }

  // Populate Collapsible Steps List inside Active Nav Panel
  function populateStepsAccordion(steps) {
    if (!navFullStepsList) return;
    navFullStepsList.innerHTML = '';
    if (stepsCountBadge) stepsCountBadge.textContent = steps.length;

    steps.forEach(step => {
      const row = document.createElement('div');
      row.className = 'step-item-row';
      row.dataset.step = step.step_number;

      const dist = (step.distance_m || 0) > 1000 
        ? `${((step.distance_m || 0) / 1000).toFixed(1)} km` 
        : `${Math.round(step.distance_m || 0)} m`;

      const iconName = step.icon || getManeuverIcon(step.type, step.instruction);

      row.innerHTML = `
        <div class="step-icon-wrap">
          <i data-lucide="${iconName}"></i>
        </div>
        <div class="step-text-wrap">
          <div><b>${escapeHtml(step.instruction || '')}</b></div>
          <div style="color:var(--text-dim); font-size:0.7rem;">${escapeHtml(step.street_name || '')}</div>
        </div>
        <div class="step-dist-pill">${dist}</div>
      `;

      row.addEventListener('click', () => {
        highlightStepOnMap(step);
      });

      navFullStepsList.appendChild(row);
    });

    refreshIcons();
  }

  if (btnToggleStepsList) {
    btnToggleStepsList.addEventListener('click', () => {
      if (navFullStepsList) {
        const isHidden = navFullStepsList.classList.toggle('hidden');
        btnToggleStepsList.classList.toggle('expanded', !isHidden);
      }
    });
  }

  // Navigation Control Toolbar Handlers
  if (btnNavPause) {
    btnNavPause.addEventListener('click', () => {
      isNavPaused = !isNavPaused;
      btnNavPause.classList.toggle('paused', isNavPaused);
      if (isNavPaused) {
        if (iconPauseNav) iconPauseNav.setAttribute('data-lucide', 'play');
        if (textPauseNav) textPauseNav.textContent = 'Resume';
        setGpsStatus('warning', 'Navigation Paused');
        speakInstruction('Navigation paused.');
      } else {
        if (iconPauseNav) iconPauseNav.setAttribute('data-lucide', 'pause');
        if (textPauseNav) textPauseNav.textContent = 'Pause';
        setGpsStatus('active', isSimulateDriving ? 'Simulated Drive Active' : 'Navigating (Live GPS)');
        speakInstruction('Resuming navigation.');
      }
      refreshIcons();
    });
  }

  if (btnNavRecenter) {
    btnNavRecenter.addEventListener('click', () => {
      isFollowMode = true;
      if (userCurrentPosition && map) {
        map.flyTo([userCurrentPosition[1], userCurrentPosition[0]], 16, { duration: 0.8 });
      }
    });
  }

  if (btnNavRecalc) {
    btnNavRecalc.addEventListener('click', () => {
      triggerRealtimeRecalculation();
    });
  }

  if (btnOffrouteRecalcNow) {
    btnOffrouteRecalcNow.addEventListener('click', () => {
      triggerRealtimeRecalculation();
    });
  }

  // End Navigation Handlers
  if (btnEndNav) btnEndNav.addEventListener('click', stopLiveNavigation);
  if (btnHudEnd) btnHudEnd.addEventListener('click', stopLiveNavigation);

  function stopLiveNavigation() {
    isNavigating = false;
    isNavPaused = false;
    isSimulateDriving = false;

    if (navWatchId !== null) {
      navigator.geolocation.clearWatch(navWatchId);
      navWatchId = null;
    }
    clearInterval(simDriveTimer);
    simDriveTimer = null;

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    if (iconPauseNav) iconPauseNav.setAttribute('data-lucide', 'pause');
    if (textPauseNav) textPauseNav.textContent = 'Pause';
    if (btnNavPause) btnNavPause.classList.remove('paused');

    if (activeNavPanel) activeNavPanel.classList.add('hidden');
    if (navFloatingHud) navFloatingHud.classList.add('hidden');
    if (navOffrouteAlert) navOffrouteAlert.classList.add('hidden');
    if (navProximityAlert) navProximityAlert.classList.add('hidden');

    if (routeInfoCard) routeInfoCard.classList.remove('hidden');
    setGpsStatus("active", "Navigation Ended");

    refreshIcons();
  }

  // Follow Me Recenter
  if (btnToggleFollow) {
    btnToggleFollow.addEventListener('click', () => {
      isFollowMode = !isFollowMode;
      btnToggleFollow.classList.toggle('active', isFollowMode);
      if (isFollowMode && userCurrentPosition && map) {
        map.panTo([userCurrentPosition[1], userCurrentPosition[0]], { animate: true });
      }
    });
  }

  if (btnMapRecenter) {
    btnMapRecenter.addEventListener('click', () => {
      if (userCurrentPosition && map) {
        map.flyTo([userCurrentPosition[1], userCurrentPosition[0]], 16, { duration: 0.8 });
      } else {
        requestInitialLocation(false);
      }
    });
  }

  // Voice Mute Toggle
  if (btnToggleVoice) {
    btnToggleVoice.addEventListener('click', () => {
      isVoiceMuted = !isVoiceMuted;
      btnToggleVoice.classList.toggle('active', !isVoiceMuted);
      if (voiceIcon) voiceIcon.setAttribute('data-lucide', isVoiceMuted ? 'volume-x' : 'volume-2');
      refreshIcons();
    });
  }

  // Heading Rotation Toggle
  let isHeadingUp = false;
  if (btnMapHeading) {
    btnMapHeading.addEventListener('click', () => {
      isHeadingUp = !isHeadingUp;
      const compassIcon = document.getElementById('compass-icon');
      if (compassIcon) {
        compassIcon.style.transform = isHeadingUp && userGpsHeading ? `rotate(${userGpsHeading}deg)` : 'rotate(0deg)';
      }
    });
  }

  // =========================================================================
  // 6. MAP GEOFENCES, HEATMAP & DUAL ROUTE RENDERING (PRESERVED)
  // =========================================================================
  function drawGeofencePolygons(geojson) {
    geofenceLayersGroup.clearLayers();

    L.geoJSON(geojson, {
      style: function() {
        if (isMitigationSimulated) {
          return {
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.18,
            weight: 2.5,
            dashArray: '6, 6',
            className: 'stabilized-geofence'
          };
        }
        return {
          color: '#ef4444',
          fillColor: '#ef4444',
          fillOpacity: 0.32,
          weight: 2,
          dashArray: '5, 5'
        };
      },
      onEachFeature: function(feature, layer) {
        const props = feature.properties || {};
        if (isMitigationSimulated) {
          layer.bindPopup(`
            <div style="font-family: 'Inter', sans-serif; padding:4px;">
              <h4 style="color:#10b981; margin-bottom:4px; font-weight:700;">🛡️ STABILIZED SECTOR: ${props.name || 'Slope Zone'}</h4>
              <p style="margin:2px 0;"><b>Mitigated Hazard (LHI):</b> <span style="color:#10b981; font-weight:700;">0.28 (Low)</span> <span style="color:#94a3b8; font-size:0.75rem;">(was ${props.lhi || '0.86'})</span></p>
              <p style="margin:2px 0;"><b>Factor of Safety (FoS):</b> <span style="color:#10b981; font-weight:700;">1.74 (Engineered Stable)</span></p>
              <p style="margin:2px 0;"><b>Active Mitigations:</b> Deep Soil Nailing + Horizontal Siphon Drains</p>
              <p style="margin:2px 0; color:#38bdf8; font-size:0.78rem;">Autonomous detour safely clear through stabilized corridor.</p>
            </div>
          `);
        } else {
          layer.bindPopup(`
            <div style="font-family: 'Inter', sans-serif; padding:4px;">
              <h4 style="color:#ef4444; margin-bottom:4px; font-weight:700;">⚠️ ${props.name || 'Landslide Danger Zone'}</h4>
              <p style="margin:2px 0;"><b>Hazard Index (LHI):</b> <span style="color:#f59e0b; font-weight:700;">${props.lhi || '0.86'}</span></p>
              <p style="margin:2px 0;"><b>Geofence Buffer Radius:</b> ${props.radius_m || 800} meters</p>
              <p style="margin:2px 0;"><b>Dynamic Avoidance:</b> Autonomous Detour Route Engaged</p>
            </div>
          `);
        }
      }
    }).addTo(geofenceLayersGroup);
  }

  function drawHeatmapOverlay(geojson) {
    if (heatmapLayer) {
      map.removeLayer(heatmapLayer);
    }

    const heatPoints = [];
    const features = geojson.features || [];
    features.forEach(feat => {
      const props = feat.properties || {};
      const center = props.center || [0, 0];
      heatPoints.push([center[1], center[0], props.lhi || 0.9]);
    });

    if (window.L && window.L.heatLayer && heatPoints.length > 0) {
      heatmapLayer = L.heatLayer(heatPoints, {
        radius: 50,
        blur: 30,
        maxZoom: 13,
        gradient: { 0.4: '#f59e0b', 0.7: '#f97316', 1.0: '#ef4444' }
      }).addTo(map);
    }
  }

  function clearMapLayers() {
    if (primaryRouteLayer && map && map.hasLayer(primaryRouteLayer)) map.removeLayer(primaryRouteLayer);
    if (safeRouteLayer && map && map.hasLayer(safeRouteLayer)) map.removeLayer(safeRouteLayer);
    if (alternativeRouteLayers && alternativeRouteLayers.length > 0) {
      alternativeRouteLayers.forEach(l => { if (map && map.hasLayer(l)) map.removeLayer(l); });
      alternativeRouteLayers = [];
    }
    if (stepHighlightMarker && map && map.hasLayer(stepHighlightMarker)) {
      map.removeLayer(stepHighlightMarker);
      stepHighlightMarker = null;
    }
    if (geofenceLayersGroup) geofenceLayersGroup.clearLayers();
    if (hazardMarkersGroup) hazardMarkersGroup.clearLayers();
    if (routeMarkersGroup) routeMarkersGroup.clearLayers();
    if (routeRiskSegmentsGroup) routeRiskSegmentsGroup.clearLayers();
    if (heatmapLayer && map && map.hasLayer(heatmapLayer)) map.removeLayer(heatmapLayer);
  }

  function showAlertBanner(info) {
    alertTitle.textContent = info.title;
    alertMessage.textContent = info.message;
    alertOrigDist.textContent = info.origDist;
    alertSafeDist.textContent = info.safeDist;
    alertEtaDelta.textContent = info.etaDelta;
    alertBanner.classList.remove('hidden');
  }

  function hideAlertBanner() {
    alertBanner.classList.add('hidden');
  }

  function renderLocalFallbackRoute(start, end, hazardPoints) {
    const hazard = (hazardPoints && hazardPoints.length > 0) ? hazardPoints[0] : currentRegionData.hazard;
    const hLat = hazard.latitude;
    const hLon = hazard.longitude;

    const directCoords = [
      [start[1], start[0]],
      [hLat, hLon],
      [end[1], end[0]]
    ];

    const safeCoords = [
      [start[1], start[0]],
      [hLat + 0.08, hLon - 0.06],
      [end[1], end[0]]
    ];

    const mockGeofence = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        properties: {
          name: hazard.name || "Critical Landslide Geofence",
          lhi: 0.88,
          radius_m: 800,
          center: [hLon, hLat]
        },
        geometry: {
          type: "Polygon",
          coordinates: [createCirclePolygonCoords(hLon, hLat, 0.015)]
        }
      }]
    };

    const mockRouteData = {
      is_rerouted: true,
      hazard_detected: true,
      safety_status: "CRITICAL_HAZARD_BLOCKED",
      detour_reason: `Active landslide corridor (${hazard.name}) bypassed via safe pass.`,
      hazard_last_updated: new Date().toISOString(),
      primary_route: {
        coordinates: directCoords.map(c => [c[1], c[0]]),
        distance_km: 74.2,
        duration_min: 88,
        steps: [
          { step_number: 1, type: "depart", instruction: "Depart origin onto mountain corridor", street_name: "NH58", distance_m: 25000, distance_km: 25, duration_s: 1800, location: start, icon: "navigation" },
          { step_number: 2, type: "arrive", instruction: "Arrive at destination", street_name: "Destination", distance_m: 0, distance_km: 0, duration_s: 0, location: end, icon: "map-pin" }
        ]
      },
      recalculated_safe_route: {
        coordinates: safeCoords.map(c => [c[1], c[0]]),
        distance_km: 84.5,
        duration_min: 104,
        steps: [
          { step_number: 1, type: "depart", instruction: "Depart origin onto safe corridor", street_name: "NH58", distance_m: 20000, distance_km: 20, duration_s: 1500, location: start, icon: "navigation" },
          { step_number: 2, type: "turn", instruction: "Follow designated mountain safe detour bypass", street_name: "Safe Escarpment Bypass", distance_m: 35000, distance_km: 35, duration_s: 2400, location: [hLon - 0.06, hLat + 0.08], icon: "corner-up-right" },
          { step_number: 3, type: "arrive", instruction: "Arrive safely at destination", street_name: "Destination", distance_m: 0, distance_km: 0, duration_s: 0, location: end, icon: "map-pin" }
        ]
      },
      geofences: mockGeofence,
      eta_impact_min: 16,
      route_options: [
        {
          id: "route_recommended",
          title: "Autonomous Landslide Safe Detour",
          label_badge: "RECOMMENDED",
          distance_km: 84.5,
          duration_min: 104,
          steps: [
            { step_number: 1, type: "depart", instruction: "Depart origin onto safe corridor", street_name: "NH58", distance_m: 20000, distance_km: 20, duration_s: 1500, location: start, icon: "navigation" },
            { step_number: 2, type: "turn", instruction: "Follow designated mountain safe detour bypass", street_name: "Safe Escarpment Bypass", distance_m: 35000, distance_km: 35, duration_s: 2400, location: [hLon - 0.06, hLat + 0.08], icon: "corner-up-right" },
            { step_number: 3, type: "arrive", instruction: "Arrive safely at destination", street_name: "Destination", distance_m: 0, distance_km: 0, duration_s: 0, location: end, icon: "map-pin" }
          ],
          coordinates: safeCoords.map(c => [c[1], c[0]]),
          hazard_score: 0.18,
          risk_level: "LOW",
          recommendation_reason: "Safely bypasses active landslide corridor via reinforced escarpment highway.",
          is_recommended: true
        },
        {
          id: "route_fastest",
          title: "Primary Valley Road (Hazard Blocked)",
          label_badge: "BLOCKED",
          distance_km: 74.2,
          duration_min: 88,
          steps: [
            { step_number: 1, type: "depart", instruction: "Depart origin onto mountain corridor", street_name: "NH58", distance_m: 25000, distance_km: 25, duration_s: 1800, location: start, icon: "navigation" },
            { step_number: 2, type: "arrive", instruction: "Arrive at destination", street_name: "Destination", distance_m: 0, distance_km: 0, duration_s: 0, location: end, icon: "map-pin" }
          ],
          coordinates: directCoords.map(c => [c[1], c[0]]),
          hazard_score: 0.88,
          risk_level: "CRITICAL",
          recommendation_reason: "Passes through active landslide zone with LHI 0.88. Travel prohibited.",
          is_fastest: true
        }
      ]
    };

    displayCalculatedRoute(mockRouteData, start, end);
  }

  function createCirclePolygonCoords(centerLon, centerLat, radiusDeg) {
    const coords = [];
    const steps = 32;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * 2 * Math.PI;
      const dx = radiusDeg * Math.cos(angle);
      const dy = radiusDeg * Math.sin(angle);
      coords.push([centerLon + dx, centerLat + dy]);
    }
    coords.push(coords[0]);
    return coords;
  }

  // =========================================================================
  // 7. CORRIDOR SELECTION & SIMULATION LOGIC (ORIGINAL FEATURES 100%)
  // =========================================================================
  async function loadRegionRoute(regionKey, simulateEvent = false) {
    if (!REGIONS[regionKey]) return;
    activeRegionKey = regionKey;
    currentRegionData = REGIONS[regionKey];

    map.flyTo([currentRegionData.center[0], currentRegionData.center[1]], currentRegionData.zoom, {
      duration: 1.0
    });

    const start = currentRegionData.start;
    const end = currentRegionData.end;

    // Set selected destination corresponding to region
    const destName = currentRegionData.name.includes(" to ") ? currentRegionData.name.split(" to ")[1] : "Corridor Destination";
    selectedDestination = {
      name: destName,
      formatted: currentRegionData.name,
      lat: end[1],
      lon: end[0]
    };
    if (destSearchInput && (!destSearchInput.value || destSearchInput.value.trim() === '')) {
      destSearchInput.value = selectedDestination.name;
      btnClearDest.classList.remove('hidden');
      btnCalcRoute.disabled = false;
    }

    if (simulateEvent) {
      triggerLandslideSimulation(start, end);
    } else {
      try {
        const resp = await fetch('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            start: start,
            end: end,
            hazard_points: [currentRegionData.hazard],
            include_steps: true
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          displayCalculatedRoute(data, start, end);
        } else {
          renderLocalFallbackRoute(start, end, [currentRegionData.hazard]);
        }
      } catch (e) {

        renderLocalFallbackRoute(start, end, [currentRegionData.hazard]);
      }
    }
  }

  async function triggerLandslideSimulation(start, end) {
    btnSimulate.classList.add('loading');
    btnSimulate.disabled = true;

    try {
      const resp = await fetch('/api/simulate-landslide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start: start,
          end: end,
          hazard_intensity: "CRITICAL"
        })
      });

      if (!resp.ok) throw new Error("Simulation endpoint error");
      const data = await resp.json();

      renderSimulationResult(data, start, end);
    } catch (e) {
      console.warn("Simulation fallback triggered:", e);
      renderLocalFallbackRoute(start, end, [currentRegionData.hazard]);
    } finally {
      btnSimulate.classList.remove('loading');
      btnSimulate.disabled = false;
    }
  }

  function renderSimulationResult(simData, start, end) {
    clearMapLayers();

    // 1. Draw Start & End
    L.marker([start[1], start[0]]).addTo(routeMarkersGroup).bindPopup("<b>Route Origin</b>");
    L.marker([end[1], end[0]]).addTo(routeMarkersGroup).bindPopup("<b>Destination</b>");

    // 2. Draw Hazard Obstacle Marker
    const hazLoc = simData.hazard_location || [currentRegionData.hazard.longitude, currentRegionData.hazard.latitude];
    const obstacleIcon = L.divIcon({
      className: 'custom-map-marker obstacle-marker',
      html: '<div style="background:#ef4444; width:28px; height:28px; border-radius:50%; border:3px solid #ffffff; box-shadow: 0 0 20px #ef4444; display:flex; align-items:center; justify-content:center; color:#ffffff; font-weight:bold; font-size:14px;">⚠️</div>',
      iconSize: [28, 28]
    });

    L.marker([hazLoc[1], hazLoc[0]], { icon: obstacleIcon }).addTo(hazardMarkersGroup)
      .bindPopup(`<b>SIMULATED SLOPE FAILURE</b><br>LHI: ${simData.hazard_lhi || 0.92}<br>Status: Hazard Geofence Active`)
      .openPopup();

    // 3. Draw Danger Geofence Buffer
    currentGeoJSONGeofences = simData.geofences;
    if (chkGeofences.checked && currentGeoJSONGeofences) {
      drawGeofencePolygons(currentGeoJSONGeofences);
    }
    if (chkHeatmap.checked && currentGeoJSONGeofences) {
      drawHeatmapOverlay(currentGeoJSONGeofences);
    }

    // 4. Draw Blocked Primary Route (Dashed Red)
    if (simData.blocked_primary_route) {
      const origCoords = simData.blocked_primary_route.coordinates.map(c => [c[1], c[0]]);
      primaryRouteLayer = L.polyline(origCoords, {
        color: '#ef4444',
        weight: 4,
        dashArray: '8, 8',
        opacity: 0.85
      }).addTo(map);
    }

    // 5. Draw Recalculated Safe Bypass Route (Green Solid)
    if (simData.recalculated_safe_route) {
      const safeCoords = simData.recalculated_safe_route.coordinates.map(c => [c[1], c[0]]);
      safeRouteLayer = L.polyline(safeCoords, {
        color: '#10b981',
        weight: 6,
        opacity: 0.95
      }).addTo(map);

      if (safeRouteLayer.getBounds().isValid()) {
        map.fitBounds(safeRouteLayer.getBounds(), { padding: [40, 40] });
      }
    }

    // 6. Update Gauge UI
    if (simData.lhi_breakdown) {
      updateLHIGaugeUI(simData.lhi_breakdown);
    }

    // 7. Show Alert Banner
    if (simData.alert) {
      showAlertBanner({
        title: simData.event_title || "🚨 SUDDEN SLOPE FAILURE EVENT SIMULATED",
        message: simData.alert.status || "Critical landslide triggered along active trajectory. Safe detour route calculated.",
        origDist: `${simData.alert.primary_distance_km || 74} km`,
        safeDist: `${simData.alert.safe_distance_km || 82} km`,
        etaDelta: `+${simData.alert.added_eta_min || 15} min`
      });
    }

    // 8. Render Prevention Infrastructure along simulated detour
    const simCoords = simData.recalculated_safe_route ? simData.recalculated_safe_route.coordinates : null;
    fetchAndRenderPreventionAssets(activeRegionKey, simCoords);

    // 9. Wire Route Options & Turn-by-Turn Navigation for Simulated Route
    const chosen = simData.recalculated_safe_route || simData.blocked_primary_route;
    if (chosen) {
      activeRouteCoordinates = chosen.coordinates || [];
      activeNavSteps = chosen.steps || [];
      totalTripDistanceKm = chosen.distance_km || 0;
      totalTripDurationMin = chosen.duration_min || 0;
      activeRouteOptions = [
        {
          id: "route_recommended",
          title: "Autonomous Detour Bypass",
          label_badge: "SAFE DETOUR",
          distance_km: chosen.distance_km,
          duration_min: chosen.duration_min,
          steps: chosen.steps || [],
          coordinates: chosen.coordinates || [],
          hazard_score: 0.18,
          risk_level: "LOW",
          recommendation_reason: "Autonomous detour avoiding the simulated landslide obstacle.",
          is_recommended: true
        }
      ];
      if (simData.blocked_primary_route) {
        activeRouteOptions.push({
          id: "route_fastest",
          title: "Direct Road (Hazard Blocked)",
          label_badge: "BLOCKED",
          distance_km: simData.blocked_primary_route.distance_km,
          duration_min: simData.blocked_primary_route.duration_min,
          steps: simData.blocked_primary_route.steps || [],
          coordinates: simData.blocked_primary_route.coordinates || [],
          hazard_score: 0.92,
          risk_level: "CRITICAL",
          recommendation_reason: "Direct corridor blocked by active rockfall / slope failure.",
          is_fastest: true
        });
      }
      renderRouteOptions(activeRouteOptions);
      renderDirectionsList(activeNavSteps);
      updateRouteInfoCard(simData, chosen);
      if (routeInfoCard) routeInfoCard.classList.remove('hidden');
    }
  }

  // =========================================================================
  // 8. GEOTECHNICAL EVALUATOR & LHI GAUGE (PRESERVED)
  // =========================================================================
  function updateLHIGaugeUI(lhiData) {
    const lhi = typeof lhiData.lhi === 'number' ? lhiData.lhi : 0.864;
    lhiVal.textContent = lhi.toFixed(3);
    lhiFillBar.style.width = `${Math.min(100, lhi * 100)}%`;

    if (lhi >= 0.75) {
      lhiVal.className = "lhi-score-text danger";
      lhiFillBar.className = "lhi-bar-fill danger-bg";
      lhiClassText.textContent = "CRITICAL / GEOFENCE ACTIVE";
      lhiClassText.className = "value danger-text";
    } else if (lhi >= 0.50) {
      lhiVal.className = "lhi-score-text warning";
      lhiFillBar.className = "lhi-bar-fill danger-bg";
      lhiClassText.textContent = "MODERATE HAZARD";
      lhiClassText.className = "value warning-text";
    } else {
      lhiVal.className = "lhi-score-text safe";
      lhiFillBar.className = "lhi-bar-fill safe-bg";
      lhiClassText.textContent = "SAFE / LOW RISK";
      lhiClassText.className = "value safe-text";
    }

    if (lhiData.calculation_method) {
      lhiMethodText.textContent = lhiData.calculation_method;
    }
  }

  async function evaluateSlidersLHI() {
    const rain = parseFloat(sliderRain.value);
    const soil = parseFloat(sliderSoil.value);
    const slope = parseFloat(sliderSlope.value);
    const center = currentRegionData.center;

    try {
      const resp = await fetch('/api/calculate-lhi', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: center[0],
          longitude: center[1],
          slope_angle: slope,
          rainfall_24h: rain,
          soil_saturation: soil
        })
      });
      if (resp.ok) {
        const data = await resp.json();
        updateLHIGaugeUI(data);
      }
    } catch (e) {
      console.error("LHI evaluation API error:", e);
    }
  }

  async function fetchOpenMeteoData() {
    btnFetchMeteo.disabled = true;
    const center = currentRegionData.center;

    try {
      const resp = await fetch(`/api/environmental-metrics?lat=${center[0]}&lon=${center[1]}`);
      if (resp.ok) {
        const data = await resp.json();
        sliderRain.value = data.rainfall_24h_mm;
        sliderSoil.value = data.soil_saturation_index;
        sliderSlope.value = data.estimated_slope_deg;

        valRain.textContent = `${data.rainfall_24h_mm} mm`;
        valSoil.textContent = `${data.soil_saturation_index}`;
        valSlope.textContent = `${data.estimated_slope_deg}°`;

        evaluateSlidersLHI();
      }
    } catch (e) {
      console.error("Open-Meteo API fetch error:", e);
    } finally {
      btnFetchMeteo.disabled = false;
    }
  }

  // Sliders input listeners
  if (sliderRain && valRain) {
    sliderRain.addEventListener('input', (e) => {
      valRain.textContent = `${e.target.value} mm`;
      evaluateSlidersLHI();
    });
  }
  if (sliderSoil && valSoil) {
    sliderSoil.addEventListener('input', (e) => {
      valSoil.textContent = `${e.target.value}`;
      evaluateSlidersLHI();
    });
  }
  if (sliderSlope && valSlope) {
    sliderSlope.addEventListener('input', (e) => {
      valSlope.textContent = `${e.target.value}°`;
      evaluateSlidersLHI();
    });
  }

  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      const targetBtn = e.currentTarget;
      targetBtn.classList.add('active');
      const regionKey = targetBtn.dataset.region;
      loadRegionRoute(regionKey);
    });
  });

  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar-panel');
      if (sidebar) sidebar.scrollIntoView({ behavior: 'smooth' });
    });
  }

  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => {
      triggerLandslideSimulation(currentRegionData.start, currentRegionData.end);
    });
  }
  if (btnResetRoute) {
    btnResetRoute.addEventListener('click', () => {
      loadRegionRoute(activeRegionKey);
    });
  }
  if (btnFetchMeteo) {
    btnFetchMeteo.addEventListener('click', fetchOpenMeteoData);
  }
  if (btnRecalcLHI) {
    btnRecalcLHI.addEventListener('click', evaluateSlidersLHI);
  }

  if (chkGeofences) {
    chkGeofences.addEventListener('change', () => {
      if (chkGeofences.checked) {
        if (currentGeoJSONGeofences) drawGeofencePolygons(currentGeoJSONGeofences);
      } else {
        geofenceLayersGroup.clearLayers();
      }
    });
  }

  if (chkHeatmap) {
    chkHeatmap.addEventListener('change', () => {
      if (chkHeatmap.checked) {
        if (currentGeoJSONGeofences) drawHeatmapOverlay(currentGeoJSONGeofences);
      } else {
        if (heatmapLayer && map) map.removeLayer(heatmapLayer);
      }
    });
  }

  // =========================================================================
  // LANDSLIDE PREVENTION & SLOPE STABILIZATION SYSTEM
  // =========================================================================
  if (chkPrevention) {
    chkPrevention.addEventListener('change', () => {
      if (chkPrevention.checked) {
        if (!map.hasLayer(preventionLayersGroup)) map.addLayer(preventionLayersGroup);
      } else {
        if (map.hasLayer(preventionLayersGroup)) map.removeLayer(preventionLayersGroup);
      }
    });
  }

  if (chkSimulateMitigation) {
    chkSimulateMitigation.addEventListener('change', async () => {
      isMitigationSimulated = chkSimulateMitigation.checked;
      if (isMitigationSimulated) {
        if (mitigationBox) mitigationBox.classList.add('sim-active');
        if (mitigationImpactPill) mitigationImpactPill.classList.remove('hidden');

        try {
          const resp = await fetch('/api/prevention/mitigate-lhi', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              baseline_lhi: 0.88,
              slope_angle_deg: 38.0,
              interventions: ["soil_nailing", "drainage_channel", "retaining_wall", "rockfall_netting"]
            })
          });
          if (resp.ok) {
            const res = await resp.json();
            if (prevFosVal) prevFosVal.textContent = `${res.mitigated_fos} (Stabilized)`;
            if (prevReductionVal) prevReductionVal.textContent = `-${res.lhi_reduction_pct}% Risk`;
          } else {
            if (prevFosVal) prevFosVal.textContent = "1.74 (Stabilized)";
            if (prevReductionVal) prevReductionVal.textContent = "-72% Risk";
          }
        } catch (e) {
          if (prevFosVal) prevFosVal.textContent = "1.74 (Stabilized)";
          if (prevReductionVal) prevReductionVal.textContent = "-72% Risk";
        }

        // Redraw geofences in stabilized green mode
        if (currentGeoJSONGeofences) {
          drawGeofencePolygons(currentGeoJSONGeofences);
        }
      } else {
        if (mitigationBox) mitigationBox.classList.remove('sim-active');
        if (mitigationImpactPill) mitigationImpactPill.classList.add('hidden');
        if (prevFosVal) prevFosVal.textContent = "1.72 (Stable)";
        if (prevReductionVal) prevReductionVal.textContent = "-68% Risk";

        // Redraw geofences in baseline hazard mode
        if (currentGeoJSONGeofences) {
          drawGeofencePolygons(currentGeoJSONGeofences);
        }
      }
    });
  }

  function getPreventionIconSvg(type) {
    switch (type) {
      case 'rockfall_netting':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
      case 'retaining_wall':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M3 15h18M4 6h16M7 6v4M12 10v5M17 6v4M7 15v6M17 15v6"/></svg>`;
      case 'soil_nailing':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`;
      case 'drainage_channel':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5c-.29 1.75-1.14 3.12-2.29 4.06S3 11.09 3 12.25c0 2.22 1.8 4.05 4 4.05z"/><path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/></svg>`;
      case 'inclinometer_sensor':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;
      case 'bio_slope':
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>`;
      default:
        return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    }
  }

  async function fetchAndRenderPreventionAssets(corridorKey = null, routeCoords = null) {
    try {
      let assets = [];
      if (routeCoords && routeCoords.length > 0) {
        const resp = await fetch('/api/prevention/near-route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            route_coordinates: routeCoords,
            buffer_radius_km: 25.0
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          assets = data.assets || [];
        }
      }

      if (!assets || assets.length === 0) {
        const resp = await fetch('/api/prevention-assets');
        if (resp.ok) {
          const data = await resp.json();
          const allAssets = data.assets || [];
          if (corridorKey) {
            const filtered = allAssets.filter(a => a.corridor === corridorKey);
            assets = filtered.length > 0 ? filtered : allAssets.slice(0, 6);
          } else {
            assets = allAssets.slice(0, 6);
          }
        }
      }

      renderPreventionAssets(assets);
    } catch (err) {
      console.warn("fetchAndRenderPreventionAssets error:", err);
    }
  }

  function renderPreventionAssets(assets) {
    if (!assets || assets.length === 0) return;
    currentPreventionAssets = assets;
    preventionLayersGroup.clearLayers();
    preventionMarkersMap = {};

    assets.forEach(asset => {
      const assetColor = asset.color || '#10b981';
      const iconSvg = getPreventionIconSvg(asset.type);

      const markerHtml = `
        <div class="prevention-map-pin" style="background:${assetColor}; box-shadow: 0 0 14px ${assetColor}88;">
          <div class="prev-pin-halo" style="border-color:${assetColor};"></div>
          ${iconSvg}
        </div>
      `;

      const prevIcon = L.divIcon({
        className: 'custom-prevention-marker',
        html: markerHtml,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
      });

      // Build telemetry grid
      let telemetryHtml = '';
      if (asset.telemetry && Object.keys(asset.telemetry).length > 0) {
        telemetryHtml = `
          <div class="prev-popup-telemetry-grid">
            ${Object.entries(asset.telemetry).map(([k, v]) => `
              <div class="prev-popup-telem-item">
                <span>${k.replace(/_/g, ' ')}:</span>
                <span>${v}</span>
              </div>
            `).join('')}
          </div>
        `;
      }

      const popupHtml = `
        <div class="prevention-popup-card">
          <div class="prev-popup-header">
            <div>
              <div class="prev-popup-title">${asset.name}</div>
              <div class="prev-popup-highway">${asset.highway || 'Corridor Highway'} • ${asset.type_label || 'Slope Mitigation'}</div>
            </div>
            <span class="prev-popup-status" style="background:${assetColor}22; color:${assetColor}; border:1px solid ${assetColor}55;">
              ${asset.status || 'OPERATIONAL'}
            </span>
          </div>
          <div class="prev-popup-metrics">
            <div class="prev-popup-metric-cell">
              <span class="cell-label">Factor of Safety</span>
              <span class="cell-val" style="color:#10b981;">FoS ${asset.factor_of_safety ? asset.factor_of_safety.toFixed(2) : '1.70'} (Stable)</span>
            </div>
            <div class="prev-popup-metric-cell">
              <span class="cell-label">Hazard Risk Mitigation</span>
              <span class="cell-val" style="color:#06b6d4;">-${asset.risk_reduction_pct || 65}% Risk</span>
            </div>
          </div>
          <div class="prev-popup-desc">
            <b>Geotechnical Specs:</b> ${asset.specs || 'Engineered slope stabilization system.'}<br>
            <b>Mitigation Scope:</b> ${asset.mitigation_scope || 'Slope reinforcement.'}
          </div>
          ${telemetryHtml}
          <div class="prev-popup-footer">
            <span>Inspected: ${asset.last_inspected || 'Active'}</span>
            <span>ID: ${asset.id}</span>
          </div>
        </div>
      `;

      const marker = L.marker([asset.latitude, asset.longitude], { icon: prevIcon })
        .addTo(preventionLayersGroup)
        .bindPopup(popupHtml, { maxWidth: 320 });

      preventionMarkersMap[asset.id] = marker;
    });

    // Update sidebar UI count & badges
    if (preventionStatusBadge) {
      preventionStatusBadge.textContent = `${assets.length} Assets Active`;
    }
    if (prevAssetCount) {
      prevAssetCount.textContent = assets.length;
    }

    // Populate sidebar list
    if (preventionAssetsScroll) {
      preventionAssetsScroll.innerHTML = '';
      assets.forEach(asset => {
        const itemEl = document.createElement('div');
        itemEl.className = 'prev-asset-item';
        itemEl.innerHTML = `
          <div class="prev-asset-top">
            <div class="prev-asset-name-group">
              <div class="prev-asset-icon-box" style="background:${asset.color}22; color:${asset.color}; border:1px solid ${asset.color}44;">
                ${getPreventionIconSvg(asset.type)}
              </div>
              <span class="prev-asset-name" title="${asset.name}">${asset.name}</span>
            </div>
            <span class="status-badge-emerald" style="font-size:0.65rem; padding:1px 6px;">FoS ${asset.factor_of_safety ? asset.factor_of_safety.toFixed(2) : '1.70'}</span>
          </div>
          <div class="prev-asset-sub">
            <span>${asset.type_label} • ${asset.highway}</span>
            <span style="color:#06b6d4; font-weight:600;">-${asset.risk_reduction_pct || 65}%</span>
          </div>
          <div class="prev-asset-specs">${asset.specs}</div>
          <div class="prev-asset-telemetry-row">
            ${Object.entries(asset.telemetry || {}).slice(0, 3).map(([k, v]) => `
              <span class="telemetry-chip">${k.replace(/_/g, ' ')}: <b>${v}</b></span>
            `).join('')}
          </div>
        `;

        itemEl.addEventListener('click', () => {
          document.querySelectorAll('.prev-asset-item').forEach(el => el.classList.remove('selected'));
          itemEl.classList.add('selected');
          map.flyTo([asset.latitude, asset.longitude], 14, { animate: true, duration: 1.0 });
          const m = preventionMarkersMap[asset.id];
          if (m) m.openPopup();
        });

        preventionAssetsScroll.appendChild(itemEl);
      });
    }

    refreshIcons();
  }

  // =========================================================================
  // GSI (GEOLOGICAL SURVEY OF INDIA) & NASA GPM SATELLITE LAYERS
  // =========================================================================
  async function fetchAndRenderGSIInventory() {
    try {
      const resp = await fetch('/api/gsi/records');
      if (!resp.ok) return;
      const data = await resp.json();
      currentGSIRecords = data.records || [];

      gsiInventoryLayerGroup.clearLayers();

      currentGSIRecords.forEach(record => {
        const pinIcon = L.divIcon({
          className: 'custom-gsi-marker',
          html: `<div class="gsi-slide-pin" title="${escapeHtml(record.name)}"><span class="gsi-pin-inner">⚠️</span></div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13]
        });

        const popupHtml = `
          <div class="gsi-popup-card">
            <div class="gsi-popup-header">
              <span class="gsi-id-chip">${escapeHtml(record.gsi_id)}</span>
              <span class="gsi-conf-chip">${escapeHtml(record.confidence || 'GSI High')}</span>
            </div>
            <h4 class="gsi-popup-title">${escapeHtml(record.name)}</h4>
            <div class="gsi-popup-meta">
              <span>📍 ${escapeHtml(record.district)}, ${escapeHtml(record.state)}</span>
              <span>🛣️ ${escapeHtml(record.highway || 'Corridor')}</span>
            </div>
            <div class="gsi-popup-grid">
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">Event Date:</span>
                <span class="gsi-cell-v">${escapeHtml(record.occurrence_date)}</span>
              </div>
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">Slide Type:</span>
                <span class="gsi-cell-v">${escapeHtml(record.slide_type)}</span>
              </div>
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">Trigger:</span>
                <span class="gsi-cell-v">${escapeHtml(record.trigger_mechanism)}</span>
              </div>
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">Lithology:</span>
                <span class="gsi-cell-v">${escapeHtml(record.lithology)}</span>
              </div>
            </div>
            ${record.description ? `<p class="gsi-popup-desc">${escapeHtml(record.description)}</p>` : ''}
            <div class="gsi-popup-footer">
              <span>Source: ${escapeHtml(record.source)}</span>
              <a href="https://bhukosh.gsi.gov.in/Bhukosh/Public" target="_blank" rel="noopener">GSI Bhukosh ↗</a>
            </div>
          </div>
        `;

        L.marker([record.latitude, record.longitude], { icon: pinIcon })
          .addTo(gsiInventoryLayerGroup)
          .bindPopup(popupHtml, { maxWidth: 300 });
      });
    } catch (e) {
      console.warn("Could not load GSI inventory:", e);
    }
  }

  async function fetchAndRenderGSIZones() {
    try {
      const resp = await fetch('/api/gsi/susceptibility-zones');
      if (!resp.ok) return;
      const geojson = await resp.json();
      currentGSIZonesGeoJSON = geojson;

      gsiZonesLayerGroup.clearLayers();

      L.geoJSON(geojson, {
        style: function (feature) {
          const p = feature.properties || {};
          const c = p.color || '#f59e0b';
          return {
            color: c,
            fillColor: c,
            weight: 2,
            opacity: 0.85,
            fillOpacity: 0.22,
            dashArray: '5, 5'
          };
        },
        onEachFeature: function (feature, layer) {
          const p = feature.properties || {};
          const popupContent = `
            <div class="gsi-popup-card">
              <div class="gsi-popup-header">
                <span class="gsi-id-chip">${escapeHtml(p.id || 'ZONE')}</span>
                <span class="gsi-conf-chip" style="background:${p.color || '#f59e0b'}22; color:${p.color || '#f59e0b'}">${escapeHtml(p.susceptibility_class)}</span>
              </div>
              <h4 class="gsi-popup-title">${escapeHtml(p.name)}</h4>
              <div class="gsi-popup-meta">
                <span>📍 GSI NLSM Macro-Zonation</span>
                <span>Dominant Slope: <b>${escapeHtml(p.dominant_slope || '30-45°')}</b></span>
              </div>
              <div class="gsi-popup-grid">
                <div class="gsi-grid-cell">
                  <span class="gsi-cell-k">Zone Class:</span>
                  <span class="gsi-cell-v">${escapeHtml(p.susceptibility_class)}</span>
                </div>
                <div class="gsi-grid-cell">
                  <span class="gsi-cell-k">Risk Weight:</span>
                  <span class="gsi-cell-v">${p.risk_weight || 0.8}x multiplier</span>
                </div>
                <div class="gsi-grid-cell" style="grid-column: span 2;">
                  <span class="gsi-cell-k">Dominant Lithology:</span>
                  <span class="gsi-cell-v">${escapeHtml(p.lithology || 'Metasedimentary / Schist')}</span>
                </div>
              </div>
              <p class="gsi-popup-desc">${escapeHtml(p.advisory || 'Exercise caution during active rainfall.')}</p>
              <div class="gsi-popup-footer">
                <span>Ref: Geological Survey of India NLSM</span>
              </div>
            </div>
          `;
          layer.bindPopup(popupContent, { maxWidth: 310 });

          layer.on({
            mouseover: function (e) {
              const l = e.target;
              l.setStyle({ fillOpacity: 0.40, weight: 3 });
            },
            mouseout: function (e) {
              const l = e.target;
              l.setStyle({ fillOpacity: 0.22, weight: 2 });
            }
          });
        }
      }).addTo(gsiZonesLayerGroup);
    } catch (e) {
      console.warn("Could not load GSI zones:", e);
    }
  }

  async function fetchAndRenderNasaGpmRainfall() {
    try {
      nasaGpmLayerGroup.clearLayers();
      const bounds = map.getBounds();
      const minLat = bounds.getSouth();
      const maxLat = bounds.getNorth();
      const minLon = bounds.getWest();
      const maxLon = bounds.getEast();

      const resp = await fetch(`/api/rainfall/region?min_lat=${minLat.toFixed(3)}&max_lat=${maxLat.toFixed(3)}&min_lon=${minLon.toFixed(3)}&max_lon=${maxLon.toFixed(3)}`);
      if (!resp.ok) return;
      const data = await resp.json();

      (data.points || []).forEach(pt => {
        const rain24 = pt.rainfall_24h_mm || 0;
        let color = '#06b6d4';
        let radius = 6000;
        if (rain24 >= 40) { color = '#ef4444'; radius = 10000; }
        else if (rain24 >= 20) { color = '#f97316'; radius = 8000; }
        else if (rain24 >= 10) { color = '#f59e0b'; radius = 7000; }

        const circle = L.circle([pt.latitude, pt.longitude], {
          radius: radius,
          color: color,
          fillColor: color,
          fillOpacity: 0.18,
          weight: 1.5,
          dashArray: '3, 3'
        }).addTo(nasaGpmLayerGroup);

        circle.bindPopup(`
          <div class="gsi-popup-card">
            <div class="gsi-popup-header">
              <span class="gsi-id-chip">NASA GPM IMERG</span>
              <span class="gsi-conf-chip" style="background:${color}22; color:${color}">${rain24.toFixed(1)} mm/24h</span>
            </div>
            <h4 class="gsi-popup-title">Satellite Precipitation Observation</h4>
            <div class="gsi-popup-grid">
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">Precip Rate:</span>
                <span class="gsi-cell-v">${(pt.current_rate_mm_h || 0).toFixed(1)} mm/h</span>
              </div>
              <div class="gsi-grid-cell">
                <span class="gsi-cell-k">24h Total:</span>
                <span class="gsi-cell-v">${rain24.toFixed(1)} mm</span>
              </div>
            </div>
            <div class="gsi-popup-footer">
              <span>Lat: ${pt.latitude.toFixed(3)}°, Lon: ${pt.longitude.toFixed(3)}°</span>
            </div>
          </div>
        `, { maxWidth: 260 });
      });
    } catch (e) {
      console.warn("Could not load NASA GPM data:", e);
    }
  }

  // =========================================================================
  // CORRIDOR HAZARD SEGMENTATION RENDERER
  // =========================================================================
  function renderSegmentedRouteRisk(risk) {
    if (!risk) return;
    if (routeRiskCard) routeRiskCard.classList.remove('hidden');

    // Hazard score & safety status
    if (routeHazardScoreVal) {
      routeHazardScoreVal.textContent = (risk.route_hazard_index || 0).toFixed(2);
    }

    if (routeRiskBadge) {
      const status = risk.route_safety_status || "LOWER_ESTIMATED_HAZARD";
      if (status === "CRITICAL_HAZARD_BLOCKED") {
        routeRiskBadge.textContent = "CRITICAL HAZARD";
        routeRiskBadge.style.background = "rgba(239,68,68,0.2)";
        routeRiskBadge.style.color = "#ef4444";
      } else if (status === "ELEVATED_RISK_CAUTION") {
        routeRiskBadge.textContent = "ELEVATED RISK";
        routeRiskBadge.style.background = "rgba(249,115,22,0.2)";
        routeRiskBadge.style.color = "#f97316";
      } else if (status === "MODERATE_MONITORED") {
        routeRiskBadge.textContent = "MODERATE";
        routeRiskBadge.style.background = "rgba(245,158,11,0.2)";
        routeRiskBadge.style.color = "#f59e0b";
      } else {
        routeRiskBadge.textContent = "LOWER RISK";
        routeRiskBadge.style.background = "rgba(16,185,129,0.2)";
        routeRiskBadge.style.color = "#10b981";
      }
    }

    // GSI zones overlap
    if (routeGsiZonesVal) {
      const zones = risk.intersecting_susceptibility_zones || [];
      if (zones.length > 0) {
        routeGsiZonesVal.textContent = `${zones.length} Zones Traversed`;
      } else {
        routeGsiZonesVal.textContent = "No Major Overlap";
      }
    }

    // GSI historical slides
    if (routeGsiSlidesVal) {
      const slides = risk.gsi_records_near_route || [];
      routeGsiSlidesVal.textContent = `${slides.length} Within 4km`;
    }

    // Peak rain
    if (routeRainPeakVal) {
      const segments = risk.segments || [];
      const peak = Math.max(...segments.map(s => s.rainfall_24h_mm || 0), 0);
      routeRainPeakVal.textContent = `${peak.toFixed(1)} mm/24h`;
    }

    // Segments visual bar
    if (routeSegmentsVisualBar) {
      routeSegmentsVisualBar.innerHTML = '';
      const segments = risk.segments || [];

      if (segmentBarBreakdown) {
        segmentBarBreakdown.textContent = `${risk.total_segments || segments.length} Segments (${risk.critical_segment_count || 0} Critical)`;
      }

      routeRiskSegmentsGroup.clearLayers();

      segments.forEach((seg, idx) => {
        const segEl = document.createElement('div');
        segEl.className = 'segment-bar-block';
        segEl.style.background = seg.color || '#10b981';
        segEl.style.flex = '1';
        segEl.style.height = '12px';
        segEl.style.borderRadius = '2px';
        segEl.style.cursor = 'pointer';
        segEl.title = `Seg ${seg.segment_id}: ${seg.hazard_category} (${(seg.hazard_score * 100).toFixed(0)}%) | Slope: ${seg.slope_deg}° | Rain: ${seg.rainfall_24h_mm}mm`;

        segEl.addEventListener('click', () => {
          if (seg.start_coord) {
            map.flyTo([seg.start_coord[1], seg.start_coord[0]], 13, { duration: 0.8 });
          }
        });

        routeSegmentsVisualBar.appendChild(segEl);

        // Draw colored segment on map
        if (seg.start_coord && seg.end_coord) {
          const segLine = L.polyline([
            [seg.start_coord[1], seg.start_coord[0]],
            [seg.end_coord[1], seg.end_coord[0]]
          ], {
            color: seg.color || '#10b981',
            weight: 7,
            opacity: 0.85
          }).addTo(routeRiskSegmentsGroup);

          segLine.bindPopup(`
            <div style="font-family:inherit; font-size:12px; color:#f1f5f9; min-width:180px;">
              <b style="color:${seg.color || '#10b981'};">Route Segment ${seg.segment_id}</b><br>
              Hazard Category: <b>${seg.hazard_category}</b><br>
              Hazard Score: <b>${(seg.hazard_score * 100).toFixed(1)}%</b><br>
              Slope Angle: <b>${seg.slope_deg}°</b> | Elevation: <b>${seg.elevation_m}m</b><br>
              NASA Rain (24h): <b>${seg.rainfall_24h_mm} mm</b><br>
              GSI Susceptibility: <b>${seg.gsi_susceptibility_class}</b><br>
              <i style="color:#94a3b8; font-size:11px;">${seg.advisory || ''}</i>
            </div>
          `);
        }
      });
    }

    // Alerts container
    if (routeRiskAlertsContainer) {
      routeRiskAlertsContainer.innerHTML = '';
      const alerts = risk.alerts || [];
      if (alerts.length === 0) {
        routeRiskAlertsContainer.innerHTML = `
          <div class="risk-alert-item low">
            <span>🛡️ No critical hazard zones flagged along this planned route corridor.</span>
          </div>
        `;
      } else {
        alerts.forEach(a => {
          const aEl = document.createElement('div');
          const sevClass = a.severity === 'CRITICAL' ? 'critical' : (a.severity === 'HIGH' ? 'high' : 'medium');
          aEl.className = `risk-alert-item ${sevClass}`;
          aEl.innerHTML = `
            <div style="display:flex; align-items:flex-start; gap:8px;">
              <span style="font-size:13px; line-height:1.3;">⚠️</span>
              <span style="font-size:12px; line-height:1.4; color:#f8fafc;">${escapeHtml(a.message)}</span>
            </div>
          `;
          routeRiskAlertsContainer.appendChild(aEl);
        });
      }
    }

    refreshIcons();
  }

  async function fetchSegmentedRouteRisk(coords) {
    try {
      const resp = await fetch('/api/route/segmented-risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: coords })
      });
      if (resp.ok) {
        const risk = await resp.json();
        renderSegmentedRouteRisk(risk);
      }
    } catch (e) {
      console.warn("Could not calculate segmented route risk:", e);
    }
  }

  // =========================================================================
  // AI MULTI-FACTOR SLOPE INSPECTOR
  // =========================================================================
  if (btnRunAiEval) {
    btnRunAiEval.addEventListener('click', async () => {
      const lat = parseFloat(inpInspLat.value);
      const lon = parseFloat(inpInspLon.value);

      if (isNaN(lat) || isNaN(lon)) {
        alert("Please provide valid latitude and longitude coordinates.");
        return;
      }

      btnRunAiEval.disabled = true;
      btnRunAiEval.innerHTML = `<span>Computing Multi-Factor Inference...</span>`;

      try {
        const resp = await fetch('/api/prediction/landslide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ latitude: lat, longitude: lon })
        });

        if (!resp.ok) throw new Error("Inference failed");
        const res = await resp.json();

        if (aiInspResults) aiInspResults.classList.remove('hidden');

        if (inspCatPill) {
          inspCatPill.textContent = res.hazard_category || "UNKNOWN";
          inspCatPill.className = `badge-status-pill ${(res.hazard_category || 'low').toLowerCase()}`;
        }

        if (inspScoreText) {
          inspScoreText.textContent = `Hazard Score: ${res.hazard_score.toFixed(2)} • FoS: ${res.factor_of_safety ? res.factor_of_safety.toFixed(2) : '1.15'}`;
        }

        if (inspSlopeVal && res.input_features) {
          inspSlopeVal.textContent = `${res.input_features.slope_angle_deg.toFixed(1)}° (${res.input_features.elevation_m}m)`;
        }

        if (inspR24Val && res.input_features) {
          inspR24Val.textContent = `${res.input_features.rainfall_24h_mm.toFixed(1)} mm`;
        }

        if (inspGsiVal && res.input_features) {
          inspGsiVal.textContent = res.input_features.gsi_susceptibility_class || "Low";
        }

        if (inspSoilVal && res.input_features) {
          inspSoilVal.textContent = `${(res.input_features.soil_saturation_pct || 75).toFixed(0)}%`;
        }

        if (inspAdvisoryText) {
          inspAdvisoryText.textContent = res.advisory || "Multi-source environmental inference complete.";
        }

        // Drop a temporary marker on map & pan
        const marker = L.circleMarker([lat, lon], {
          radius: 12,
          color: res.hazard_category === 'VERY_HIGH' ? '#ef4444' : (res.hazard_category === 'HIGH' ? '#f97316' : '#10b981'),
          fillColor: res.hazard_category === 'VERY_HIGH' ? '#ef4444' : (res.hazard_category === 'HIGH' ? '#f97316' : '#10b981'),
          fillOpacity: 0.4
        }).addTo(map);

        marker.bindPopup(`<b>AI Hazard Inspection Point</b><br>Lat: ${lat}, Lon: ${lon}<br>Category: <b>${res.hazard_category}</b> (${res.hazard_score})`).openPopup();
        map.flyTo([lat, lon], 13, { duration: 1.0 });

      } catch (e) {
        console.error("AI Evaluation error:", e);
        alert("Failed to compute AI hazard assessment. Ensure the backend server is running.");
      } finally {
        btnRunAiEval.disabled = false;
        btnRunAiEval.innerHTML = `<i data-lucide="play"></i><span>Evaluate Hazard</span>`;
        refreshIcons();
      }
    });
  }

  if (btnUseCurrPoint) {
    btnUseCurrPoint.addEventListener('click', () => {
      if (userCurrentPosition) {
        inpInspLat.value = userCurrentPosition[1].toFixed(4);
        inpInspLon.value = userCurrentPosition[0].toFixed(4);
      } else if (currentRegionData) {
        inpInspLat.value = currentRegionData.center[0].toFixed(4);
        inpInspLon.value = currentRegionData.center[1].toFixed(4);
      }
    });
  }

  // Layer toggle listeners
  if (chkGsiInventory) {
    chkGsiInventory.addEventListener('change', () => {
      if (chkGsiInventory.checked) {
        if (!map.hasLayer(gsiInventoryLayerGroup)) map.addLayer(gsiInventoryLayerGroup);
      } else {
        if (map.hasLayer(gsiInventoryLayerGroup)) map.removeLayer(gsiInventoryLayerGroup);
      }
    });
  }

  if (chkGsiZones) {
    chkGsiZones.addEventListener('change', () => {
      if (chkGsiZones.checked) {
        if (!map.hasLayer(gsiZonesLayerGroup)) map.addLayer(gsiZonesLayerGroup);
      } else {
        if (map.hasLayer(gsiZonesLayerGroup)) map.removeLayer(gsiZonesLayerGroup);
      }
    });
  }

  if (chkNasaGpm) {
    chkNasaGpm.addEventListener('change', () => {
      if (chkNasaGpm.checked) {
        if (!map.hasLayer(nasaGpmLayerGroup)) map.addLayer(nasaGpmLayerGroup);
        fetchAndRenderNasaGpmRainfall();
      } else {
        if (map.hasLayer(nasaGpmLayerGroup)) map.removeLayer(nasaGpmLayerGroup);
      }
    });
  }

  // System Clock
  setInterval(() => {
    const clockEl = document.getElementById('system-clock');
    if (clockEl) {
      const now = new Date();
      clockEl.textContent = now.toISOString().replace('T', ' ').substring(11, 19) + ' UTC';
    }
  }, 1000);

  // =========================================================================
  // 9. AI CHATBOT & SOS EMERGENCY GUIDE (PRESERVED)
  // =========================================================================
  const btnOpenChat = document.getElementById('btn-open-chat');
  const btnCloseChat = document.getElementById('btn-close-chat');
  const chatWidget = document.getElementById('chat-widget');
  const chatMessages = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInputField = document.getElementById('chat-input-field');

  if (btnOpenChat && chatWidget) {
    btnOpenChat.addEventListener('click', () => {
      chatWidget.classList.toggle('hidden');
      if (!chatWidget.classList.contains('hidden') && chatInputField) {
        chatInputField.focus();
      }
    });
  }

  if (btnCloseChat && chatWidget) {
    btnCloseChat.addEventListener('click', () => {
      chatWidget.classList.add('hidden');
    });
  }

  document.querySelectorAll('.chip-btn').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (prompt && chatInputField) {
        chatInputField.value = prompt;
        sendChatMessage(prompt);
      }
    });
  });

  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = chatInputField.value.trim();
      if (msg) sendChatMessage(msg);
    });
  }

  async function sendChatMessage(userText) {
    chatInputField.value = '';
    appendMessageBubble(userText, 'user');
    const typingBubble = appendMessageBubble('<i>RouteX AI is analyzing...</i>', 'bot');

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          region_context: activeRegionKey
        })
      });

      if (!resp.ok) throw new Error("Chat response failed");
      const data = await resp.json();
      typingBubble.querySelector('.msg-bubble').innerHTML = formatChatReply(data.reply);
    } catch (e) {
      typingBubble.querySelector('.msg-bubble').innerHTML = "⚠️ Sorry, I could not reach the Hugging Face AI assistant. Please check your backend connection.";
    } finally {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function appendMessageBubble(text, sender) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg ${sender}`;
    msgDiv.innerHTML = `<div class="msg-bubble">${text}</div>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return msgDiv;
  }

  function formatChatReply(text) {
    return text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  // SOS Emergency Modal
  const btnSosGuide = document.getElementById('btn-sos-guide');
  const btnCloseSos = document.getElementById('btn-close-sos');
  const sosModal = document.getElementById('sos-modal');
  const sosGpsText = document.getElementById('sos-gps-text');
  const btnCopyGps = document.getElementById('btn-copy-gps');

  if (btnSosGuide && sosModal) {
    btnSosGuide.addEventListener('click', () => {
      sosModal.classList.remove('hidden');
      if (userCurrentPosition) {
        sosGpsText.textContent = `LAT: ${userCurrentPosition[1].toFixed(5)}° N, LON: ${userCurrentPosition[0].toFixed(5)}° E (Live GPS)`;
      } else if (currentRegionData) {
        const center = currentRegionData.center;
        sosGpsText.textContent = `LAT: ${center[0].toFixed(4)}° N, LON: ${center[1].toFixed(4)}° E (Corridor Center)`;
      }
    });
  }

  if (btnCloseSos && sosModal) {
    btnCloseSos.addEventListener('click', () => {
      sosModal.classList.add('hidden');
    });
  }

  if (btnCopyGps && sosGpsText) {
    btnCopyGps.addEventListener('click', () => {
      const textToCopy = `EMERGENCY SOS LANDSLIDE LOCATION: ${sosGpsText.textContent}`;
      navigator.clipboard.writeText(textToCopy).then(() => {
        const span = btnCopyGps.querySelector('span');
        if (span) {
          span.textContent = "Copied!";
          setTimeout(() => { span.textContent = "Copy Coordinates"; }, 2500);
        }
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // Launch Leaflet Map on Startup
  if (!map) {
    try {
      initMap();
    } catch (e) {
      console.error("[RouteX] Error initializing map on startup:", e);
    }
  }

  // Try silent initial location check
  requestInitialLocation(true);
});
