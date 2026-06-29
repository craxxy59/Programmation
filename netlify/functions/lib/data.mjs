import { getStore } from "@netlify/blobs";

const store = getStore("dispocal-data");

export async function createEvent(payload) {
  const clean = validateEventPayload(payload);
  const id = `${slugify(clean.title).slice(0, 40) || "event"}-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const event = {
    id,
    ...clean,
    createdAt: now,
    updatedAt: now,
  };

  await store.setJSON(eventKey(id), event, { onlyIfNew: true });
  return event;
}

export async function getEventById(id) {
  const event = await store.get(eventKey(id), { type: "json" });
  return event;
}

export async function listParticipantsByEvent(eventId) {
  const { blobs } = await store.list({ prefix: participantPrefix(eventId) });
  const participants = await Promise.all(
    blobs.map((entry) => store.get(entry.key, { type: "json" })),
  );

  return participants
    .filter(Boolean)
    .map((participant) => ({
      eventId: participant.eventId,
      participantToken: participant.participantToken,
      name: participant.name,
      note: participant.note || "",
      slots: Array.isArray(participant.slots) ? participant.slots : [],
      updatedAt: participant.updatedAt,
    }));
}

export async function upsertAvailability(payload) {
  const clean = validateAvailabilityPayload(payload);
  const event = await getEventById(clean.eventId);

  if (!event) {
    throw createHttpError(404, "Événement introuvable.");
  }

  const allowedSlots = new Set(getAllSlotKeys(event));
  const slots = clean.slots.filter((slot) => allowedSlots.has(slot));

  const participant = {
    eventId: clean.eventId,
    participantToken: clean.participantToken,
    name: clean.name,
    note: clean.note,
    slots,
    updatedAt: new Date().toISOString(),
  };

  await store.setJSON(participantKey(clean.eventId, clean.participantToken), participant);
  return participant;
}

export function createHttpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
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
  return jsonResponse(
    {
      error: error?.message || "Erreur serveur.",
    },
    status,
  );
}

function validateEventPayload(payload) {
  const title = String(payload?.title || "").trim();
  const description = String(payload?.description || "").trim();
  const startDate = String(payload?.startDate || "").trim();
  const endDate = String(payload?.endDate || "").trim();
  const dayStartHour = Number(payload?.dayStartHour);
  const dayEndHour = Number(payload?.dayEndHour);
  const stepMinutes = Number(payload?.stepMinutes);

  if (!title) {
    throw createHttpError(400, "Le titre est obligatoire.");
  }

  if (!isDateString(startDate) || !isDateString(endDate)) {
    throw createHttpError(400, "Les dates sont invalides.");
  }

  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const days = Math.floor((end - start) / 86400000) + 1;

  if (end < start) {
    throw createHttpError(400, "La date de fin doit être après la date de début.");
  }

  if (days > 45) {
    throw createHttpError(400, "Pour le MVP, limite la plage à 45 jours maximum.");
  }

  if (!Number.isInteger(dayStartHour) || !Number.isInteger(dayEndHour)) {
    throw createHttpError(400, "Les heures doivent être entières.");
  }

  if (dayStartHour < 0 || dayStartHour > 23 || dayEndHour < 1 || dayEndHour > 24 || dayEndHour <= dayStartHour) {
    throw createHttpError(400, "Les heures définies sont invalides.");
  }

  if (![30, 60].includes(stepMinutes)) {
    throw createHttpError(400, "Le pas doit être de 30 ou 60 minutes.");
  }

  return {
    title: title.slice(0, 80),
    description: description.slice(0, 240),
    startDate,
    endDate,
    dayStartHour,
    dayEndHour,
    stepMinutes,
  };
}

function validateAvailabilityPayload(payload) {
  const eventId = String(payload?.eventId || "").trim();
  const participantToken = String(payload?.participantToken || "").trim();
  const name = String(payload?.name || "").trim();
  const note = String(payload?.note || "").trim();
  const slots = Array.isArray(payload?.slots) ? payload.slots.map((slot) => String(slot)) : [];

  if (!eventId) {
    throw createHttpError(400, "Événement manquant.");
  }

  if (!participantToken) {
    throw createHttpError(400, "Identifiant participant manquant.");
  }

  if (!name) {
    throw createHttpError(400, "Le nom est obligatoire.");
  }

  if (slots.length > 2500) {
    throw createHttpError(400, "Trop de créneaux envoyés.");
  }

  return {
    eventId,
    participantToken,
    name: name.slice(0, 60),
    note: note.slice(0, 120),
    slots: [...new Set(slots)],
  };
}

function eventKey(id) {
  return `events/${id}`;
}

function participantPrefix(eventId) {
  return `participants/${eventId}/`;
}

function participantKey(eventId, participantToken) {
  return `${participantPrefix(eventId)}${participantToken}`;
}

function slugify(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
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
  for (let value = dayStartHour * 60; value < dayEndHour * 60; value += stepMinutes) {
    slots.push(value);
  }
  return slots;
}

function getAllSlotKeys(event) {
  const dates = getDatesInRange(event.startDate, event.endDate);
  const times = getTimeSlots(event.dayStartHour, event.dayEndHour, event.stepMinutes);
  return dates.flatMap((date) => times.map((time) => `${date}|${time}`));
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
