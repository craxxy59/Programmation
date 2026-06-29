import { jsonResponse } from "./lib/data.mjs";

export default async () => {
  return jsonResponse(
    {
      error: "Cette version n’utilise plus la création d’événement. Utilise directement /.netlify/functions/board.",
    },
    410,
  );
};
