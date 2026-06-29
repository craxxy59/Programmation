import { errorResponse, jsonResponse, upsertAvailability } from "./lib/data.mjs";

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const payload = await req.json();
    const participant = await upsertAvailability(payload);
    return jsonResponse({ participant }, 200);
  } catch (error) {
    return errorResponse(error);
  }
};
