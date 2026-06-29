import { jsonResponse } from "./lib/data.mjs";

export default async () => {
  return jsonResponse(
    {
      error: "Cette version n’utilise plus les événements multiples. Utilise directement /.netlify/functions/board.",
    },
    410,
  );
};
