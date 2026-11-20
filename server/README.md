# AI proxy for mindmap.7mit

The AI features call this tiny Cloudflare Worker, so **visitors never enter or see any API key**.
The keys are stored as Worker *secrets* (encrypted, outside the repo). It tries Gemini first, then Groq.

```bash
cd server
npx wrangler login
npx wrangler secret put GEMINI_API_KEY     # paste the key when prompted
npx wrangler secret put GROQ_API_KEY       # paste the key when prompted
npx wrangler deploy                         # prints https://mindmap-7mit-ai.<you>.workers.dev
```

Then set that URL in `../config.js`:

```js
window.MM7_CONFIG = { aiProxy: "https://mindmap-7mit-ai.<you>.workers.dev" };
```

Optional: set `ALLOWED_ORIGINS` in `wrangler.toml` to your site (e.g. `https://yourname.github.io`) and
`GEMINI_MODEL` / `GROQ_MODEL` as vars. Add a Cloudflare rate-limiting rule to protect your quota.
