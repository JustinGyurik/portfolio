import type { VercelRequest, VercelResponse } from "@vercel/node";
import { SYSTEM_CONTEXT, INTERVIEW_SYSTEM_CONTEXT } from "../src/content/justin.js";

// Vercel serverless function: POST /api/chat
// Body: { messages: { role, content }[] }
// Streams the reply back as plain-text chunks (text/plain) for a snappier feel.
// The Anthropic API key stays server-side. Never expose it to the client.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;

type Msg = { role: "user" | "assistant"; content: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "missing_key",
      reply:
        "The chat is not configured yet. Set ANTHROPIC_API_KEY in the environment and redeploy. In the meantime, reach Justin at justingyurik@gmail.com.",
    });
    return;
  }

  let messages: Msg[] = [];
  let mode: "portfolio" | "interview" = "portfolio";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    messages = Array.isArray(body?.messages) ? body.messages : [];
    if (body?.mode === "interview") mode = "interview";
  } catch {
    res.status(400).json({ error: "bad_request" });
    return;
  }

  // Stamp today's date so the assistant can compute things like pet ages from
  // the knowledge base. Pick the prompt by mode: interview = first-person Justin.
  const today = new Date().toISOString().slice(0, 10);
  const base = mode === "interview" ? INTERVIEW_SYSTEM_CONTEXT : SYSTEM_CONTEXT;
  const systemPrompt = `${base}\n\nToday's date is ${today}.`;

  // Keep only valid roles/strings, cap history to last 12 turns.
  const clean = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));

  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    res.status(400).json({ error: "no_user_message" });
    return;
  }

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // Cache the large knowledge-base system prompt so repeat visits are
        // cheaper and faster (the prefix is stable within a day).
        system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
        stream: true,
        messages: clean,
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => "");
      console.error("anthropic_error", upstream.status, text);
      res.status(502).json({
        error: "upstream",
        reply: "Something went wrong reaching the model. Try again, or email justingyurik@gmail.com.",
      });
      return;
    }

    // Stream plain text deltas to the client as they arrive.
    res.writeHead(200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let wroteAnything = false;

    // Anthropic sends Server-Sent Events: lines like `data: {json}`.
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
            wroteAnything = true;
          }
        } catch {
          // ignore keep-alive / non-JSON lines
        }
      }
    }

    if (!wroteAnything) {
      res.write("I did not catch that. Try rephrasing, or email justingyurik@gmail.com.");
    }
    res.end();
  } catch (err) {
    console.error("chat_handler_error", err);
    // If headers already sent, just close the stream; otherwise return JSON.
    if (res.headersSent) {
      res.end();
    } else {
      res.status(500).json({
        error: "server",
        reply: "The chat hit an unexpected error. Try again shortly, or email justingyurik@gmail.com.",
      });
    }
  }
}
