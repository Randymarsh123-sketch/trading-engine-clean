import { kv } from "@vercel/kv";
import { runLondonAnalysis } from "../lib/ai.js";
import { sendTelegram } from "../lib/telegram.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const CANDLES_KEY = "eurusd:5m:candles";
const MAX_CANDLES = 2000;

function getOsloTime(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "Europe/Oslo" }));
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

  if (!data.values) {
    console.error("TwelveData error", data);
    return [];
  }

  return data.values.reverse();
}

function mergeCandles(existing, incoming) {
  const map = new Map();

  for (const c of existing) map.set(c.datetime, c);
  for (const c of incoming) map.set(c.datetime, c);

  const merged = Array.from(map.values()).sort(
    (a, b) => new Date(a.datetime) - new Date(b.datetime)
  );

  return merged.slice(-MAX_CANDLES);
}

function sliceCandlesAt(candles, cutoff) {
  const cutoffMs = cutoff.getTime();

  return candles.filter((c) => {
    const t = new Date(c.datetime + "Z").getTime();
    return t <= cutoffMs;
  });
}

export default async function handler(req, res) {
  try {

    // ---------- FETCH DATA ----------
    let candles = await kv.get(CANDLES_KEY);
    if (!candles) candles = [];

    const fetched = await fetchCandles();

    if (fetched.length > 0) {
      candles = mergeCandles(candles, fetched);
      await kv.set(CANDLES_KEY, candles);
    }

    // ---------- TELEGRAM TEST ----------
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

        const testTime = new Date(`${y}-${m}-${d}T${hh}:${mm}:00+01:00`);

        const sliced = sliceCandlesAt(candles, testTime);
        const dataset = sliced.slice(-500);

        let aiText = "AI analysis failed";

        try {
          aiText = await runLondonAnalysis(dataset);
        } catch (err) {
          console.error("AI error during test", err);
        }

        const msg = `TEST RUN

EURUSD London Session Outlook ${date}
(analysis simulated at ${time} CET)

${aiText}`;

        await sendTelegram(msg);

        return res.json({ ok: true });
      }
    }

    // ---------- TIME ----------
    const now = getOsloTime();
    const h = now.getHours();
    const m = now.getMinutes();
    const day = now.getDay();

    // ---------- SKIP WEEKENDS ----------
    if (day === 0 || day === 6) {
      return res.json({ ok: true, skipped: "weekend" });
    }

    // ---------- LONDON ANALYSIS ----------
    if (h === 8 && m >= 1 && m <= 3) {

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

      let aiText = "AI analysis failed";

      try {
        aiText = await runLondonAnalysis(dataset);
      } catch (err) {
        console.error("AI error", err);
      }

      const msg = `EURUSD London Session Outlook ${dateStr}

${aiText}`;

      await sendTelegram(msg);

      await kv.set(lockKey, true);

      return res.json({ ok: true, analysis: true });
    }

    return res.json({ ok: true });

  } catch (err) {

    console.error("ENGINE ERROR", err);

    // CRITICAL: aldri returner 500 til cron
    return res.json({
      ok: false,
      error: err.message
    });
  }
}
