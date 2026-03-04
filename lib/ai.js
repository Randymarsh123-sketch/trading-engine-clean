import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateTrigger(context) {

  const response = await openai.chat.completions.create({

    model: "gpt-4o-mini",
    temperature: 0.2,

    messages: [

      {
        role: "system",
        content: `
You are an intraday FX trader.

Explain the setup in simple trading language.

Mention:
• what liquidity was swept
• if equal highs/lows were taken
• if Asia range was taken
• likely direction and target

Keep the explanation short.

Respond ONLY as JSON:

{
"valid": true/false,
"confidence": 0-100,
"analysis": "short trader explanation"
}
`
      },

      {
        role: "user",
        content: JSON.stringify(context)
      }

    ]

  });

  const content = response.choices[0].message.content;

  return JSON.parse(content);

}
