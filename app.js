const state = {
  currentEvent: null,
  participants: [],
  draftSlots: new Set(),
  currentParticipantToken: null,
};

const RECENT_EVENTS_KEY = "dispocal:recent-events";
const PREFILL_NAME_KEY = "dispocal:owner-prefill:";
const PARTICIPANT_KEY_PREFIX = "dispocal:participant:";

const dom = {
  createForm: document.querySelector("#create-form"),
  recentEvents: document.querySelector("#recent-events"),
  recentSection: document.querySelector("#recent-section"),
  clearRecent: document.querySelector("#clear-recent"),
  eventSection: document.querySelector("#event-section"),
  eventTitle: document.querySelector("#event-title"),
  eventDescription: document.querySelector("#event-description"),
  eventMeta: document.querySelector("#event-meta"),
  shareLink: document.querySelector("#share-link"),
  copyLink: document.querySelector("#copy-link"),
  backHome: document.querySelector("#back-home"),
  participantForm: document.querySelector("#participant-form"),
  participantName: document.querySelector("#participant-name"),
  participantNote: document.querySelector("#participant-note"),
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
  setDefaultDates();
  bindEvents();
  renderRecentEvents();

  const eventId = new URLSearchParams(window.location.search).get("event");
  if (eventId) {
    loadEvent(eventId, { focus: false });
  }
}

function bindEvents() {
  dom.createForm.addEventListener("submit", handleCreateEvent);
  dom.participantForm.addEventListener("submit", handleSaveAvailability);
  dom.copyLink.addEventListener("click", copyShareLink);
  dom.backHome.addEventListener("click", closeEvent);
  dom.clearRecent.addEventListener("click", clearRecentEvents);
  dom.selectAll.addEventListener("click", () => {
    if (!state.currentEvent) return;
    state.draftSlots = new Set(getAllSlotKeys(state.currentEvent));
    renderEditorGrid();
    showToast("Tous les créneaux ont été cochés.");
  });
  dom.clearAll.addEventListener("click", () => {
    state.draftSlots = new Set();
    renderEditorGrid();
    showToast("Tous les créneaux ont été décochés.");
  });

  window.addEventListener("popstate", () => {
    const eventId = new URLSearchParams(window.location.search).get("event");
    if (eventId) {
      loadEvent(eventId, { focus: false });
    } else {
      closeEvent({ updateUrl: false });
    }
  });
}

function setDefaultDates() {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 6);
  dom.createForm.elements.startDate.value = toDateInputValue(today);
  dom.createForm.elements.endDate.value = toDateInputValue(nextWeek);
}

