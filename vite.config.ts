import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { SYSTEM_CONTEXT, INTERVIEW_SYSTEM_CONTEXT } from "./src/content/justin";

// Dev-only middleware that serves POST /api/chat locally so `npm run dev` runs
// the real chat (vite does not run the Vercel serverless function). Mirrors
// api/chat.ts: same prompts, streaming, and key handling. Production still uses
// the serverless function.
function devChatApi(apiKey: string, model: string): Plugin {
  return {
    name: "dev-chat-api",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split("?")[0] !== "/api/chat" || req.method !== "POST") return next();

        const json = (status: number, obj: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(obj));
        };

        if (!apiKey) {
          return json(500, {
            reply:
              "No ANTHROPIC_API_KEY found. Add it to .env.local and restart the dev server.",
          });
        }

        let raw = "";
        for await (const chunk of req) raw += chunk;
        let body: { messages?: unknown; mode?: unknown } = {};
        try {
          body = JSON.parse(raw);
        } catch {
          return json(400, { error: "bad_request" });
        }

        const mode = body.mode === "interview" ? "interview" : "portfolio";
        const messages = Array.isArray(body.messages) ? body.messages : [];
        const clean = (messages as { role?: string; content?: unknown }[])
          .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
          .map((m) => ({ role: m.role, content: (m.content as string).slice(0, 4000) }));
        if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
          return json(400, { error: "no_user_message" });
        }

        const today = new Date().toISOString().slice(0, 10);
        const base = mode === "interview" ? INTERVIEW_SYSTEM_CONTEXT : SYSTEM_CONTEXT;
        const systemPrompt = `${base}\n\nToday's date is ${today}.`;

        try {
          const upstream = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
              stream: true,
              messages: clean,
            }),
          });

          if (!upstream.ok || !upstream.body) {
            const text = await upstream.text().catch(() => "");
            console.error("anthropic_error", upstream.status, text);
            return json(502, { reply: "Something went wrong reaching the model. Try again." });
          }

          res.statusCode = 200;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          res.setHeader("cache-control", "no-cache, no-transform");

          const reader = upstream.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buffer.indexOf("\n")) !== -1) {
              const line = buffer.slice(0, nl).trim();
              buffer = buffer.slice(nl + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const evt = JSON.parse(payload);
                if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta") {
                  res.write(evt.delta.text);
                }
              } catch {
                /* ignore keep-alives */
              }
            }
          }
          res.end();
        } catch (err) {
          console.error("dev_chat_error", err);
          if (res.headersSent) res.end();
          else json(500, { reply: "The chat hit an unexpected error. Try again shortly." });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [
      react(),
      devChatApi(env.ANTHROPIC_API_KEY || "", env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"),
    ],
    server: { port: 5173 },
  };
});
