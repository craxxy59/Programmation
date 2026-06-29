import { errorResponse, getSharedBoardWithParticipants, jsonResponse } from "./lib/data.mjs";

export default async (req) => {
  if (req.method !== "GET") {
    return jsonResponse({ error: "Méthode non autorisée." }, 405);
  }

  try {
    const data = await getSharedBoardWithParticipants();
    return jsonResponse(data);
  } catch (error) {
    return errorResponse(error);
  }
};
