import type { VercelRequest, VercelResponse } from "@vercel/node";

// Vercel serverless function: POST /api/fluent
// Server-side proxy for the Fluent assessment's live AI calls. Takes a single
// prompt, calls the Anthropic Messages API with the server-side key, and returns
// { text }. This keeps ANTHROPIC_API_KEY out of the browser: Fluent's built-in
// "own API key" path would call api.anthropic.com directly from the client and
// expose the key. Non-streaming on purpose: Fluent expects one text blob per
// call (it then JSON-parses the scenario / scoring payloads).

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS_CAP = 2000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed", text: "" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fluent falls back to its offline heuristic when text is empty.
    res.status(500).json({ error: "missing_key", text: "" });
    return;
  }

  let prompt = "";
  let model = DEFAULT_MODEL;
  let maxTokens = 800;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
    if (typeof body?.model === "string" && body.model) model = body.model;
    if (Number.isFinite(body?.maxTokens)) {
      maxTokens = Math.min(MAX_TOKENS_CAP, Math.max(1, Math.floor(body.maxTokens)));
    }
  } catch {
    res.status(400).json({ error: "bad_request", text: "" });
    return;
  }

  if (!prompt) {
    res.status(400).json({ error: "no_prompt", text: "" });
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
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt.slice(0, 12000) }],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error("fluent_anthropic_error", upstream.status, detail);
      res.status(502).json({ error: "upstream", text: "" });
      return;
    }

    const j = await upstream.json();
    const text = (j?.content?.[0]?.text as string) || "";
    res.status(200).json({ text });
  } catch (err) {
    console.error("fluent_handler_error", err);
    res.status(500).json({ error: "server", text: "" });
  }
}
