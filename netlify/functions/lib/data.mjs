import { getStore } from "@netlify/blobs";

const store = getStore("dispocal-data");
const BOARD_SETTINGS = {
  id: "shared-board",
  title: "DispoCal",
  windowDays: 14,
  dayStartHour: 8,
  dayEndHour: 20,
  stepMinutes: 60,
  timezone: "Europe/Paris",
  minOffsetDays: -60,
  maxOffsetDays: 365,
};

export async function getSharedBoardWithParticipants(startDateInput) {
  const board = getCurrentBoard(startDateInput);
  const participants = await listParticipantsByBoard();
  return { board, participants };
}

export async function upsertAvailability(payload) {
  const clean = validateAvailabilityPayload(payload);
  const board = getCurrentBoard(clean.windowStartDate);
  const allowedSlots = new Set(getAllSlotKeys(board));
  const slots = clean.slots.filter((slot) => allowedSlots.has(slot));
  const key = participantKey(clean.participantToken);
  const existing = await store.get(key, { type: "json" });
  const previousSlots = Array.isArray(existing?.slots) ? existing.slots : [];
  const keptSlots = previousSlots.filter((slot) => !allowedSlots.has(slot));

  const participant = {
    boardId: BOARD_SETTINGS.id,
    participantToken: clean.participantToken,
    name: clean.name,
    slots: [...new Set([...keptSlots, ...slots])],
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(key, participant);
  return { board, participant };
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return jsonResponse({ error: error?.message || "Erreur serveur." }, status);
}

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function validateAvailabilityPayload(payload) {
  const participantToken = String(payload?.participantToken || "").trim();
  const name = String(payload?.name || "").trim();
  const slots = Array.isArray(payload?.slots) ? payload.slots.map((slot) => String(slot)) : [];
  const windowStartDate = String(payload?.windowStartDate || "").trim();

  if (!participantToken) {
    throw createHttpError(400, "Identifiant participant manquant.");
  }

  if (!name) {
    throw createHttpError(400, "Le nom est obligatoire.");
  }

  if (!isDateString(windowStartDate)) {
    throw createHttpError(400, "Période invalide.");
  }

  if (slots.length > 1000) {
    throw createHttpError(400, "Trop de créneaux envoyés.");
  }

  return {
    participantToken,
    name: name.slice(0, 60),
    slots: [...new Set(slots)],
    windowStartDate,
  };
}

async function listParticipantsByBoard() {
  const { blobs } = await store.list({ prefix: participantPrefix() });
  const participants = await Promise.all(blobs.map((entry) => store.get(entry.key, { type: "json" })));

  return participants
    .filter(Boolean)
    .map((participant) => ({
      boardId: participant.boardId,
      participantToken: participant.participantToken,
      name: participant.name,
      slots: Array.isArray(participant.slots) ? participant.slots : [],
      updatedAt: participant.updatedAt,
    }));
}

function getCurrentBoard(startDateInput) {
  const today = getParisDateString();
  const startDate = normalizeStartDate(startDateInput, today);
  const endDate = addDays(startDate, BOARD_SETTINGS.windowDays - 1);

  return {
    id: BOARD_SETTINGS.id,
    title: BOARD_SETTINGS.title,
    startDate,
    endDate,
    windowDays: BOARD_SETTINGS.windowDays,
    dayStartHour: BOARD_SETTINGS.dayStartHour,
    dayEndHour: BOARD_SETTINGS.dayEndHour,
    stepMinutes: BOARD_SETTINGS.stepMinutes,
    timezone: BOARD_SETTINGS.timezone,
  };
}

function normalizeStartDate(startDateInput, today) {
  if (!startDateInput) {
    return today;
  }

  if (!isDateString(startDateInput)) {
    throw createHttpError(400, "Date invalide.");
  }

  const minDate = addDays(today, BOARD_SETTINGS.minOffsetDays);
  const maxDate = addDays(today, BOARD_SETTINGS.maxOffsetDays);

  if (startDateInput < minDate || startDateInput > maxDate) {
    throw createHttpError(400, "Période hors limite.");
  }

  return startDateInput;
}

function participantPrefix() {
  return `participants/${BOARD_SETTINGS.id}/`;
}

function participantKey(participantToken) {
  return `${participantPrefix()}${participantToken}`;
}

function getParisDateString() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BOARD_SETTINGS.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function addDays(dateString, daysToAdd) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + daysToAdd);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getDatesInRange(startDate, endDate) {
  const results = [];
  let cursor = startDate;

  while (cursor <= endDate) {
    results.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return results;
}

function getTimeSlots(dayStartHour, dayEndHour, stepMinutes) {
  const slots = [];
  for (let value = dayStartHour * 60; value < dayEndHour * 60; value += stepMinutes) {
    slots.push(value);
  }
  return slots;
}

function getAllSlotKeys(board) {
  const dates = getDatesInRange(board.startDate, board.endDate);
  const times = getTimeSlots(board.dayStartHour, board.dayEndHour, board.stepMinutes);
  return dates.flatMap((date) => times.map((time) => `${date}|${time}`));
}

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
