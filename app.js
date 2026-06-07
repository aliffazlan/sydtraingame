const stationData = Array.isArray(window.STATIONS) ? window.STATIONS : [];

const STORAGE_KEY_FOUND = "sydtraingame.found";
const STORAGE_KEY_MISSED = "sydtraingame.missed";
const STORAGE_KEY_RECTS = "sydtraingame.rectOverrides";

// Multiplies the working coordinate space so integer rect coords have finer precision.
// E.g. PRECISION=10 turns a 794-wide map into a 7940-wide coord space.
const COORD_PRECISION = 10;

const state = {
  stations: stationData.map((station) => ({
    ...station,
    rect: null,
    baseRect: null
  })),
  coordSpace: { width: 794 * COORD_PRECISION, height: 1123 * COORD_PRECISION },
  found: new Set(),
  missed: new Set(),
  activeStationId: null,
  recent: [],
  filterLines: new Set(),
  editMode: false,
  editorEnabled: true,
  selectedEditId: null,
  drag: null,
  resize: null
};

const mapImage = document.getElementById("mapImage");
const mapStage = document.getElementById("mapStage");
const mapContent = document.getElementById("mapContent");
const overlayLayer = document.getElementById("overlayLayer");
const editorLayer = document.getElementById("editorLayer");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const statusText = document.getElementById("statusText");
const recentList = document.getElementById("recentList");

const modal = document.getElementById("answerModal");
const answerForm = document.getElementById("answerForm");
const answerInput = document.getElementById("answerInput");
const lineHint = document.getElementById("lineHint");
const feedbackText = document.getElementById("feedbackText");

const resetBtn = document.getElementById("resetBtn");
const hintBtn = document.getElementById("hintBtn");
const skipBtn = document.getElementById("skipBtn");
const closeBtn = document.getElementById("closeBtn");
const toggleEditBtn = document.getElementById("toggleEditBtn");
const exportBtn = document.getElementById("exportBtn");
const saveServerBtn = document.getElementById("saveServerBtn");
const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomResetBtn = document.getElementById("zoomResetBtn");
const zoomLabel = document.getElementById("zoomLabel");
const chips = [...document.querySelectorAll(".chip")];
const editPanel = document.getElementById("editPanel");
const editStationName = document.getElementById("editStationName");
const editX = document.getElementById("editX");
const editY = document.getElementById("editY");
const editW = document.getElementById("editW");
const editH = document.getElementById("editH");
const editAngle = document.getElementById("editAngle");
const applyRectBtn = document.getElementById("applyRectBtn");
const resetRectBtn = document.getElementById("resetRectBtn");

const lineColors = {
  M1: "#0ea5a4",
  T1: "#f59e0b",
  T2: "#0ea5e9",
  T3: "#f97316",
  T4: "#2563eb",
  T5: "#d946ef",
  T6: "#8b5cf6",
  T7: "#6b7280",
  T8: "#16a34a",
  T9: "#ef4444"
};

