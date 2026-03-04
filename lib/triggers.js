export function checkTriggers(candles) {

  if (candles.length < 2) {
    return { triggered: false };
  }

  const prev = candles[candles.length - 2];
  const curr = candles[candles.length - 1];

  const prevHigh = parseFloat(prev.high);
  const prevLow = parseFloat(prev.low);

  const open = parseFloat(curr.open);
  const close = parseFloat(curr.close);
  const high = parseFloat(curr.high);
  const low = parseFloat(curr.low);

  const pip = 0.0001;
  const minWick = 1.1 * pip;

  // Bearish sweep + engulf
  const wickSizeBear = high - Math.max(open, close);

  if (
    high > prevHigh &&
    close < prevLow &&
    wickSizeBear >= minWick
  ) {
    return {
      triggered: true,
      type: "bearish_sweep_engulf"
    };
  }

  // Bullish sweep + engulf
  const wickSizeBull = Math.min(open, close) - low;

  if (
    low < prevLow &&
    close > prevHigh &&
    wickSizeBull >= minWick
  ) {
    return {
      triggered: true,
      type: "bullish_sweep_engulf"
    };
  }

  return { triggered: false };
}
