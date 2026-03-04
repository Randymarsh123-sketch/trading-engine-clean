import { kv } from "@vercel/kv";
import { checkTriggers } from "../lib/triggers.js";
import { evaluateTrigger } from "../lib/ai.js";
import { sendTelegram } from "../lib/telegram.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const MAX_CANDLES = 2000;
const CANDLES_KEY = "eurusd:5m:candles";

export default async function handler(req, res) {
  try {

    const now = new Date();
    const minute = now.getUTCMinutes();
    const hour = now.getUTCHours();

    // 5m boundary
    if (minute % 5 !== 0) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Not 5m boundary"
      });
    }

    // Session filter (08-16 Norway)
    if (hour < 7 || hour > 15) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Outside trading session"
      });
    }

    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      SYMBOL
    )}&interval=${INTERVAL}&outputsize=3&apikey=${process.env.TWELVEDATA_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({
        ok: false,
        error: "Invalid TwelveData response"
      });
    }

    const fetchedCandles = data.values.reverse();

    let storedCandles = await kv.get(CANDLES_KEY);
    if (!storedCandles) storedCandles = [];

    const existingTimes = new Set(storedCandles.map(c => c.datetime));

    let newCount = 0;

    for (const candle of fetchedCandles) {
      if (!existingTimes.has(candle.datetime)) {
        storedCandles.push(candle);
        newCount++;
      }
    }

    if (storedCandles.length > MAX_CANDLES) {
      storedCandles = storedCandles.slice(-MAX_CANDLES);
    }

    await kv.set(CANDLES_KEY, storedCandles);

    const triggerResult = checkTriggers(storedCandles);

    let aiResult = null;

    if (triggerResult.triggered) {

      const recentCandles = storedCandles.slice(-150);

      aiResult = await evaluateTrigger({
        symbol: SYMBOL,
        trigger: triggerResult.type,
        candles: recentCandles
      });

      if (aiResult.valid) {

        await sendTelegram(
`📊 EURUSD 5m

Trigger:
${triggerResult.type}

AI Verdict:
VALID

Confidence:
${aiResult.confidence}%

Reason:
${aiResult.reason}`
        );

      }
    }

    return res.status(200).json({
      ok: true,
      trigger: triggerResult,
      ai: aiResult
    });

  } catch (error) {

    return res.status(500).json({
      ok: false,
      error: error.message
    });

  }
}
