const STATE_KEY = "painel-prog-state";

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

async function redis(command) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return { ok: false, status: 500, error: "Upstash Redis não configurado." };
  }

  const response = await fetch(url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    return { ok: false, status: response.status, error: await response.text() };
  }

  return { ok: true, status: response.status, body: await response.json() };
}

module.exports = async function handler(request, response) {
  if (request.method === "GET") {
    const result = await redis(["GET", STATE_KEY]);
    if (!result.ok) return sendJson(response, result.status, { error: result.error });

    const value = result.body.result;
    return sendJson(response, 200, { data: value ? JSON.parse(value) : null });
  }

  if (request.method === "POST") {
    const data = request.body && typeof request.body === "object" ? request.body : JSON.parse(request.body || "{}");
    const result = await redis(["SET", STATE_KEY, JSON.stringify(data)]);
    if (!result.ok) return sendJson(response, result.status, { error: result.error });

    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 405, { error: "Método não permitido." });
};
