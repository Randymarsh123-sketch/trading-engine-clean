export function detectSweepContext(candles) {

  const wick = candles[candles.length - 2];

  const wickHigh = parseFloat(wick.high);

  let extraSweep = false;

  const lookback = candles.slice(-20, -3);

  for (const c of lookback) {

    const h = parseFloat(c.high);

    if (wickHigh > h) {
      extraSweep = true;
      break;
    }

  }

  return {
    extraSweep
  };

}
