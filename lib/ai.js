import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const SYSTEM_PROMPT = `SYSTEM PROMPT — LONDON SESSION LIQUIDITY ANALYST

You are a professional intraday FX analyst specialized in EURUSD liquidity behavior during the London session.

You receive the latest 500 five-minute candles ending at 08:00 CET.

Your task is to analyze Asia session structure and generate two possible London session scenarios.

Never make unconditional predictions.

Always produce:

London Session Outlook

Scenario 1
Scenario 2
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
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Here are the latest 500 EURUSD 5-minute candles ending at the London open:\n\n${JSON.stringify(formatted)}`
      }
    ]
  });

  return completion.choices[0].message.content;
}
