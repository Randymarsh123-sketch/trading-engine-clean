import { kv } from "@vercel/kv";
import { runLondonAnalysis } from "../lib/ai.js";
import { sendTelegram } from "../lib/telegram.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const CANDLES_KEY = "eurusd:5m:candles";
const MAX_CANDLES = 2000;

function getOsloTime(date = new Date()) {
  return new Date(
    date.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
  );
}

function formatDate(date) {
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}.${m}.${y}`;
}

async function fetchCandles() {
  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    SYMBOL
  )}&interval=${INTERVAL}&outputsize=5&apikey=${process.env.TWELVEDATA_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.values) throw new Error("TwelveData fetch failed");

  return data.values.reverse();
}

function mergeCandles(existing, incoming) {
  const map = new Map();

  for (const c of existing) map.set(c.datetime, c);
  for (const c of incoming) map.set(c.datetime, c);

  const merged = Array.from(map.values())
    .sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

  return merged.slice(-MAX_CANDLES);
}

function sliceCandlesAt(candles, cutoff) {
  const cutoffMs = cutoff.getTime();

  return candles.filter(c => {
    const t = new Date(c.datetime + "Z").getTime();
    return t <= cutoffMs;
  });
}

export default async function handler(req, res) {
  try {

    // --- FETCH & STORE CANDLES ---
    const fetched = await fetchCandles();

    let candles = await kv.get(CANDLES_KEY);
    if (!candles) candles = [];

    candles = mergeCandles(candles, fetched);
    await kv.set(CANDLES_KEY, candles);

    // --- TELEGRAM TEST COMMAND ---
    if (req.body && req.body.message) {

      const text = req.body.message.text || "";

      if (text.startsWith("/test")) {

        const parts = text.split(" ");

        if (parts.length !== 3) {
          await sendTelegram("Usage: /test HH:MM DD.MM.YYYY");
          return res.json({ ok: true });
        }

        const time = parts[1];
        const date = parts[2];

        const [hh, mm] = time.split(":");
        const [d, m, y] = date.split(".");

        const oslo = new Date(Date.UTC(y, m - 1, d, hh - 1, mm));

        const sliced = sliceCandlesAt(candles, oslo);

        const dataset = sliced.slice(-500);

        const aiText = await runLondonAnalysis(dataset);

        const msg =
`TEST RUN

EURUSD London Session Outlook ${date}
(analysis simulated at ${time} CET)

${aiText}`;

        await sendTelegram(msg);

        return res.json({ ok: true });
      }
    }

    // --- DAILY LONDON ANALYSIS ---
    const now = getOsloTime();
    const h = now.getHours();
    const m = now.getMinutes();

    if (h === 8 && m === 1) {

      const dateStr = formatDate(now);
      const lockKey = `analysis_sent_${dateStr}`;

      const already = await kv.get(lockKey);

      if (already) {
        return res.json({ ok: true, skipped: "already_sent" });
      }

      const cutoff = new Date(now);
      cutoff.setHours(8, 0, 0, 0);

      const sliced = sliceCandlesAt(candles, cutoff);
      const dataset = sliced.slice(-500);

      const aiText = await runLondonAnalysis(dataset);

      const msg =
`EURUSD London Session Outlook ${dateStr}

${aiText}`;

      await sendTelegram(msg);

      await kv.set(lockKey, true);

      return res.json({ ok: true, analysis: true });
    }

    return res.json({ ok: true });

  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}
