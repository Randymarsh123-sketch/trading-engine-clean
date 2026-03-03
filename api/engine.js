// api/engine.js

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

    // 5m boundary guard
    if (minute % 5 !== 0) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        minute
      });
    }

    if (!process.env.TWELVEDATA_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing TWELVEDATA_API_KEY" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ ok: false, error: "Missing OPENAI_API_KEY" });
    }

    // Fetch latest candles
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      SYMBOL
    )}&interval=${INTERVAL}&outputsize=3&apikey=${process.env.TWELVEDATA_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({ ok: false, error: "Invalid TwelveData response" });
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

    // 🔍 Run real trigger engine
    const triggerResult = checkTriggers(storedCandles);

    let aiResult = null;

    if (triggerResult.triggered) {

      const recentCandles = storedCandles.slice(-100);

      aiResult = await evaluateTrigger({
        symbol: SYMBOL,
        trigger: triggerResult.type,
        candles: recentCandles
      });

      // 🔔 STEP 3 – Telegram if valid
      if (aiResult.valid) {
        await sendTelegram(
          `📊 ${SYMBOL} Trigger: ${triggerResult.type}

AI Verdict: VALID
Confidence: ${aiResult.confidence}%
Reason: ${aiResult.reason}`
        );
      }
    }

    return res.status(200).json({
      ok: true,
      fetched: fetchedCandles.length,
      stored: storedCandles.length,
      newCandles: newCount,
      trigger: triggerResult,
      ai: aiResult
    });

  } catch (error) {
    console.error("Engine error:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
