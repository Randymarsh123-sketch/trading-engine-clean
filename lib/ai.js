import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `
You are analyzing EURUSD 5-minute candles.

Only analyze the Asia session defined as:
02:00–07:00 CET.

You will receive the latest 500 candles ending at the London open.

Your job is ONLY to extract factual information.

Return the result EXACTLY in this format:

Date: DD.MM.YYYY

ASIA RANGE = X pips

Asia Open:
Asia High:
Asia Low:
Asia Close:

Internal liquidity =
yes / no

If yes, briefly state where:
- internal swing highs/lows
- internal double tops/bottoms
- internal consolidation
- near Asia mid (yes/no)

Do not give predictions.
Do not give scenarios.
Only report the data.
`;

function formatCandles(candles) {
  return candles.map(c => ({
    time: c.datetime,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  }));
}

export async function runLondonAnalysis(candles) {

  const formatted = formatCandles(candles);

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here are the latest EURUSD 5-minute candles:\n\n${JSON.stringify(formatted)}`
      }
    ]
  });

  return completion.choices[0].message.content;
}
