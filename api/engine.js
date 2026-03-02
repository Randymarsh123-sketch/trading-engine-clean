import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.TWELVEDATA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ ok: false, error: "Missing TWELVEDATA_API_KEY" });
    }

    // Hent siste 100 5m candles
    const symbol = "EUR/USD";
    const interval = "5min";

    const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${interval}&outputsize=100&apikey=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({ ok: false, error: data });
    }

    // Lagre i KV
    await kv.set("latestCandles", data.values);

    return res.status(200).json({
      ok: true,
      fetched: data.values.length,
      example: data.values[0],
    });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
