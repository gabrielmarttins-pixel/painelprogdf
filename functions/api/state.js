const STATE_KEY = "painel-prog-state";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function redis(env, command) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

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

export async function onRequestGet(context) {
  const result = await redis(context.env, ["GET", STATE_KEY]);
  if (!result.ok) return json({ error: result.error }, result.status);

  const value = result.body.result;
  return json({ data: value ? JSON.parse(value) : null });
}

export async function onRequestPost(context) {
  const data = await context.request.json();
  const result = await redis(context.env, ["SET", STATE_KEY, JSON.stringify(data)]);
  if (!result.ok) return json({ error: result.error }, result.status);

  return json({ ok: true });
}
