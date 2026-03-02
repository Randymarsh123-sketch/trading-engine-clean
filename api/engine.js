import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.TWELVEDATA_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "Missing TWELVEDATA_API_KEY" });
    }

    const SYMBOL = "EUR/USD";
    const CANDLES_KEY = "eurusd:5m:candles";
    const STATE_KEY = "engine:state";

    // Load state
    let state = await kv.get(STATE_KEY);
    if (!state) {
      state = { initialized: false };
    }

    const outputsize = state.initialized ? 3 : 5000;

    const url = `https://api.twelvedata.com/time_series?symbol=${SYMBOL}&interval=5min&outputsize=${outputsize}&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({ ok: false, error: data });
    }

    const fetched = data.values
      .map(c => ({
        ms: new Date(c.datetime).getTime(),
        open: parseFloat(c.open),
        high: parseFloat(c.high),
        low: parseFloat(c.low),
        close: parseFloat(c.close),
      }))
      .reverse(); // oldest → newest

    const existing = (await kv.get(CANDLES_KEY)) || [];

    const map = new Map();

    for (const c of existing) map.set(c.ms, c);
    for (const c of fetched) map.set(c.ms, c);

    const merged = Array.from(map.values()).sort((a, b) => a.ms - b.ms);

    const cutoff = Date.now() - 5 * 24 * 60 * 60 * 1000;
    const trimmed = merged.filter(c => c.ms >= cutoff);

    await kv.set(CANDLES_KEY, trimmed);

    state.initialized = true;
    await kv.set(STATE_KEY, state);

    return res.status(200).json({
      ok: true,
      fetched: fetched.length,
      stored: trimmed.length
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
