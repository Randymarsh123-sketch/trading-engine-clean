function pip(v) {
  return parseFloat(v);
}

const PIP = 0.0001;

export function checkTriggers(candles) {

  if (candles.length < 5) return { triggered: false };

  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];

  const pHigh = pip(c2.high);
  const pLow = pip(c2.low);

  const prevHigh = pip(c1.high);
  const prevLow = pip(c1.low);

  const currHigh = pip(c3.high);
  const currLow = pip(c3.low);

  const currClose = pip(c3.close);
  const currOpen = pip(c3.open);

  const wickUp = currHigh - Math.max(currOpen, currClose);
  const wickDown = Math.min(currOpen, currClose) - currLow;

  const minSweep = 1.5 * PIP;

  /* ---------- TRIGGER #1 FULL ENGULF ---------- */

  if (
    currHigh > prevHigh &&
    wickUp >= minSweep &&
    currClose < prevLow
  ) {

    return {
      triggered: true,
      id: 1,
      name: "Trigger #1 – FULL Engulfing down",
      wickCandle: c3
    };

  }

  if (
    currLow < prevLow &&
    wickDown >= minSweep &&
    currClose > prevHigh
  ) {

    return {
      triggered: true,
      id: 1,
      name: "Trigger #1 – FULL Engulfing up",
      wickCandle: c3
    };

  }

  /* ---------- TRIGGER #2 SWEEP + CONFIRM ---------- */

  const c2High = pip(c2.high);
  const c2Low = pip(c2.low);

  const c2Open = pip(c2.open);
  const c2Close = pip(c2.close);

  const c1BodyHigh = Math.max(pip(c1.open), pip(c1.close));

  const wick2 = c2High - Math.max(c2Open, c2Close);

  const closeTolerance = 0.3 * PIP;

  if (
    c2High > prevHigh &&
    wick2 >= minSweep &&
    c2Close <= c1BodyHigh + closeTolerance
  ) {

    const bodyLow = Math.min(currOpen, currClose);
    const wickConfirm = bodyLow - currLow;

    if (
      currClose < prevLow &&
      wickConfirm <= 0.8 * PIP
    ) {

      return {
        triggered: true,
        id: 2,
        name: "Trigger #2 – Sweep+Confirmation candle",
        wickCandle: c2
      };

    }
  }

  return { triggered: false };
}
