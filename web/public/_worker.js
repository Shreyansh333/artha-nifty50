const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getCrumb() {
  const page = await fetch("https://finance.yahoo.com/quote/%5ENSEI/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  const raw = page.headers.get("set-cookie") || "";
  const cookies = raw
    .split(/,(?=[^ ]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  const crumbResp = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, Cookie: cookies } }
  );
  const crumb = await crumbResp.text();
  return { crumb, cookie: cookies };
}

async function handleQuotes(request, env, ctx) {
  try {
    const origin = new URL(request.url).origin;
    const uniResp = await fetch(origin + "/data/universe.json");
    if (!uniResp.ok) throw new Error("Could not load universe.json");
    const universe = await uniResp.json();

    const yahooSymbols = universe.map((r) => r.symbol + ".NS");
    yahooSymbols.push("^NSEI");

    const { crumb, cookie } = await getCrumb();
    const url =
      "https://query2.finance.yahoo.com/v7/finance/quote?symbols=" +
      encodeURIComponent(yahooSymbols.join(",")) +
      "&crumb=" +
      encodeURIComponent(crumb);

    const yahooResp = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: cookie },
    });

    if (!yahooResp.ok) {
      const text = await yahooResp.text();
      return new Response(
        JSON.stringify({ error: "Yahoo API error", status: yahooResp.status, detail: text.slice(0, 200) }),
        { status: 502, headers: { "Content-Type": "application/json", ...CORS } }
      );
    }
    const yahoo = await yahooResp.json();
    const results = (yahoo && yahoo.quoteResponse && yahoo.quoteResponse.result) || [];

    const quotes = {};
    for (const q of results) {
      const sym = q.symbol === "^NSEI" ? "NIFTY50" : (q.symbol || "").replace(".NS", "");
      if (!sym) continue;
      quotes[sym] = {
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePct: q.regularMarketChangePercent != null ? q.regularMarketChangePercent / 100 : null,
        prevClose: q.regularMarketPreviousClose ?? null,
        open: q.regularMarketOpen ?? null,
        dayHigh: q.regularMarketDayHigh ?? null,
        dayLow: q.regularMarketDayLow ?? null,
        volume: q.regularMarketVolume ?? null,
        marketCap: q.marketCap ?? null,
        fiftyTwoWeekHigh: q.fiftyTwoWeekHigh ?? null,
        fiftyTwoWeekLow: q.fiftyTwoWeekLow ?? null,
        trailingPE: q.trailingPE ?? null,
        marketState: q.marketState ?? null,
        time: q.regularMarketTime ?? null,
      };
    }

    return new Response(
      JSON.stringify({ quotes, fetched_at: new Date().toISOString(), count: Object.keys(quotes).length }),
      { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", ...CORS } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } }
    );
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/quotes") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: CORS });
      }
      return handleQuotes(request, env, ctx);
    }

    // Fall through to static assets
    return env.ASSETS.fetch(request);
  },
};
