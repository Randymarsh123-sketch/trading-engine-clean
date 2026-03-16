import { kv } from "@vercel/kv";
import { sendTelegram } from "../lib/telegram.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const CANDLES_KEY = "eurusd:5m:candles";
const MAX_CANDLES = 2000;

const ASIA_START_UTC = 1;
const ASIA_END_UTC = 6;

function formatDate(date) {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const y = date.getUTCFullYear();
  return `${d}.${m}.${y}`;
}

async function fetchCandles() {

  const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
    SYMBOL
  )}&interval=${INTERVAL}&outputsize=1000&apikey=${process.env.TWELVEDATA_API_KEY}`;

  const response = await fetch(url);
  const data = await response.json();

  if (!data.values) return [];

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

function getAsiaSession(candles, targetDateUTC) {

  const asia = [];

  for (const c of candles) {

    const utc = new Date(c.datetime + "Z");

    const sameDay =
      utc.getUTCFullYear() === targetDateUTC.getUTCFullYear() &&
      utc.getUTCMonth() === targetDateUTC.getUTCMonth() &&
      utc.getUTCDate() === targetDateUTC.getUTCDate();

    const hour = utc.getUTCHours();

    if (sameDay && hour >= ASIA_START_UTC && hour < ASIA_END_UTC) {
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

function isWeekend(dateUTC) {

  const day = dateUTC.getUTCDay();

  return day === 0 || day === 6;
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

    // TELEGRAM TEST

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

        const testUTC = new Date(Date.UTC(y, m - 1, d, hh - 1, mm));

        if (isWeekend(testUTC)) {

          await sendTelegram(`TEST RUN

${date} is weekend.
FX market closed.`);

          return res.json({ ok: true });
        }

        const sliced = sliceCandlesAt(candles, testUTC);

        const targetDateUTC = new Date(Date.UTC(y, m - 1, d));

        const asia = getAsiaSession(sliced, targetDateUTC);

        const stats = calculateAsiaStats(asia);

        if (!stats) {

          await sendTelegram("No Asia data found.");
          return res.json({ ok: true });
        }

        const firstCandle = asia[0].datetime;
        const lastCandle = asia[asia.length - 1].datetime;

        const msg = `TEST RUN

EURUSD London Session Outlook ${date}

Asia Range: ${stats.rangePips} pips

Asia Open: ${stats.open}
Asia High: ${stats.high}
Asia Low: ${stats.low}
Asia Close: ${stats.close}

Asia Candle Count: ${asia.length}

First Asia Candle: ${firstCandle}
Last Asia Candle: ${lastCandle}
`;

        await sendTelegram(msg);

        return res.json({ ok: true });
      }
    }

    const now = new Date();

    if (isWeekend(now)) {
      return res.json({ ok: true });
    }

    const hour = now.getUTCHours();

    if (hour === 7) {

      const dateStr = formatDate(now);
      const lockKey = `analysis_sent_${dateStr}`;

      const already = await kv.get(lockKey);

      if (already) return res.json({ ok: true });

      const cutoff = new Date();
      cutoff.setUTCHours(7, 0, 0, 0);

      const sliced = sliceCandlesAt(candles, cutoff);

      const asia = getAsiaSession(sliced, now);

      const stats = calculateAsiaStats(asia);

      if (!stats) return res.json({ ok: true });

      const firstCandle = asia[0].datetime;
      const lastCandle = asia[asia.length - 1].datetime;

      const msg = `EURUSD London Session Outlook ${dateStr}

Asia Range: ${stats.rangePips} pips

Asia Open: ${stats.open}
Asia High: ${stats.high}
Asia Low: ${stats.low}
Asia Close: ${stats.close}

Asia Candle Count: ${asia.length}

First Asia Candle: ${firstCandle}
Last Asia Candle: ${lastCandle}
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
