import { useEffect, useRef, useState, type ReactNode } from "react";
import { SUGGESTED_QUESTIONS, INTERVIEW_QUESTIONS } from "../content/justin";

type Msg = { role: "user" | "assistant"; content: string };
type Mode = "portfolio" | "interview";

const GREETINGS: Record<Mode, string> = {
  portfolio:
    "Hey, I'm Justin's assistant. I know his projects and background pretty well, so ask me whatever's useful. A build, how he works, whether he'd fit a role you have. I'll keep it straight.",
  interview:
    "I'm Justin. Well, a version of me my knowledge base talks through. Ask me anything you'd ask in a real interview, and I'll answer the way I actually would, real examples and all.",
};

// The conversation widget and the centerpiece of the hero. Two modes: an
// assistant that answers ABOUT Justin (third person), or an interview simulator
// that answers AS Justin (first person). Grounded in a server-side KB.
export default function Chat({
  fullscreen = false,
  onStreamingChange,
}: { fullscreen?: boolean; onStreamingChange?: (streaming: boolean) => void } = {}) {
  const [mode, setMode] = useState<Mode>("portfolio");
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: GREETINGS.portfolio }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function switchMode(m: Mode) {
    if (m === mode || busy) return;
    setMode(m);
    setMessages([{ role: "assistant", content: GREETINGS[m] }]);
    setInput("");
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Drop the canned greeting (index 0); send the real turns + the mode.
        body: JSON.stringify({ messages: next.slice(1), mode }),
      });

      const ctype = res.headers.get("content-type") || "";

      // Stream only when the server explicitly sends plain text. Anything else
      // (JSON error payloads, or the SPA HTML fallback in local dev) is handled
      // as a single message so the chat never renders raw markup.
      if (!res.ok || !res.body || !ctype.includes("text/plain")) {
        const data = await res.json().catch(() => ({}));
        const reply =
          data.reply ||
          "I couldn't reach the model just now. Try again, or email justingyurik@gmail.com.";
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
        return;
      }

      // Streaming path: append text deltas to a single growing message.
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      setBusy(false);
      onStreamingChange?.(true);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        setMessages((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          if (last && last.role === "assistant") {
            copy[copy.length - 1] = { ...last, content: last.content + chunk };
          }
          return copy;
        });
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Network hiccup reaching the chat. Try again in a moment, or email justingyurik@gmail.com.",
        },
      ]);
    } finally {
      setBusy(false);
      onStreamingChange?.(false);
    }
  }

  const suggestions = mode === "interview" ? INTERVIEW_QUESTIONS : SUGGESTED_QUESTIONS;

  return (
    <div className={fullscreen ? "flex h-full w-full flex-col" : "w-full"}>
      <div
        className={
          fullscreen
            ? "flex min-h-0 flex-1 flex-col overflow-hidden"
            : "iris-ring overflow-hidden rounded-3xl border border-line bg-panel/70 shadow-[0_40px_100px_-30px_rgba(124,92,255,0.5)] backdrop-blur"
        }
      >
        {/* header: window dots (desktop) + mode toggle. On mobile the dots are
            dropped so the toggle spans full width as two equal halves. */}
        <div className="flex items-center gap-3 border-b border-line/80 px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="hidden items-center gap-3 sm:flex">
            <span className="h-3 w-3 rounded-full bg-claydeep" />
            <span className="h-3 w-3 rounded-full bg-magenta" />
            <span className="h-3 w-3 rounded-full bg-cyan" />
          </div>
          <div className="flex w-full items-center rounded-full border border-line bg-ink/40 p-1 text-[13px] font-medium sm:ml-auto sm:w-auto sm:text-[14px]">
            <button
              onClick={() => switchMode("portfolio")}
              aria-pressed={mode === "portfolio"}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 transition sm:flex-none sm:px-3.5 ${
                mode === "portfolio" ? "bg-clay text-ink" : "text-muted hover:text-paper"
              }`}
            >
              Ask about Justin
            </button>
            <button
              onClick={() => switchMode("interview")}
              aria-pressed={mode === "interview"}
              className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 transition sm:flex-none sm:px-3.5 ${
                mode === "interview" ? "bg-clay text-ink" : "text-muted hover:text-paper"
              }`}
            >
              Interview him
            </button>
          </div>
        </div>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-label="Conversation with Justin's assistant"
          className={`scroll-thin space-y-5 overflow-y-auto px-5 py-5 text-left sm:px-6 sm:py-6 ${
            fullscreen ? "min-h-0 flex-1" : "max-h-[48vh] min-h-[200px] sm:min-h-[240px]"
          }`}
        >
          {messages.map((m, i) => (
            <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-3xl rounded-br-md bg-clay px-5 py-3 text-[17px] leading-relaxed text-ink"
                    : "max-w-[90%] rounded-3xl rounded-bl-md border border-line bg-coal px-5 py-4 text-[17px] leading-relaxed text-paper/90"
                }
              >
                {m.role === "assistant" ? <Formatted text={m.content} /> : m.content}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex justify-start">
              <div className="rounded-3xl rounded-bl-md border border-line bg-coal px-5 py-4">
                <span className="flex gap-1.5">
                  <Dot /> <Dot d={0.15} /> <Dot d={0.3} />
                </span>
              </div>
            </div>
          )}
        </div>

        {messages.length <= 1 && (
          <div className="flex flex-wrap gap-2.5 px-6 pb-4">
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => send(q)}
                className="rounded-full border border-line px-4 py-2 text-[14px] text-muted transition hover:border-clay hover:text-clay focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-center gap-2.5 border-t border-line p-3.5"
        >
          <label htmlFor="chat-input" className="sr-only">
            {mode === "interview" ? "Ask Justin an interview question" : "Ask a question about Justin's work"}
          </label>
          <input
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "interview" ? "Ask me anything, like a real interview…" : "Ask me anything about Justin…"}
            autoComplete="off"
            className="flex-1 rounded-xl bg-transparent px-4 py-3 text-[17px] text-paper placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-clay"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-2xl bg-clay px-6 py-3 text-[17px] font-semibold text-ink transition hover:bg-amber active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:opacity-40 disabled:active:scale-100"
          >
            Send
          </button>
        </form>
      </div>
      <p className={`text-center text-[14px] text-faint ${fullscreen ? "px-4 pb-3 pt-2" : "mt-3"}`}>
        Answers are AI-generated and may simplify. For anything that matters, email justingyurik@gmail.com.
      </p>
    </div>
  );
}

