export function detectContext(candles, trigger) {

  const wick = trigger.wickCandle;

  const wickHigh = parseFloat(wick.high);
  const wickLow = parseFloat(wick.low);

  let asiaHigh = -Infinity;
  let asiaLow = Infinity;

  const last150 = candles.slice(-150);

  for (const c of last150) {

    const d = new Date(c.datetime + "Z");
    const hour = d.getUTCHours();

    if (hour >= 1 && hour < 6) {

      const h = parseFloat(c.high);
      const l = parseFloat(c.low);

      if (h > asiaHigh) asiaHigh = h;
      if (l < asiaLow) asiaLow = l;

    }

  }

  let asiaSweep = false;

  if (wickHigh > asiaHigh || wickLow < asiaLow) {
    asiaSweep = true;
  }

  const now = new Date();

  const oslo = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
  );

  const hour = oslo.getHours();

  let strongSession = false;

  if (hour >= 13 && hour <= 16) {
    strongSession = true;
  }

  const day = oslo.getDay();

  let strongDay = false;

  if (day === 2 || day === 3 || day === 4) {
    strongDay = true;
  }

  let displacementStronger = false;

  if (trigger.confirmCandle) {

    const c2 = trigger.wickCandle;
    const c3 = trigger.confirmCandle;

    const r2 = parseFloat(c2.high) - parseFloat(c2.low);
    const r3 = parseFloat(c3.high) - parseFloat(c3.low);

    if (r3 > r2) {
      displacementStronger = true;
    }

  }

  let confluence = 0;

  if (asiaSweep) confluence++;
  if (displacementStronger) confluence++;
  if (strongSession) confluence++;
  if (strongDay) confluence++;

  let isAPlus = false;

  if (trigger.id === 2 && displacementStronger && confluence >= 2) {
    isAPlus = true;
  }

  return {
    asiaSweep,
    strongSession,
    strongDay,
    displacementStronger,
    confluence,
    isAPlus
  };
}
