import type { VercelRequest, VercelResponse } from "@vercel/node";

// POST /api/track — logs a coarse, privacy-preserving record of each visit:
// country / region / city (derived by Vercel's edge from the request) plus the
// path and referrer. It deliberately does NOT read or store the visitor's IP
// address, only the city-level geo Vercel already computed. View these lines in
// the Vercel project's Logs / Observability tab (search "visit").
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }

  const h = req.headers;
  const get = (k: string) => {
    const v = h[k];
    return (Array.isArray(v) ? v[0] : v) || "";
  };
  const dec = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };

  let path = "/";
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (typeof body?.path === "string") path = body.path.slice(0, 200);
  } catch {
    /* ignore malformed body */
  }

  // IP-free: only the geo Vercel derived, never x-forwarded-for.
  console.log(
    "visit " +
      JSON.stringify({
        country: get("x-vercel-ip-country"),
        region: dec(get("x-vercel-ip-country-region")),
        city: dec(get("x-vercel-ip-city")),
        path,
        ref: get("referer").slice(0, 200),
        at: new Date().toISOString(),
      })
  );

  res.status(204).end();
}