function canUseServerApi() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function loadAppConfig() {
  if (!canUseServerApi()) return;
  try {
    const response = await fetch(`/api/config?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    if (typeof config.editorEnabled === "boolean") {
      state.editorEnabled = config.editorEnabled;
    }
  } catch {
    // Keep defaults on network/config failure.
  }
}

const view = {
  scale: 1,
  minScale: 1,
  maxScale: 5,
  tx: 0,
  ty: 0,
  isPanning: false,
  pointerId: null,
  startClientX: 0,
  startClientY: 0,
  startTx: 0,
  startTy: 0
};

function getCoordWidth() {
  return state.coordSpace?.width || 794 * COORD_PRECISION;
}

function getCoordHeight() {
  return state.coordSpace?.height || 1123 * COORD_PRECISION;
}

function recomputeCoordSpaceFromRects() {
  const imageW = Math.round((mapImage.naturalWidth || 794) * COORD_PRECISION);
  const imageH = Math.round((mapImage.naturalHeight || 1123) * COORD_PRECISION);
  let maxX = 0;
  let maxY = 0;

  state.stations.forEach((station) => {
    if (!isValidRect(station.rect)) return;
    maxX = Math.max(maxX, station.rect.x + station.rect.w);
    maxY = Math.max(maxY, station.rect.y + station.rect.h);
  });

  state.coordSpace = {
    width: Math.max(imageW, Math.ceil(maxX + 40 * COORD_PRECISION)),
    height: Math.max(imageH, Math.ceil(maxY + 40 * COORD_PRECISION))
  };
}

function normalize(input) {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

function isMatch(guess, station) {
  const value = normalize(guess);
  if (!value) return false;
  const candidates = [station.name, ...(station.aliases || [])];
  return candidates.some((candidate) => {
    const c = normalize(candidate);
    if (value === c) return true;
    if (c.length >= 4 && levenshtein(value, c) <= 1) return true;
    return false;
  });
}

function loadStorage(options = {}) {
  const { rectOverrideMode = "all" } = options; // all | missing-only | none
  try {
    const foundRaw = JSON.parse(localStorage.getItem(STORAGE_KEY_FOUND) || "[]");
    const missedRaw = JSON.parse(localStorage.getItem(STORAGE_KEY_MISSED) || "[]");
    foundRaw.forEach((id) => state.found.add(id));
    missedRaw.forEach((id) => state.missed.add(id));
    if (rectOverrideMode === "none") return;

    const rectRaw = JSON.parse(localStorage.getItem(STORAGE_KEY_RECTS) || "{}");
    state.stations = state.stations.map((station) => {
      if (rectOverrideMode === "missing-only" && isValidRect(station.rect)) return station;
      const rect = rectRaw[station.id];
      if (!isValidRect(rect)) return station;
      const scaled = isLegacyRect(rect) ? scaleRectByPrecision(rect) : rect;
      const migratedRect = migrateStoredRect(scaled);
      if (!isPlausibleRect(migratedRect)) return station;
      return { ...station, rect: sanitizeRect(migratedRect) };
    });
    recomputeCoordSpaceFromRects();
  } catch {
    // Ignore corrupted state
  }
}

function isValidRect(rect) {
  return !!rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.w)
    && Number.isFinite(rect.h)
    && (rect.angle === undefined || Number.isFinite(rect.angle))
    && rect.w > 0
    && rect.h > 0;
}

function sanitizeRect(rect) {
  const nw = getCoordWidth();
  const nh = getCoordHeight();
  return {
    x: Math.max(0, Math.min(nw - 1, Math.round(rect.x))),
    y: Math.max(0, Math.min(nh - 1, Math.round(rect.y))),
    w: Math.max(16, Math.round(rect.w)),
    h: Math.max(12, Math.round(rect.h)),
    angle: Number.isFinite(rect.angle) ? Math.round(rect.angle) : 0
  };
}

function migrateStoredRect(rect) {
  const nw = getCoordWidth();
  const nh = getCoordHeight();

  // Migration path: older/bad saves may store ratios (0..1) instead of pixels.
  if (
    rect.x >= 0 && rect.x <= 1 &&
    rect.y >= 0 && rect.y <= 1 &&
    rect.w > 0 && rect.w <= 1 &&
    rect.h > 0 && rect.h <= 1
  ) {
    return {
      x: rect.x * nw,
      y: rect.y * nh,
      w: rect.w * nw,
      h: rect.h * nh,
      angle: rect.angle
    };
  }

  return rect;
}

function isPlausibleRect(rect) {
  const nw = getCoordWidth();
  const nh = getCoordHeight();

  // Reject obviously collapsed/garbage overlays.
  if (rect.w < 8 || rect.h < 6) return false;
  if (rect.x < 0 || rect.y < 0) return false;
  if (rect.x > nw + 100 * COORD_PRECISION || rect.y > nh + 100 * COORD_PRECISION) return false;
  return true;
}

function isLegacyRect(rect) {
  if (COORD_PRECISION <= 1 || !isValidRect(rect)) return false;
  const legacyW = getCoordWidth() / COORD_PRECISION;
  const legacyH = getCoordHeight() / COORD_PRECISION;
  return rect.x + rect.w <= legacyW * 1.1 && rect.y + rect.h <= legacyH * 1.1;
}

function scaleRectByPrecision(rect) {
  return {
    x: rect.x * COORD_PRECISION,
    y: rect.y * COORD_PRECISION,
    w: rect.w * COORD_PRECISION,
    h: rect.h * COORD_PRECISION,
    angle: rect.angle
  };
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY_FOUND, JSON.stringify([...state.found]));
  localStorage.setItem(STORAGE_KEY_MISSED, JSON.stringify([...state.missed]));
}

function saveRects() {
  const rects = Object.fromEntries(
    state.stations.map((station) => [station.id, station.rect])
  );
  localStorage.setItem(STORAGE_KEY_RECTS, JSON.stringify(rects));
}

function buildRectPayload() {
  return state.stations
    .filter((station) => isValidRect(station.rect))
    .map((station) => ({
      id: station.id,
      name: station.name,
      rect: station.rect
    }));
}

async function loadRectsFromStationsJson() {
  if (!canUseServerApi()) return false;
  try {
    const response = await fetch(`./stations.json?ts=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return false;
    const rows = await response.json();
    if (!Array.isArray(rows)) return false;

    const byId = new Map(rows.map((row) => [row.id, row]));
    const byName = new Map(rows.map((row) => [normalize(row.name || ""), row]));
    state.stations = state.stations.map((station) => {
      const row = byId.get(station.id) || byName.get(normalize(station.name));
      if (!row || !isValidRect(row.rect)) return station;
      const scaled = isLegacyRect(row.rect) ? scaleRectByPrecision(row.rect) : row.rect;
      const migrated = migrateStoredRect(scaled);
      if (!isPlausibleRect(migrated)) return station;
      const clean = sanitizeRect(migrated);
      return { ...station, rect: clean, baseRect: { ...clean } };
    });
    recomputeCoordSpaceFromRects();
    return true;
  } catch {
    return false;
  }
}

function stationById(id) {
  return state.stations.find((station) => station.id === id);
}

function toPercentRect(rect) {
  const nw = getCoordWidth();
  const nh = getCoordHeight();
  const angle = Number.isFinite(rect.angle) ? rect.angle : 0;
  return {
    left: `${(rect.x / nw) * 100}%`,
    top: `${(rect.y / nh) * 100}%`,
    width: `${(rect.w / nw) * 100}%`,
    height: `${(rect.h / nh) * 100}%`,
    transform: `rotate(${angle}deg)`,
    transformOrigin: "top left"
  };
}

function applyFilter(station) {
  if (state.filterLines.size === 0) return true;
  return station.lines.some((line) => state.filterLines.has(line));
}

function refreshFilterChipUI() {
  chips.forEach((chip) => {
    const filter = chip.dataset.filter || "";
    if (filter === "ALL") {
      chip.classList.toggle("is-active", state.filterLines.size === 0);
      return;
    }
    chip.classList.toggle("is-active", state.filterLines.has(filter));
  });
}

function renderOverlays() {
  overlayLayer.innerHTML = "";
  for (const station of state.stations) {
    if (!isValidRect(station.rect)) continue;
    const node = document.createElement("button");
    node.type = "button";
    node.className = "station-overlay";
    node.dataset.id = station.id;
    const styleRect = toPercentRect(station.rect);
    Object.assign(node.style, styleRect);

    if (state.found.has(station.id)) node.classList.add("is-found");
    if (state.missed.has(station.id) && !state.found.has(station.id)) node.classList.add("is-missed");
    if (applyFilter(station)) node.classList.add("is-filter-match");
    if (state.editMode && state.selectedEditId === station.id) node.classList.add("is-selected-edit");

    node.title = state.editMode ? station.name : "Hidden station";

    node.addEventListener("pointerdown", (event) => {
      if (!state.editMode) return;
      event.preventDefault();
      event.stopPropagation();
      selectForEdit(station.id);

      const point = stagePointToImage(event);
      const edge = 12 * COORD_PRECISION;
      const nearRight = point.x >= station.rect.x + station.rect.w - edge;
      const nearBottom = point.y >= station.rect.y + station.rect.h - edge;
      if (nearRight && nearBottom) {
        state.resize = { id: station.id, startX: event.clientX, startY: event.clientY, rect: { ...station.rect } };
      } else {
        state.drag = { id: station.id, startX: event.clientX, startY: event.clientY, rect: { ...station.rect } };
      }
    });

    node.addEventListener("click", () => {
      if (state.editMode) {
        selectForEdit(station.id);
        return;
      }
      openModal(station.id);
    });
    overlayLayer.appendChild(node);
  }
}

function renderEditorLayer() {
  editorLayer.innerHTML = "";
  // Selection highlight now renders directly on the overlay rect.
}

function updateEditPanel() {
  const selected = state.selectedEditId ? stationById(state.selectedEditId) : null;
  const hasSelected = !!selected && isValidRect(selected.rect);
  editStationName.textContent = hasSelected ? selected.name : "No station selected";
  editX.value = hasSelected ? String(selected.rect.x) : "";
  editY.value = hasSelected ? String(selected.rect.y) : "";
  editW.value = hasSelected ? String(selected.rect.w) : "";
  editH.value = hasSelected ? String(selected.rect.h) : "";
  editAngle.value = hasSelected ? String(selected.rect.angle || 0) : "0";
  applyRectBtn.disabled = !hasSelected;
  resetRectBtn.disabled = !hasSelected;
}

function updateProgress() {
  const visibleStations = state.stations.filter((station) => applyFilter(station) && isValidRect(station.rect));
  const foundCount = visibleStations.filter((station) => state.found.has(station.id)).length;
  const total = visibleStations.length;
  const pct = total ? Math.round((foundCount / total) * 100) : 0;
  progressText.textContent = `${foundCount} / ${total} stations (${pct}%)`;
  progressFill.style.width = `${pct}%`;
}

function updateRecent() {
  recentList.innerHTML = "";
  if (!state.recent.length) {
    const item = document.createElement("li");
    item.textContent = "None yet";
    recentList.appendChild(item);
    return;
  }
  state.recent.forEach((name) => {
    const item = document.createElement("li");
    item.textContent = name;
    recentList.appendChild(item);
  });
}

function updateStatus(message) {
  statusText.textContent = message;
}

function openModal(stationId) {
  if (state.found.has(stationId)) return;
  state.activeStationId = stationId;
  const station = stationById(stationId);
  const chipLine = station.lines[0] || "T?";
  const lineColor = lineColors[chipLine] || "#64748b";
  lineHint.textContent = `Line: ${station.lines.join(", ")}`;
  lineHint.style.color = lineColor;
  feedbackText.textContent = "";
  feedbackText.className = "feedback";
  answerInput.value = "";
  modal.hidden = false;
  answerInput.focus();
}

function closeModal() {
  modal.hidden = true;
  state.activeStationId = null;
}

function revealCorrect(station) {
  state.found.add(station.id);
  state.missed.delete(station.id);
  saveProgress();
  state.recent = [station.name, ...state.recent.filter((name) => name !== station.name)].slice(0, 8);
  updateRecent();
  updateProgress();
  updateStatus(`Correct: ${station.name}`);
  renderOverlays();
  closeModal();
}

function revealMissed(station) {
  state.missed.add(station.id);
  saveProgress();
  updateStatus(`Skipped: ${station.name}`);
  feedbackText.textContent = `Answer: ${station.name}`;
  feedbackText.className = "feedback bad";
  renderOverlays();
}

function handleSubmit(event) {
  event.preventDefault();
  const station = stationById(state.activeStationId);
  if (!station) return;
  const guess = answerInput.value.trim();
  if (isMatch(guess, station)) {
    feedbackText.textContent = "Correct!";
    feedbackText.className = "feedback ok";
    setTimeout(() => revealCorrect(station), 120);
  } else {
    feedbackText.textContent = "Not quite, try again.";
    feedbackText.className = "feedback bad";
    answerInput.classList.add("shake");
    setTimeout(() => answerInput.classList.remove("shake"), 300);
  }
}

function showHint() {
  const station = stationById(state.activeStationId);
  if (!station) return;
  feedbackText.textContent = `Hint: starts with "${station.name[0]}"`;
  feedbackText.className = "feedback";
}

function skipCurrent() {
  const station = stationById(state.activeStationId);
  if (!station) return;
  revealMissed(station);
}

function selectForEdit(stationId) {
  state.selectedEditId = stationId;
  updateStatus(`Edit selected: ${stationById(stationId)?.name || stationId}`);
  renderOverlays();
  renderEditorLayer();
  updateEditPanel();
}

function toggleEditMode(forceValue = null) {
  if (!state.editorEnabled) return;
  state.editMode = forceValue ?? !state.editMode;
  editorLayer.hidden = !state.editMode;
  editPanel.hidden = !state.editMode;
  toggleEditBtn.textContent = `Edit mode: ${state.editMode ? "On" : "Off"}`;
  exportBtn.hidden = !state.editMode;
  saveServerBtn.hidden = !state.editMode || !canUseServerApi();
  if (!state.editMode) state.selectedEditId = null;
  renderOverlays();
  renderEditorLayer();
  updateEditPanel();
}

function stagePointToImage(event) {
  const rect = mapStage.getBoundingClientRect();
  const nx = getCoordWidth();
  const ny = getCoordHeight();
  const localX = event.clientX - rect.left;
  const localY = event.clientY - rect.top;
  const contentX = (localX - view.tx) / view.scale;
  const contentY = (localY - view.ty) / view.scale;
  const x = (contentX / rect.width) * nx;
  const y = (contentY / rect.height) * ny;
  return { x, y };
}

function updateZoomLabel() {
  zoomLabel.textContent = `${Math.round(view.scale * 100)}%`;
}

function clampView() {
  const rect = mapStage.getBoundingClientRect();
  const scaledW = rect.width * view.scale;
  const scaledH = rect.height * view.scale;

  const padX = rect.width * 0.35;
  const padY = rect.height * 0.35;
  const minTx = Math.min(0, rect.width - scaledW) - padX;
  const minTy = Math.min(0, rect.height - scaledH) - padY;
  const maxTx = padX;
  const maxTy = padY;

  view.tx = Math.min(maxTx, Math.max(minTx, view.tx));
  view.ty = Math.min(maxTy, Math.max(minTy, view.ty));
}

function applyView() {
  clampView();
  mapContent.style.transform = `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`;
  updateZoomLabel();
}

function setZoom(nextScale, clientX = null, clientY = null) {
  const clamped = Math.min(view.maxScale, Math.max(view.minScale, nextScale));
  if (clamped === view.scale) return;

  const rect = mapStage.getBoundingClientRect();
  const pivotX = clientX === null ? rect.left + rect.width / 2 : clientX;
  const pivotY = clientY === null ? rect.top + rect.height / 2 : clientY;
  const localX = pivotX - rect.left;
  const localY = pivotY - rect.top;

  const worldX = (localX - view.tx) / view.scale;
  const worldY = (localY - view.ty) / view.scale;

  view.scale = clamped;
  view.tx = localX - worldX * view.scale;
  view.ty = localY - worldY * view.scale;
  applyView();
}

function resetView() {
  view.scale = 1;
  view.tx = 0;
  view.ty = 0;
  applyView();
}

function startPan(event) {
  view.isPanning = true;
  view.pointerId = event.pointerId;
  view.startClientX = event.clientX;
  view.startClientY = event.clientY;
  view.startTx = view.tx;
  view.startTy = view.ty;
  mapContent.classList.add("is-panning");
  if (mapContent.setPointerCapture) {
    mapContent.setPointerCapture(event.pointerId);
  }
}

function movePan(event) {
  if (!view.isPanning || event.pointerId !== view.pointerId) return;
  const dx = event.clientX - view.startClientX;
  const dy = event.clientY - view.startClientY;
  view.tx = view.startTx + dx;
  view.ty = view.startTy + dy;
  applyView();
}

function endPan(event) {
  if (!view.isPanning || event.pointerId !== view.pointerId) return;
  view.isPanning = false;
  mapContent.classList.remove("is-panning");
  if (mapContent.releasePointerCapture) {
    mapContent.releasePointerCapture(event.pointerId);
  }
  view.pointerId = null;
}

function setRect(id, rect) {
  const station = stationById(id);
  if (!station) return;
  station.rect = sanitizeRect(rect);
  recomputeCoordSpaceFromRects();
}

function applyEditInputs() {
  if (!state.selectedEditId) return;
  const station = stationById(state.selectedEditId);
  if (!station) return;

  setRect(station.id, {
    x: Number(editX.value),
    y: Number(editY.value),
    w: Number(editW.value),
    h: Number(editH.value),
    angle: Number(editAngle.value)
  });
  saveRects();
  renderOverlays();
  renderEditorLayer();
  updateEditPanel();
  updateStatus(`Updated rect for ${station.name}`);
}

function resetSelectedRect() {
  if (!state.selectedEditId) return;
  const station = stationById(state.selectedEditId);
  if (!station) return;
  if (!isValidRect(station.baseRect)) {
    updateStatus(`No baseline rect in stations.json for ${station.name}`);
    return;
  }
  station.rect = { ...station.baseRect };
  recomputeCoordSpaceFromRects();
  saveRects();
  renderOverlays();
  renderEditorLayer();
  updateEditPanel();
  updateStatus(`Reset rect for ${station.name}`);
}

function attachEditHandlers() {
  mapImage.addEventListener("dragstart", (event) => event.preventDefault());
  mapContent.addEventListener("dragstart", (event) => event.preventDefault());

  const mapControls = mapStage.querySelector(".map-controls");
  if (mapControls) {
    mapControls.addEventListener("pointerdown", (event) => event.stopPropagation());
    mapControls.addEventListener("mousedown", (event) => event.stopPropagation());
    mapControls.addEventListener("click", (event) => event.stopPropagation());
  }

  mapStage.addEventListener("wheel", (event) => {
    event.preventDefault();
    const intensity = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(view.scale * intensity, event.clientX, event.clientY);
  }, { passive: false });

  mapStage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    const isOverlay = target instanceof HTMLElement && target.classList.contains("station-overlay");
    const isMapControl = target instanceof HTMLElement && target.closest(".map-controls");
    if (isMapControl) return;
    if (!state.editMode && !isOverlay) {
      startPan(event);
    } else if (state.editMode && !isOverlay) {
      startPan(event);
    }
  });

  mapStage.addEventListener("pointermove", movePan);
  mapStage.addEventListener("pointerup", endPan);
  mapStage.addEventListener("pointercancel", endPan);

  mapStage.addEventListener("pointermove", (event) => {
    if (!state.editMode) return;
    if (state.drag) {
      const station = stationById(state.drag.id);
      if (!station) return;
      const p0 = stagePointToImage({ clientX: state.drag.startX, clientY: state.drag.startY });
      const p1 = stagePointToImage(event);
      setRect(station.id, {
        ...state.drag.rect,
        x: state.drag.rect.x + (p1.x - p0.x),
        y: state.drag.rect.y + (p1.y - p0.y)
      });
      renderOverlays();
      renderEditorLayer();
      updateEditPanel();
    } else if (state.resize) {
      const station = stationById(state.resize.id);
      if (!station) return;
      const p0 = stagePointToImage({ clientX: state.resize.startX, clientY: state.resize.startY });
      const p1 = stagePointToImage(event);
      setRect(station.id, {
        ...state.resize.rect,
        w: state.resize.rect.w + (p1.x - p0.x),
        h: state.resize.rect.h + (p1.y - p0.y)
      });
      renderOverlays();
      renderEditorLayer();
      updateEditPanel();
    }
  });

  mapStage.addEventListener("pointerup", () => {
    if (state.drag || state.resize) saveRects();
    state.drag = null;
    state.resize = null;
  });
}