// ---- lightweight markdown -> formatted text (no raw ** or - showing through) -

function renderInline(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((https?:[^)\s]+)\)|(\*|_)(.+?)\5/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>);
    else if (m[2] !== undefined)
      out.push(
        <code key={key++} className="rounded bg-line/40 px-1.5 py-0.5 font-mono text-[0.85em]">
          {m[2]}
        </code>
      );
    else if (m[3] !== undefined)
      out.push(
        <a key={key++} href={m[4]} target="_blank" rel="noreferrer" className="text-clay underline">
          {m[3]}
        </a>
      );
    else if (m[6] !== undefined) out.push(<em key={key++}>{m[6]}</em>);
    last = re.lastIndex;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function Formatted({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-1.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ul>
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal space-y-1.5 pl-5">
          {items.map((it, j) => (
            <li key={j}>{renderInline(it)}</li>
          ))}
        </ol>
      );
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) {
      blocks.push(
        <p key={key++} className="font-semibold text-paper">
          {renderInline(h[1])}
        </p>
      );
      i++;
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i]) &&
      !/^#{1,3}\s/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join(" "))}</p>);
  }
  return <div className="space-y-3">{blocks}</div>;
}

function Dot({ d = 0 }: { d?: number }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full bg-clay"
      style={{ animation: `blink 1s ${d}s infinite` }}
    />
  );
}
