// api/engine.js

import { kv } from "@vercel/kv";
import { checkTriggers } from "../lib/triggers.js";
import { evaluateTrigger } from "../lib/ai.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const MAX_CANDLES = 2000;
const CANDLES_KEY = "eurusd:5m:candles";

export default async function handler(req, res) {
  try {

    // 🔒 5m boundary guard (UTC)
    const now = new Date();
    const minute = now.getUTCMinutes();

    if (minute % 5 !== 0) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Not 5m boundary",
        minute
      });
    }

    // 🔑 Ensure API key exists
    if (!process.env.TWELVEDATA_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing TWELVEDATA_API_KEY"
      });
    }

    // 📡 Fetch last 3 candles
    const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(
      SYMBOL
    )}&interval=${INTERVAL}&outputsize=3&apikey=${process.env.TWELVEDATA_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (!data.values) {
      return res.status(500).json({
        ok: false,
        error: "Invalid response from TwelveData",
        raw: data
      });
    }

    const fetchedCandles = data.values.reverse(); // oldest → newest

    // 📦 Load stored candles
    let storedCandles = await kv.get(CANDLES_KEY);
    if (!storedCandles) {
      storedCandles = [];
    }

    // 🧠 Merge without duplicates
    const existingTimes = new Set(
      storedCandles.map(c => c.datetime)
    );

    let newCount = 0;

    for (const candle of fetchedCandles) {
      if (!existingTimes.has(candle.datetime)) {
        storedCandles.push(candle);
        newCount++;
      }
    }

    // 📏 Trim to rolling window
    if (storedCandles.length > MAX_CANDLES) {
      storedCandles = storedCandles.slice(-MAX_CANDLES);
    }

    // 💾 Save updated candles
    await kv.set(CANDLES_KEY, storedCandles);

    // 🧠 Run trigger engine
    const triggerResult = checkTriggers(storedCandles);

    let aiResult = null;

    if (triggerResult.triggered) {

      // Send last 100 candles to AI
      const recentCandles = storedCandles.slice(-100);

      aiResult = await evaluateTrigger({
        symbol: SYMBOL,
        trigger: triggerResult.type,
        candles: recentCandles
      });
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

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