async function handleCreateEvent(event) {
  event.preventDefault();

  const formData = new FormData(dom.createForm);
  const payload = {
    title: String(formData.get("title") || "").trim(),
    description: String(formData.get("description") || "").trim(),
    startDate: String(formData.get("startDate") || "").trim(),
    endDate: String(formData.get("endDate") || "").trim(),
    dayStartHour: Number(formData.get("dayStartHour")),
    dayEndHour: Number(formData.get("dayEndHour")),
    stepMinutes: Number(formData.get("stepMinutes")),
  };

  const ownerName = String(formData.get("ownerName") || "").trim();

  try {
    setCreateFormDisabled(true);
    const data = await api("/.netlify/functions/create-event", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (ownerName) {
      localStorage.setItem(`${PREFILL_NAME_KEY}${data.event.id}`, ownerName);
    }

    rememberRecentEvent(data.event);
    dom.createForm.reset();
    setDefaultDates();
    showToast("Événement créé.");
    updateUrlForEvent(data.event.id);
    await loadEvent(data.event.id);
  } catch (error) {
    showToast(error.message || "Impossible de créer l’événement.");
  } finally {
    setCreateFormDisabled(false);
  }
}

async function loadEvent(eventId, options = {}) {
  try {
    dom.eventSection.classList.remove("hidden");
    dom.eventTitle.textContent = "Chargement…";
    const data = await api(`/.netlify/functions/event?id=${encodeURIComponent(eventId)}`);

    state.currentEvent = data.event;
    state.participants = Array.isArray(data.participants) ? data.participants : [];
    state.currentParticipantToken = getOrCreateParticipantToken(eventId, false);

    const myEntry = state.participants.find(
      (participant) => participant.participantToken === state.currentParticipantToken,
    );
    const prefillName = localStorage.getItem(`${PREFILL_NAME_KEY}${eventId}`) || "";

    dom.participantName.value = myEntry?.name || prefillName;
    dom.participantNote.value = myEntry?.note || "";
    state.draftSlots = new Set(Array.isArray(myEntry?.slots) ? myEntry.slots : []);

    renderEventDetails();
    renderEditorGrid();
    renderAggregate();
    renderParticipants();
    rememberRecentEvent(data.event);
    renderRecentEvents();

    if (options.focus !== false) {
      dom.eventSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    dom.eventSection.classList.add("hidden");
    showToast(
      error.message ||
        "Impossible de charger cet événement. Vérifie le lien ou déploie le site sur Netlify pour activer les fonctions.",
    );
  }
}

function renderEventDetails() {
  const event = state.currentEvent;
  if (!event) return;

  dom.eventTitle.textContent = event.title;
  dom.eventDescription.textContent = event.description || "Pas de description.";
  dom.shareLink.value = buildShareLink(event.id);
  dom.eventMeta.innerHTML = "";

  const badges = [
    `${formatDate(event.startDate)} → ${formatDate(event.endDate)}`,
    `${event.dayStartHour}h à ${event.dayEndHour}h`,
    event.stepMinutes === 30 ? "Créneaux de 30 min" : "Créneaux de 1h",
    `${state.participants.length} participant${state.participants.length > 1 ? "s" : ""}`,
  ];

  badges.forEach((text) => {
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = text;
    dom.eventMeta.appendChild(badge);
  });
}

function renderEditorGrid() {
  const event = state.currentEvent;
  if (!event) return;

  const dates = getDatesInRange(event.startDate, event.endDate);
  const times = getTimeSlots(event.dayStartHour, event.dayEndHour, event.stepMinutes);
  const allKeys = getAllSlotKeys(event);

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
    button.textContent = allSelected ? "Tout retirer" : "Tout le jour";
    button.addEventListener("click", () => {
      dayKeys.forEach((key) => {
        if (allSelected) {
          state.draftSlots.delete(key);
        } else {
          state.draftSlots.add(key);
        }
      });
      renderEditorGrid();
    });

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
      button.addEventListener("click", () => {
        toggleDraftSlot(key);
      });

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

  const invalidKeys = [...state.draftSlots].filter((key) => !allKeys.includes(key));
  if (invalidKeys.length > 0) {
    state.draftSlots = new Set([...state.draftSlots].filter((key) => allKeys.includes(key)));
  }
}

function renderAggregate() {
  const event = state.currentEvent;
  if (!event) return;

  const dates = getDatesInRange(event.startDate, event.endDate);
  const times = getTimeSlots(event.dayStartHour, event.dayEndHour, event.stepMinutes);
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
          <p class="muted">${participant.slots.length} créneau${participant.slots.length > 1 ? "x" : ""}${participant.note ? ` • ${escapeHtml(participant.note)}` : ""}</p>
        </div>
        <small class="muted">${formatDateTime(participant.updatedAt)}</small>
      `;
      dom.participantsList.appendChild(item);
    });
}

async function handleSaveAvailability(event) {
  event.preventDefault();

  if (!state.currentEvent) return;

  const name = dom.participantName.value.trim();
  const note = dom.participantNote.value.trim();
  if (!name) {
    showToast("Ajoute d’abord ton nom.");
    dom.participantName.focus();
    return;
  }

  const participantToken = getOrCreateParticipantToken(state.currentEvent.id, true);

  try {
    setParticipantFormDisabled(true);
    await api("/.netlify/functions/save-availability", {
      method: "POST",
      body: JSON.stringify({
        eventId: state.currentEvent.id,
        participantToken,
        name,
        note,
        slots: [...state.draftSlots],
      }),
    });

    localStorage.setItem(`${PREFILL_NAME_KEY}${state.currentEvent.id}`, name);
    showToast("Disponibilités enregistrées.");
    await loadEvent(state.currentEvent.id, { focus: false });
  } catch (error) {
    showToast(error.message || "Impossible d’enregistrer les disponibilités.");
  } finally {
    setParticipantFormDisabled(false);
  }
}

function toggleDraftSlot(key) {
  if (state.draftSlots.has(key)) {
    state.draftSlots.delete(key);
  } else {
    state.draftSlots.add(key);
  }
  renderEditorGrid();
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

function getAllSlotKeys(event) {
  const dates = getDatesInRange(event.startDate, event.endDate);
  const times = getTimeSlots(event.dayStartHour, event.dayEndHour, event.stepMinutes);
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

function buildShareLink(eventId) {
  const url = new URL(window.location.href);
  url.searchParams.set("event", eventId);
  url.hash = "";
  return url.toString();
}

function updateUrlForEvent(eventId) {
  const url = new URL(window.location.href);
  url.searchParams.set("event", eventId);
  history.pushState({}, "", url);
}

function closeEvent(options = {}) {
  state.currentEvent = null;
  state.participants = [];
  state.draftSlots = new Set();
  dom.eventSection.classList.add("hidden");

  if (options.updateUrl !== false) {
    const url = new URL(window.location.href);
    url.searchParams.delete("event");
    history.pushState({}, "", url);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function copyShareLink() {
  if (!dom.shareLink.value) return;
  navigator.clipboard
    .writeText(dom.shareLink.value)
    .then(() => showToast("Lien copié."))
    .catch(() => showToast("Impossible de copier le lien automatiquement."));
}

function getOrCreateParticipantToken(eventId, createIfMissing) {
  const key = `${PARTICIPANT_KEY_PREFIX}${eventId}`;
  let token = localStorage.getItem(key);
  if (!token && createIfMissing) {
    token = crypto.randomUUID();
    localStorage.setItem(key, token);
  }
  return token;
}

function rememberRecentEvent(event) {
  const current = readRecentEvents().filter((item) => item.id !== event.id);
  current.unshift({
    id: event.id,
    title: event.title,
    startDate: event.startDate,
    endDate: event.endDate,
    updatedAt: new Date().toISOString(),
  });
  localStorage.setItem(RECENT_EVENTS_KEY, JSON.stringify(current.slice(0, 8)));
}

function readRecentEvents() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_EVENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

function renderRecentEvents() {
  const events = readRecentEvents();
  if (!events.length) {
    dom.recentEvents.className = "stack compact-list empty-state";
    dom.recentEvents.textContent = "Aucun événement récent sur cet appareil.";
    return;
  }

  dom.recentEvents.className = "stack compact-list";
  dom.recentEvents.innerHTML = "";

  events.forEach((event) => {
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHtml(event.title)}</strong>
        <p class="muted">${formatDate(event.startDate)} → ${formatDate(event.endDate)}</p>
      </div>
    `;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-button";
    button.textContent = "Ouvrir";
    button.addEventListener("click", async () => {
      updateUrlForEvent(event.id);
      await loadEvent(event.id);
    });

    item.appendChild(button);
    dom.recentEvents.appendChild(item);
  });
}

function clearRecentEvents() {
  localStorage.removeItem(RECENT_EVENTS_KEY);
  renderRecentEvents();
  showToast("Historique local vidé.");
}

function setCreateFormDisabled(disabled) {
  [...dom.createForm.elements].forEach((element) => {
    element.disabled = disabled;
  });
}

function setParticipantFormDisabled(disabled) {
  dom.participantName.disabled = disabled;
  dom.participantNote.disabled = disabled;
  dom.selectAll.disabled = disabled;
  dom.clearAll.disabled = disabled;
  [...dom.editorGrid.querySelectorAll("button")].forEach((button) => {
    button.disabled = disabled;
  });
  dom.participantForm.querySelector('button[type="submit"]').disabled = disabled;
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
