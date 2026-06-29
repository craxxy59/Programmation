import { errorResponse, getEventById, jsonResponse, listParticipantsByEvent } from "./lib/data.mjs";

export default async (req) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const url = new URL(req.url);
    const eventId = String(url.searchParams.get("id") || "").trim();

    if (!eventId) {
      return jsonResponse({ error: "Paramètre id manquant." }, 400);
    }

    const event = await getEventById(eventId);
    if (!event) {
      return jsonResponse({ error: "Événement introuvable." }, 404);
    }

    const participants = await listParticipantsByEvent(eventId);
    return jsonResponse({ event, participants });
  } catch (error) {
    return errorResponse(error);
  }
};
