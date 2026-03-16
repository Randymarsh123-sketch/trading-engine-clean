import { kv } from "@vercel/kv";
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
  )}&interval=${INTERVAL}&outputsize=10&apikey=${process.env.TWELVEDATA_API_KEY}`;

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

  return candles.filter(c => {
    const t = new Date(c.datetime + "Z").getTime();
    return t <= cutoffMs;
  });
}

function getAsiaSession(candles, targetDate) {

  const asia = [];

  for (const c of candles) {

    const utc = new Date(c.datetime + "Z");

    const oslo = new Date(
      utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
    );

    const sameDay =
      oslo.getFullYear() === targetDate.getFullYear() &&
      oslo.getMonth() === targetDate.getMonth() &&
      oslo.getDate() === targetDate.getDate();

    const hour = oslo.getHours();

    if (sameDay && hour >= 2 && hour < 7) {
      asia.push(c);
    }
  }

  return asia;
}

function calculateAsiaStats(asia) {

  if (asia.length === 0) return null;

  const open = parseFloat(asia[0].open);
  const close = parseFloat(asia[asia.length - 1].close);

  let high = -Infinity;
  let low = Infinity;

  for (const c of asia) {

    const h = parseFloat(c.high);
    const l = parseFloat(c.low);

    if (h > high) high = h;
    if (l < low) low = l;
  }

  const rangePips = ((high - low) * 10000).toFixed(1);

  return {
    open,
    high,
    low,
    close,
    rangePips
  };
}

export default async function handler(req, res) {

  try {

    let candles = await kv.get(CANDLES_KEY);
    if (!candles) candles = [];

    const fetched = await fetchCandles();

    if (fetched.length > 0) {
      candles = mergeCandles(candles, fetched);
      await kv.set(CANDLES_KEY, candles);
    }

    // -------- TELEGRAM TEST --------

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

        const targetDate = new Date(`${y}-${m}-${d}`);

        const asia = getAsiaSession(sliced, targetDate);

        const stats = calculateAsiaStats(asia);

        if (!stats) {
          await sendTelegram("No Asia data found.");
          return res.json({ ok: true });
        }

        const msg = `TEST RUN

EURUSD London Session Outlook ${date}

Asia Range: ${stats.rangePips} pips

Asia Open: ${stats.open}
Asia High: ${stats.high}
Asia Low: ${stats.low}
Asia Close: ${stats.close}
`;

        await sendTelegram(msg);

        return res.json({ ok: true });
      }
    }

    // -------- NORMAL DAILY RUN --------

    const now = getOsloTime();
    const h = now.getHours();
    const m = now.getMinutes();
    const day = now.getDay();

    if (day === 0 || day === 6) {
      return res.json({ ok: true });
    }

    if (h === 8 && m >= 1 && m <= 3) {

      const dateStr = formatDate(now);
      const lockKey = `analysis_sent_${dateStr}`;

      const already = await kv.get(lockKey);

      if (already) {
        return res.json({ ok: true });
      }

      const cutoff = new Date(now);
      cutoff.setHours(8, 0, 0, 0);

      const sliced = sliceCandlesAt(candles, cutoff);

      const asia = getAsiaSession(sliced, now);

      const stats = calculateAsiaStats(asia);

      if (!stats) {
        return res.json({ ok: true });
      }

      const msg = `EURUSD London Session Outlook ${dateStr}

Asia Range: ${stats.rangePips} pips

Asia Open: ${stats.open}
Asia High: ${stats.high}
Asia Low: ${stats.low}
Asia Close: ${stats.close}
`;

      await sendTelegram(msg);

      await kv.set(lockKey, true);

      return res.json({ ok: true });
    }

    return res.json({ ok: true });

  } catch (err) {

    console.error("ENGINE ERROR", err);

    return res.json({
      ok: false,
      error: err.message
    });
  }
}
