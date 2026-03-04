export function detectSweepContext(candles) {

  const curr = candles[candles.length - 1];
  const prev = candles[candles.length - 2];

  const currHigh = parseFloat(curr.high);
  const currLow = parseFloat(curr.low);

  const prevHigh = parseFloat(prev.high);
  const prevLow = parseFloat(prev.low);

  const pip = 0.0001;
  const tolerance = 1 * pip;

  let equalHighSweep = false;
  let equalLowSweep = false;

  const lookback = candles.slice(-25, -2);

  for (let c of lookback) {

    const h = parseFloat(c.high);
    const l = parseFloat(c.low);

    if (Math.abs(h - prevHigh) <= tolerance && currHigh > h) {
      equalHighSweep = true;
    }

    if (Math.abs(l - prevLow) <= tolerance && currLow < l) {
      equalLowSweep = true;
    }

  }

  // Asia range detection (01-06 UTC ≈ 02-07 Norway)

  let asiaHigh = -Infinity;
  let asiaLow = Infinity;

  for (let c of candles.slice(-100)) {

    const date = new Date(c.datetime + "Z");
    const hour = date.getUTCHours();

    if (hour >= 1 && hour < 6) {

      const h = parseFloat(c.high);
      const l = parseFloat(c.low);

      if (h > asiaHigh) asiaHigh = h;
      if (l < asiaLow) asiaLow = l;

    }

  }

  const asiaHighSweep = currHigh > asiaHigh;
  const asiaLowSweep = currLow < asiaLow;

  return {

    sweptPreviousHigh: currHigh > prevHigh,
    sweptPreviousLow: currLow < prevLow,

    equalHighSweep,
    equalLowSweep,

    asiaHighSweep,
    asiaLowSweep,

    asiaHigh,
    asiaLow

  };

}
