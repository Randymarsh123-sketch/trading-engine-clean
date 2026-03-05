export async function evaluateTrigger({ trigger, context }) {

  let text = "";

  if (trigger.id === 1) {

    text += "Sweep above previous high + Engulfing\n";

  } else {

    text += "Sweep above previous high + Strong confirmation candle\n";

  }

  if (context.extraSweep) {

    text += "\nEkstra confirmation med wick av tidligere high\n";

  }

  text += "\n→ Look for FVG / Retrace / Entry 50%";

  return text;
}
