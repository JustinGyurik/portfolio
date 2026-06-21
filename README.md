# Justin Gyurik — Portfolio

An AI-native personal site. Studio/creative identity, hand-rolled motion, and a real Claude-powered chat that answers questions about the work. Built with Vite, React, TypeScript, and Tailwind. Designed to deploy free on Vercel.

## Run it locally

```bash
npm install
cp .env.example .env.local        # then paste your Anthropic API key into .env.local
npm run dev                       # http://localhost:5173
```

The front end runs with `npm run dev`. The chat calls `/api/chat`, which is a serverless function. Two ways to exercise it locally:

- **Easiest:** install the Vercel CLI and run the whole thing (front end + function) together:
  ```bash
  npm i -g vercel
  vercel dev
  ```
- Or just `npm run dev` to work on the UI; the chat will return a friendly fallback until the function is running.

## Deploy free on Vercel (recommended)

1. Push this folder to a GitHub repo.
2. Go to vercel.com, "Add New Project," and import the repo. Framework preset: **Vite**. It will use the build settings in `vercel.json`.
3. In the project's **Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your key from https://console.anthropic.com
   - (optional) `ANTHROPIC_MODEL` to override the default.
4. Deploy. The `api/` folder becomes a serverless function automatically.
5. **Custom domain:** Settings → Domains → add `justingyurik.com` and follow the DNS steps. Free on the Hobby tier.

The Hobby (free) tier covers the static site and the serverless chat for a personal portfolio. The only ongoing cost is Anthropic API usage, which is pennies at portfolio traffic; the default model is the inexpensive one.

## Where things live

| Path | What |
| --- | --- |
| `src/content/justin.ts` | Single source of truth: profile, builds, experience, and the chat's system prompt. **Edit copy here.** |
| `api/chat.ts` | Serverless chat endpoint. Calls Claude; holds the API key server-side. |
| `src/components/` | `Hero`, `Waveform`, `Builds`, `About`, `Chat`. |
| `CLAUDE.md` | Working notes for continuing this in Claude Code. |

## Cost & safety notes

- The API key is only ever read server-side in `api/chat.ts`. It is never bundled into the client.
- Chat history is capped and input length is clamped in the function to limit token use.
- If the key is missing, the chat degrades gracefully and points visitors to email.

Built solo with React, TypeScript, and Claude.
