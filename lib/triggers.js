// lib/triggers.js

function isBullishEngulfing(prev, current) {
  const prevOpen = parseFloat(prev.open);
  const prevClose = parseFloat(prev.close);
  const currOpen = parseFloat(current.open);
  const currClose = parseFloat(current.close);

  const prevBearish = prevClose < prevOpen;
  const currBullish = currClose > currOpen;

  const engulf =
    currOpen < prevClose &&
    currClose > prevOpen;

  return prevBearish && currBullish && engulf;
}

function isBigBody(candle, threshold = 0.0003) {
  const open = parseFloat(candle.open);
  const close = parseFloat(candle.close);

  return Math.abs(close - open) >= threshold;
}

export function checkTriggers(candles) {
  if (!candles || candles.length < 2) {
    return { triggered: false };
  }

  const last = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  if (isBullishEngulfing(prev, last) && isBigBody(last)) {
    return {
      triggered: true,
      type: "bullish_engulfing",
      candle: last
    };
  }

  return { triggered: false };
}
