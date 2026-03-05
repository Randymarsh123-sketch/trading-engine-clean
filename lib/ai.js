export function evaluateTrigger(trigger, ctx) {

  let msg = "";

  if (ctx.isAPlus) {
    msg += "⚡ A+ SETUP\n\n";
  } else {
    msg += "Standard Setup\n\n";
  }

  msg += `${trigger.name}\n`;
  msg += `Confluence: ${ctx.confluence}/4\n\n`;

  if (trigger.id === 1) {
    msg += "Sweep above previous high + Engulfing\n\n";
  } else {
    msg += "Sweep above previous high + Strong confirmation candle\n\n";
  }

  if (ctx.asiaSweep) {
    msg += "Asia High SWEPT = HIGHER probability\n";
  }

  if (ctx.strongSession) {
    msg += "Historisk sterkere tidspunkt\n";
  } else {
    msg += "Historisk svakere tidspunkt\n";
  }

  if (ctx.strongDay) {
    msg += "Historisk sterkere dag\n";
  } else {
    msg += "Historisk svakere dag\n";
  }

  msg += "\n→ Look for FVG / Retrace / Entry 50%\n\n";

  const w = trigger.wickCandle;
  const d = new Date(w.datetime + "Z");
  const oslo = new Date(
    d.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
  );

  const hh = String(oslo.getHours()).padStart(2, "0");
  const mm = String(oslo.getMinutes()).padStart(2, "0");

  msg += `Wick candle time: ${hh}:${mm}`;

  return msg;
}
