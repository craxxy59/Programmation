import { errorResponse, getSharedBoardWithParticipants, jsonResponse } from "./lib/data.mjs";

export default async (req) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const url = new URL(req.url);
    const startDate = String(url.searchParams.get("start") || "").trim();
    const data = await getSharedBoardWithParticipants(startDate || undefined);
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
};
