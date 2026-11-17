interface Env {}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  const page = await fetch("https://finance.yahoo.com/quote/%5ENSEI/", {
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  const raw = page.headers.get("set-cookie") ?? "";
  const cookies = raw
    .split(/,(?=[^ ]+=)/)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  const crumbResp = await fetch(
    "https://query2.finance.yahoo.com/v1/test/getcrumb",
    { headers: { "User-Agent": UA, Cookie: cookies } },
  );
  const crumb = await crumbResp.text();
  return { crumb, cookie: cookies };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const origin = new URL(context.request.url).origin;
    const metaResp = await fetch(`${origin}/data/meta.json`);
    if (!metaResp.ok) throw new Error("Could not load meta.json");
    const meta: any = await metaResp.json();

    const uniResp = await fetch(`${origin}/data/universe.json`);
    if (!uniResp.ok) throw new Error("Could not load universe.json");
    const universe: any[] = await uniResp.json();

    const yahooSymbols = universe.map((r: any) => {
      const co = r.symbol + ".NS";
      return co;
    });
    yahooSymbols.push("^NSEI");
    const symbolStr = yahooSymbols.join(",");

    const { crumb, cookie } = await getCrumb();

    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbolStr)}&crumb=${encodeURIComponent(crumb)}`;
    const yahooResp = await fetch(url, {
      headers: { "User-Agent": UA, Cookie: cookie },
    });
    if (!yahooResp.ok) {
      const text = await yahooResp.text();
      return new Response(JSON.stringify({ error: "Yahoo API error", status: yahooResp.status, detail: text.slice(0, 200) }), {
        status: 502,
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    const yahoo: any = await yahooResp.json();
    const results = yahoo?.quoteResponse?.result ?? [];

    const quotes: Record<string, any> = {};
    for (const q of results) {
      const sym = q.symbol === "^NSEI" ? "NIFTY50" : q.symbol?.replace(".NS", "");
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
      JSON.stringify({
        quotes,
        fetched_at: new Date().toISOString(),
        count: Object.keys(quotes).length,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=300",
          ...CORS,
        },
      },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message ?? "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS } },
    );
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204, headers: CORS });
};
