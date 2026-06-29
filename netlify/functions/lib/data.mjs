import { getStore } from "@netlify/blobs";

const store = getStore("dispocal-data");
const BOARD_SETTINGS = {
  title: "Disponibilités partagées",
  description: "Planning commun des 14 prochains jours. Chacun indique simplement ses créneaux disponibles.",
  days: 14,
  dayStartHour: 8,
  dayEndHour: 20,
  stepMinutes: 60,
  timezone: "Europe/Paris",
};

export async function getSharedBoardWithParticipants() {
  const board = getCurrentBoard();
  const participants = await listParticipantsByBoard(board.id);
  return { board, participants };
}

export async function upsertAvailability(payload) {
  const clean = validateAvailabilityPayload(payload);
  const board = getCurrentBoard();
  const allowedSlots = new Set(getAllSlotKeys(board));
  const slots = clean.slots.filter((slot) => allowedSlots.has(slot));

  const participant = {
    boardId: board.id,
    participantToken: clean.participantToken,
    name: clean.name,
    slots,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(participantKey(board.id, clean.participantToken), participant);
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

  if (!participantToken) {
    throw createHttpError(400, "Identifiant participant manquant.");
  }

  if (!name) {
    throw createHttpError(400, "Le nom est obligatoire.");
  }

  if (slots.length > 1000) {
    throw createHttpError(400, "Trop de créneaux envoyés.");
  }

  return {
    participantToken,
    name: name.slice(0, 60),
    slots: [...new Set(slots)],
  };
}

async function listParticipantsByBoard(boardId) {
  const { blobs } = await store.list({ prefix: participantPrefix(boardId) });
  const participants = await Promise.all(
    blobs.map((entry) => store.get(entry.key, { type: "json" })),
  );

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

function getCurrentBoard() {
  const startDate = getParisDateString();
  const endDate = addDays(startDate, BOARD_SETTINGS.days - 1);

  return {
    id: `rolling-14-${startDate}`,
    title: BOARD_SETTINGS.title,
    description: BOARD_SETTINGS.description,
    startDate,
    endDate,
    dayStartHour: BOARD_SETTINGS.dayStartHour,
    dayEndHour: BOARD_SETTINGS.dayEndHour,
    stepMinutes: BOARD_SETTINGS.stepMinutes,
    timezone: BOARD_SETTINGS.timezone,
  };
}

function participantPrefix(boardId) {
  return `participants/${boardId}/`;
}

function participantKey(boardId, participantToken) {
  return `${participantPrefix(boardId)}${participantToken}`;
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
