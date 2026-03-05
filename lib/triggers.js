const PIP = 0.0001;

function p(v) {
  return parseFloat(v);
}

export function checkTriggers(candles) {

  if (candles.length < 5) return { triggered: false };

  const c1 = candles[candles.length - 3];
  const c2 = candles[candles.length - 2];
  const c3 = candles[candles.length - 1];

  const prevHigh = p(c1.high);
  const prevLow = p(c1.low);

  const high = p(c3.high);
  const low = p(c3.low);

  const open = p(c3.open);
  const close = p(c3.close);

  const wickUp = high - Math.max(open, close);
  const wickDown = Math.min(open, close) - low;

  const minSweep = 1.5 * PIP;

  if (
    high > prevHigh &&
    wickUp >= minSweep &&
    close < prevLow
  ) {
    return {
      triggered: true,
      id: 1,
      name: "Trigger #1 – FULL Engulfing down",
      wickCandle: c3
    };
  }

  if (
    low < prevLow &&
    wickDown >= minSweep &&
    close > prevHigh
  ) {
    return {
      triggered: true,
      id: 1,
      name: "Trigger #1 – FULL Engulfing up",
      wickCandle: c3
    };
  }

  const c2High = p(c2.high);
  const c2Low = p(c2.low);

  const c2Open = p(c2.open);
  const c2Close = p(c2.close);

  const c1BodyHigh = Math.max(p(c1.open), p(c1.close));

  const wick2 = c2High - Math.max(c2Open, c2Close);

  const closeTolerance = 0.3 * PIP;

  if (
    c2High > prevHigh &&
    wick2 >= minSweep &&
    c2Close <= c1BodyHigh + closeTolerance
  ) {

    const bodyLow = Math.min(open, close);
    const wickConfirm = bodyLow - low;

    if (
      close < prevLow &&
      wickConfirm <= 0.8 * PIP
    ) {

      return {
        triggered: true,
        id: 2,
        name: "Trigger #2 – Sweep+Confirmation candle",
        wickCandle: c2,
        confirmCandle: c3
      };

    }

  }

  return { triggered: false };
}