function exportRects() {
  const payload = buildRectPayload();
  const json = JSON.stringify(payload, null, 2);
  navigator.clipboard.writeText(json)
    .then(() => updateStatus("Copied rect JSON to clipboard."))
    .catch(() => updateStatus("Clipboard blocked. Copy from console output."));
  console.log(json);
}

async function saveRectsToServer() {
  if (!canUseServerApi()) {
    updateStatus("Server save unavailable in file mode. Use Export rects instead.");
    return;
  }
  const payload = buildRectPayload();
  saveServerBtn.disabled = true;
  try {
    const response = await fetch("/api/stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    updateStatus("Saved rects to server stations.json");
  } catch (error) {
    updateStatus(`Save failed: ${error.message}`);
  } finally {
    saveServerBtn.disabled = false;
  }
}

function handleKeydown(event) {
  if (event.key === "Escape" && !modal.hidden) {
    closeModal();
    return;
  }
  if (state.editorEnabled && event.key.toLowerCase() === "e" && event.target === document.body) {
    toggleEditMode();
  }
  if (!state.editMode || !state.selectedEditId) return;
  const station = stationById(state.selectedEditId);
  if (!station) return;

  let changed = false;
  if (event.key === "ArrowLeft") {
    station.rect.x -= event.shiftKey ? 5 : 1;
    changed = true;
  } else if (event.key === "ArrowRight") {
    station.rect.x += event.shiftKey ? 5 : 1;
    changed = true;
  } else if (event.key === "ArrowUp") {
    station.rect.y -= event.shiftKey ? 5 : 1;
    changed = true;
  } else if (event.key === "ArrowDown") {
    station.rect.y += event.shiftKey ? 5 : 1;
    changed = true;
  }
  if (changed) {
    event.preventDefault();
    station.rect = sanitizeRect(station.rect);
    saveRects();
    renderOverlays();
    renderEditorLayer();
    updateEditPanel();
  }
}

function handleReset() {
  if (!window.confirm("Reset all found/missed stations?")) return;
  state.found.clear();
  state.missed.clear();
  state.recent = [];
  saveProgress();
  renderOverlays();
  updateProgress();
  updateRecent();
  updateStatus("Game reset.");
}

function bindUI() {
  answerForm.addEventListener("submit", handleSubmit);
  hintBtn.addEventListener("click", showHint);
  skipBtn.addEventListener("click", skipCurrent);
  closeBtn.addEventListener("click", closeModal);
  resetBtn.addEventListener("click", handleReset);
  toggleEditBtn.addEventListener("click", () => toggleEditMode());
  exportBtn.addEventListener("click", exportRects);
  saveServerBtn.addEventListener("click", saveRectsToServer);
  zoomInBtn.addEventListener("click", () => setZoom(view.scale * 1.2));
  zoomOutBtn.addEventListener("click", () => setZoom(view.scale / 1.2));
  zoomResetBtn.addEventListener("click", resetView);
  applyRectBtn.addEventListener("click", applyEditInputs);
  resetRectBtn.addEventListener("click", resetSelectedRect);
  document.addEventListener("keydown", handleKeydown);

  if (!state.editorEnabled) {
    toggleEditBtn.hidden = true;
    exportBtn.hidden = true;
    saveServerBtn.hidden = true;
    editPanel.hidden = true;
    state.editMode = false;
  } else if (!canUseServerApi()) {
    saveServerBtn.hidden = true;
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const filter = chip.dataset.filter || "ALL";
      if (filter === "ALL") {
        state.filterLines.clear();
      } else if (state.filterLines.has(filter)) {
        state.filterLines.delete(filter);
      } else {
        state.filterLines.add(filter);
      }
      refreshFilterChipUI();
      renderOverlays();
      updateProgress();
      const active = [...state.filterLines];
      updateStatus(active.length ? `Filters: ${active.join(", ")}` : "Filters cleared (all lines)");
    });
  });
}

