const {
  kvGetJson,
  kvSetJson,
  fetch5mFromTwelveData,
  mergeAndTrimCandles
} = require("../lib/storage");

const SYMBOL = "EUR/USD";
const KEY_CANDLES = "eurusd:5m:candles";
const KEY_STATE = "engine:state";

module.exports = async (req, res) => {
  try {

    let state = await kvGetJson(KEY_STATE);
    if (!state) {
      state = { initialized: false };
    }

    const outputsize = state.initialized ? 3 : 5000;

    const fetched = await fetch5mFromTwelveData({
      symbol: SYMBOL,
      outputsize
    });

    const existing = (await kvGetJson(KEY_CANDLES)) || [];

    const merged = mergeAndTrimCandles({
      existing,
      incoming: fetched,
      keepDays: 5
    });

    await kvSetJson(KEY_CANDLES, merged);

    state.initialized = true;
    await kvSetJson(KEY_STATE, state);

    res.status(200).json({
      ok: true,
      candlesStored: merged.length
    });

  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
};
