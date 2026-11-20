// mindmap.7mit AI proxy (Cloudflare Worker).
// API keys live ONLY as Worker secrets (GEMINI_API_KEY, GROQ_API_KEY) — never in this repo or in the browser.
// Tries Gemini first, then falls back to Groq.
const MAX_SYSTEM = 20000, MAX_USER = 80000;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allow = (env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim()).filter(Boolean);
    const open = allow.includes('*');
    const ok = open || allow.includes(origin);
    const cors = {
      'access-control-allow-origin': open ? '*' : ok ? origin : 'null',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      vary: 'Origin',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST' || !ok) return reply({ error: 'forbidden' }, 403, cors);

    let b;
    try { b = await req.json(); } catch { return reply({ error: 'invalid JSON' }, 400, cors); }
    const system = String(b.system || ''), user = String(b.user || ''), wantJson = b.json !== false;
    if (!user || system.length > MAX_SYSTEM || user.length > MAX_USER) return reply({ error: 'bad request size' }, 413, cors);

    const order = [];
    if (env.GEMINI_API_KEY) order.push('gemini');
    if (env.GROQ_API_KEY) order.push('groq');
    if (!order.length) return reply({ error: 'AI server has no API keys configured' }, 500, cors);

    let last;
    for (const p of order) {
      try {
        const text = p === 'gemini' ? await gemini(env, system, user, wantJson) : await groq(env, system, user, wantJson);
        return reply({ text, provider: p }, 200, cors);
      } catch (e) { last = e; }
    }
    return reply({ error: String(last && last.message || last) }, 502, cors);
  },
};

async function gemini(env, system, user, wantJson) {
  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 8192, ...(wantJson ? { responseMimeType: 'application/json' } : {}) },
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Gemini: ' + (j.error && j.error.message || r.status));
  const t = ((j.candidates || [])[0]?.content?.parts || []).map(x => x.text || '').join('');
  if (!t) throw new Error('Gemini: empty reply');
  return t;
}

async function groq(env, system, user, wantJson) {
  const model = env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + env.GROQ_API_KEY },
    body: JSON.stringify({
      model, temperature: 0.4,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      ...(wantJson ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Groq: ' + (j.error && j.error.message || r.status));
  return j.choices?.[0]?.message?.content || '';
}

function reply(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'content-type': 'application/json' } });
}
