import { createEvent, errorResponse, jsonResponse } from "./lib/data.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const payload = await req.json();
    const event = await createEvent(payload);
    return jsonResponse({ event }, 201);
  } catch (error) {
    return errorResponse(error);
  }
};
