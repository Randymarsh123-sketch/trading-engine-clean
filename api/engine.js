// api/engine.js

import { kv } from "@vercel/kv";
import { checkTriggers } from "../lib/triggers.js";

const SYMBOL = "EUR/USD";
const INTERVAL = "5min";
const MAX_CANDLES = 2000;

export default async function handler(req, res) {
  try {
    const now = new Date();
    const minute = now.getUTCMinutes();

    // 🔒 5m boundary guard
    if (minute % 5 !== 0) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "Not 5m boundary",
        minute
      });
    }

    // 🔑 API key check
    if (!process.env.TWELVEDATA_API_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing TWELVEDATA_API_KEY"
      });
    }

    // 📡 Fetch from TwelveData
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

    // 📦 Get stored candles
    let storedCandles = await kv.get("candles");

    if (!storedCandles) {
      storedCandles = [];
    }

    // 🧠 Merge new candles (avoid duplicates)
    const existingTimes = new Set(
      storedCandles.map((c) => c.datetime)
    );

    let newCount = 0;

    for (const candle of fetchedCandles) {
      if (!existingTimes.has(candle.datetime)) {
        storedCandles.push(candle);
        newCount++;
      }
    }

    // 📏 Keep rolling window
    if (storedCandles.length > MAX_CANDLES) {
      storedCandles = storedCandles.slice(-MAX_CANDLES);
    }

    // 💾 Save back to KV
    await kv.set("candles", storedCandles);

    // 🧠 Run trigger engine
    const triggerResult = checkTriggers(storedCandles);

    if (triggerResult.triggered) {
      console.log("🔥 Trigger fired:", triggerResult.type);
    }

    return res.status(200).json({
      ok: true,
      fetched: fetchedCandles.length,
      stored: storedCandles.length,
      newCandles: newCount,
      trigger: triggerResult
    });

  } catch (error) {
    console.error("Engine error:", error);

    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
