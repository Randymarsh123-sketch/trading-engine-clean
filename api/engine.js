import { kv } from "@vercel/kv";
import { checkTriggers } from "../lib/triggers.js";
import { evaluateTrigger } from "../lib/ai.js";
import { detectContext } from "../lib/context.js";
import { sendTelegram } from "../lib/telegram.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const CANDLES_KEY = "eurusd:5m:candles";
const MAX_CANDLES = 2000;

function withinTradingHours() {
  const now = new Date();
  const oslo = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
  );

  const h = oslo.getHours();
  const m = oslo.getMinutes();

  if (h < 8) return false;
  if (h > 16) return false;
  if (h === 16 && m > 15) return false;

  return true;
}

export default async function handler(req, res) {
  try {

    if (!withinTradingHours()) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "Outside trading hours"
      });
    }

    const now = new Date();
    const minute = now.getUTCMinutes();

    if (minute % 5 !== 0) {
      return res.json({
        ok: true,
        skipped: true,
        reason: "Not 5m boundary"
      });
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      SYMBOL
    )}&interval=${INTERVAL}&outputsize=3&apikey=${process.env.TWELVEDATA_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({ ok: false });
    }

    const fetched = data.values.reverse();

    let candles = await kv.get(CANDLES_KEY);
    if (!candles) candles = [];

    const existingTimes = new Set(candles.map(c => c.datetime));

    for (const c of fetched) {
      if (!existingTimes.has(c.datetime)) {
        candles.push(c);
      }
    }

    if (candles.length > MAX_CANDLES) {
      candles = candles.slice(-MAX_CANDLES);
    }

    await kv.set(CANDLES_KEY, candles);

    const trigger = checkTriggers(candles);

    if (!trigger.triggered) {
      return res.json({ ok: true });
    }

    const context = detectContext(candles, trigger);

    const message = evaluateTrigger(trigger, context);

    await sendTelegram(message);

    return res.json({ ok: true });

  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
