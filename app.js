const state = {
  currentBoard: null,
  participants: [],
  draftSlots: new Set(),
  currentParticipantToken: null,
  currentName: "",
};

const NAME_KEY = "dispocal:shared-name";
const PARTICIPANT_KEY_PREFIX = "dispocal:participant:";

const dom = {
  welcomeSection: document.querySelector("#welcome-section"),
  welcomeForm: document.querySelector("#welcome-form"),
  welcomeName: document.querySelector("#welcome-name"),
  calendarSection: document.querySelector("#calendar-section"),
  boardTitle: document.querySelector("#board-title"),
  boardDescription: document.querySelector("#board-description"),
  boardMeta: document.querySelector("#board-meta"),
  currentNameBadge: document.querySelector("#current-name-badge"),
  changeName: document.querySelector("#change-name"),
  availabilityForm: document.querySelector("#availability-form"),
  editorSummary: document.querySelector("#editor-summary"),
  editorGrid: document.querySelector("#editor-grid"),
  aggregateSummary: document.querySelector("#aggregate-summary"),
  aggregateGrid: document.querySelector("#aggregate-grid"),
  participantsList: document.querySelector("#participants-list"),
  selectAll: document.querySelector("#select-all"),
  clearAll: document.querySelector("#clear-all"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  bindEvents();
  const savedName = localStorage.getItem(NAME_KEY) || "";
  dom.welcomeName.value = savedName;
}

function bindEvents() {
  dom.welcomeForm.addEventListener("submit", handleWelcomeSubmit);
  dom.availabilityForm.addEventListener("submit", handleSaveAvailability);
  dom.selectAll.addEventListener("click", selectAllSlots);
  dom.clearAll.addEventListener("click", clearAllSlots);
  dom.changeName.addEventListener("click", switchUser);
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();

  const name = dom.welcomeName.value.trim();
  if (!name) {
    showToast("Entre ton nom pour continuer.");
    dom.welcomeName.focus();
    return;
  }

  state.currentName = name;
  localStorage.setItem(NAME_KEY, name);

  try {
    setWelcomeDisabled(true);
    await loadBoard();
    showCalendar();
  } catch (error) {
    showToast(error.message || "Impossible de charger le calendrier.");
  } finally {
    setWelcomeDisabled(false);
  }
}

async function loadBoard(options = {}) {
  const data = await api("/.netlify/functions/board");

  state.currentBoard = data.board;
  state.participants = Array.isArray(data.participants) ? data.participants : [];
  state.currentParticipantToken = getOrCreateParticipantToken(data.board.id, false);

  const myEntry = state.participants.find(
    (participant) => participant.participantToken === state.currentParticipantToken,
  );

  state.draftSlots = new Set(Array.isArray(myEntry?.slots) ? myEntry.slots : []);

  renderBoardDetails();
  renderEditorGrid();
  renderAggregate();
  renderParticipants();

  if (options.toastMessage) {
    showToast(options.toastMessage);
  }
}

function showCalendar() {
  dom.currentNameBadge.textContent = state.currentName;
  dom.welcomeSection.classList.add("hidden");
  dom.calendarSection.classList.remove("hidden");
  dom.calendarSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderBoardDetails() {
  const board = state.currentBoard;
  if (!board) return;

  dom.boardTitle.textContent = board.title;
  dom.boardDescription.textContent = board.description;
  dom.boardMeta.innerHTML = "";

  const badges = [
    `${formatDate(board.startDate)} → ${formatDate(board.endDate)}`,
    `${board.dayStartHour}h à ${board.dayEndHour}h`,
    board.stepMinutes === 30 ? "Créneaux de 30 min" : "Créneaux de 1h",
    `${state.participants.length} participant${state.participants.length > 1 ? "s" : ""}`,
  ];

  badges.forEach((text) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = text;
    dom.boardMeta.appendChild(badge);
  });
}

function renderEditorGrid() {
  const board = state.currentBoard;
  if (!board) return;

  const dates = getDatesInRange(board.startDate, board.endDate);
  const times = getTimeSlots(board.dayStartHour, board.dayEndHour, board.stepMinutes);

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  grid.style.gridTemplateColumns = `120px repeat(${dates.length}, minmax(84px, 1fr))`;

  grid.appendChild(createGridCell("", "grid-head"));
  dates.forEach((date) => grid.appendChild(createGridCell(formatDayHeader(date), "grid-head")));

  grid.appendChild(createGridCell("Journée", "grid-day-tools"));
  dates.forEach((date) => {
    const wrapper = document.createElement("div");
    wrapper.className = "grid-day-tools";
    const dayKeys = times.map((time) => makeSlotKey(date, time.value));
    const allSelected = dayKeys.every((key) => state.draftSlots.has(key));

    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-toggle";
    button.textContent = allSelected ? "Retirer" : "Tout le jour";
    button.addEventListener("click", () => toggleDay(date, times, allSelected));

    const count = document.createElement("small");
    count.className = "muted";
    count.textContent = `${dayKeys.filter((key) => state.draftSlots.has(key)).length}/${dayKeys.length}`;

    wrapper.append(button, count);
    grid.appendChild(wrapper);
  });

  times.forEach((time) => {
    grid.appendChild(createGridCell(time.label, "grid-time"));
    dates.forEach((date) => {
      const key = makeSlotKey(date, time.value);
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      const button = document.createElement("button");
      button.type = "button";
      button.className = `slot-button ${state.draftSlots.has(key) ? "selected" : ""}`;
      button.textContent = state.draftSlots.has(key) ? "✓" : "";
      button.setAttribute("aria-label", `${formatDate(date)} à ${time.label}`);
      button.addEventListener("click", () => toggleDraftSlot(key));

      cell.appendChild(button);
      grid.appendChild(cell);
    });
  });

  dom.editorGrid.innerHTML = "";
  dom.editorGrid.appendChild(grid);

  const fullDays = dates.filter((date) => {
    const dayKeys = times.map((time) => makeSlotKey(date, time.value));
    return dayKeys.every((key) => state.draftSlots.has(key));
  }).length;

  dom.editorSummary.textContent = `${state.draftSlots.size} créneau${state.draftSlots.size > 1 ? "x" : ""} sélectionné${state.draftSlots.size > 1 ? "s" : ""} • ${fullDays} journée${fullDays > 1 ? "s" : ""} complète${fullDays > 1 ? "s" : ""}`;
}

function renderAggregate() {
  const board = state.currentBoard;
  if (!board) return;

  const dates = getDatesInRange(board.startDate, board.endDate);
  const times = getTimeSlots(board.dayStartHour, board.dayEndHour, board.stepMinutes);
  const counts = aggregateCounts(state.participants);
  const maxCount = Math.max(0, ...Object.values(counts));
  const bestSlots = Object.entries(counts)
    .filter(([, count]) => count === maxCount && count > 0)
    .slice(0, 5);

  const legend = document.createElement("div");
  legend.className = "legend";
  legend.innerHTML = `
    <span><i></i> 0</span>
    <span><i class="level-3"></i> moyen</span>
    <span><i class="level-5"></i> maximum</span>
  `;

  const grid = document.createElement("div");
  grid.className = "calendar-grid";
  grid.style.gridTemplateColumns = `120px repeat(${dates.length}, minmax(84px, 1fr))`;

  grid.appendChild(createGridCell("", "grid-head"));
  dates.forEach((date) => grid.appendChild(createGridCell(formatDayHeader(date), "grid-head")));

  grid.appendChild(createGridCell("Total jour", "grid-day-tools"));
  dates.forEach((date) => {
    const dayTotal = times.reduce((sum, time) => sum + (counts[makeSlotKey(date, time.value)] || 0), 0);
    const wrapper = document.createElement("div");
    wrapper.className = "grid-day-tools";
    wrapper.innerHTML = `<strong>${dayTotal}</strong><small class="muted">sélections</small>`;
    grid.appendChild(wrapper);
  });

  times.forEach((time) => {
    grid.appendChild(createGridCell(time.label, "grid-time"));
    dates.forEach((date) => {
      const key = makeSlotKey(date, time.value);
      const count = counts[key] || 0;
      const level = getHeatLevel(count, maxCount);
      const cell = document.createElement("div");
      cell.className = "grid-cell";

      const summary = document.createElement("div");
      summary.className = `summary-cell ${count === 0 ? "none" : ""}`;
      if (count > 0) {
        summary.dataset.level = String(level);
      }
      summary.textContent = String(count);
      summary.title = `${count} personne${count > 1 ? "s" : ""}`;
      cell.appendChild(summary);
      grid.appendChild(cell);
    });
  });

  dom.aggregateGrid.innerHTML = "";
  dom.aggregateGrid.append(legend, grid);

  if (bestSlots.length === 0) {
    dom.aggregateSummary.textContent = "Aucune disponibilité enregistrée pour le moment.";
    return;
  }

  const firstBestSlot = bestSlots[0][0];
  const [bestDate, bestMinutes] = firstBestSlot.split("|");
  dom.aggregateSummary.textContent = `${state.participants.length} participant${state.participants.length > 1 ? "s" : ""} • meilleur créneau actuel : ${formatDate(bestDate)} à ${minutesToLabel(Number(bestMinutes))} (${maxCount} personne${maxCount > 1 ? "s" : ""})`;
}

function renderParticipants() {
  if (!state.participants.length) {
    dom.participantsList.className = "stack compact-list empty-state";
    dom.participantsList.textContent = "Aucun participant pour le moment.";
    return;
  }

  dom.participantsList.className = "stack compact-list";
  dom.participantsList.innerHTML = "";

  [...state.participants]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .forEach((participant) => {
      const item = document.createElement("article");
      item.className = "list-item";
      item.innerHTML = `
        <div>
          <strong>${escapeHtml(participant.name || "Sans nom")}</strong>
          <p class="muted">${participant.slots.length} créneau${participant.slots.length > 1 ? "x" : ""}</p>
        </div>
        <small class="muted">${formatDateTime(participant.updatedAt)}</small>
      `;
      dom.participantsList.appendChild(item);
    });
}

async function handleSaveAvailability(event) {
  event.preventDefault();

  const board = state.currentBoard;
  if (!board) return;
  if (!state.currentName) {
    showToast("Nom manquant.");
    switchUser();
    return;
  }

  const participantToken = getOrCreateParticipantToken(board.id, true);

  try {
    setAvailabilityDisabled(true);
    await api("/.netlify/functions/save-availability", {
      method: "POST",
      body: JSON.stringify({
        participantToken,
        name: state.currentName,
        slots: [...state.draftSlots],
      }),
    });

    await loadBoard({ toastMessage: "Disponibilités enregistrées." });
  } catch (error) {
    showToast(error.message || "Impossible d’enregistrer les disponibilités.");
  } finally {
    setAvailabilityDisabled(false);
  }
}

function selectAllSlots() {
  if (!state.currentBoard) return;
  state.draftSlots = new Set(getAllSlotKeys(state.currentBoard));
  renderEditorGrid();
  showToast("Tous les créneaux ont été cochés.");
}

function clearAllSlots() {
  state.draftSlots = new Set();
  renderEditorGrid();
  showToast("Tous les créneaux ont été décochés.");
}

function toggleDraftSlot(key) {
  if (state.draftSlots.has(key)) {
    state.draftSlots.delete(key);
  } else {
    state.draftSlots.add(key);
  }
  renderEditorGrid();
}

function toggleDay(date, times, allSelected) {
  const dayKeys = times.map((time) => makeSlotKey(date, time.value));
  dayKeys.forEach((key) => {
    if (allSelected) {
      state.draftSlots.delete(key);
    } else {
      state.draftSlots.add(key);
    }
  });
  renderEditorGrid();
}

function switchUser() {
  dom.calendarSection.classList.add("hidden");
  dom.welcomeSection.classList.remove("hidden");
  dom.welcomeName.value = state.currentName || localStorage.getItem(NAME_KEY) || "";
  dom.welcomeName.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function aggregateCounts(participants) {
  return participants.reduce((map, participant) => {
    participant.slots.forEach((slot) => {
      map[slot] = (map[slot] || 0) + 1;
    });
    return map;
  }, {});
}

function getHeatLevel(count, maxCount) {
  if (count <= 0 || maxCount <= 0) return 0;
  const ratio = count / maxCount;
  if (ratio >= 1) return 5;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}

function createGridCell(text, className) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.innerHTML = text;
  return cell;
}

function getDatesInRange(startDate, endDate) {
  const results = [];
  let cursor = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  while (cursor <= end) {
    results.push(toDateInputValue(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return results;
}

function getTimeSlots(dayStartHour, dayEndHour, stepMinutes) {
  const slots = [];
  const start = dayStartHour * 60;
  const end = dayEndHour * 60;

  for (let value = start; value < end; value += stepMinutes) {
    slots.push({ value, label: minutesToLabel(value) });
  }

  return slots;
}

function getAllSlotKeys(board) {
  const dates = getDatesInRange(board.startDate, board.endDate);
  const times = getTimeSlots(board.dayStartHour, board.dayEndHour, board.stepMinutes);
  return dates.flatMap((date) => times.map((time) => makeSlotKey(date, time.value)));
}

function makeSlotKey(date, minutes) {
  return `${date}|${minutes}`;
}

function minutesToLabel(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return `${hours}:${mins}`;
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${dateString}T00:00:00`));
}

function formatDayHeader(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(date);
  const shortDate = new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${capitalize(weekday)}<strong>${shortDate}</strong>`;
}

function formatDateTime(dateString) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOrCreateParticipantToken(boardId, createIfMissing) {
  const key = `${PARTICIPANT_KEY_PREFIX}${boardId}`;
  let token = localStorage.getItem(key);
  if (!token && createIfMissing) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

function setWelcomeDisabled(disabled) {
  [...dom.welcomeForm.elements].forEach((element) => {
    element.disabled = disabled;
  });
}

function setAvailabilityDisabled(disabled) {
  dom.selectAll.disabled = disabled;
  dom.clearAll.disabled = disabled;
  [...dom.editorGrid.querySelectorAll("button")].forEach((button) => {
    button.disabled = disabled;
  });
  dom.availabilityForm.querySelector('button[type="submit"]').disabled = disabled;
}

async function api(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    });
  } catch {
    throw new Error(
      "Les fonctions Netlify ne sont pas joignables ici. Déploie ce projet sur Netlify pour activer l’enregistrement partagé.",
    );
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(data?.error || "Une erreur est survenue.");
  }

  return data;
}

function showToast(message) {
  dom.toast.textContent = message;
  dom.toast.classList.remove("hidden");
  clearTimeout(showToast._timeoutId);
  showToast._timeoutId = setTimeout(() => {
    dom.toast.classList.add("hidden");
  }, 3200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