async function init() {
  if (!stationData.length) {
    updateStatus("Failed to load station data. Ensure stations.js is loaded.");
    return;
  }
  await loadAppConfig();
  if (mapImage.naturalWidth > 0 && mapImage.naturalHeight > 0) {
    state.coordSpace = {
      width: Math.round(mapImage.naturalWidth) * COORD_PRECISION,
      height: Math.round(mapImage.naturalHeight) * COORD_PRECISION
    };
    mapStage.style.setProperty("--map-aspect-ratio", `${mapImage.naturalWidth} / ${mapImage.naturalHeight}`);
  }
  const loadedFromJson = await loadRectsFromStationsJson();
  loadStorage({ rectOverrideMode: loadedFromJson ? "missing-only" : "all" });
  saveRects();
  bindUI();
  attachEditHandlers();
  refreshFilterChipUI();
  applyView();
  renderOverlays();
  updateProgress();
  updateRecent();
  updateEditPanel();
  closeModal();
  const rectCount = state.stations.filter((station) => isValidRect(station.rect)).length;
  const missingCount = state.stations.length - rectCount;
  updateStatus(
    rectCount
      ? (loadedFromJson
        ? `Loaded ${rectCount} rects (${missingCount} missing). Click a hidden label to guess the station.`
        : "Click a hidden label to guess the station.")
      : "No station rects loaded. Add rects to stations.json first."
  );
}

if (mapImage.complete) {
  void init();
} else {
  mapImage.addEventListener("load", () => { void init(); }, { once: true });
}
