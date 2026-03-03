import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function evaluateTrigger(context) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `
You are a professional FX price action analyst.
Respond ONLY in JSON format:
{
  "valid": true/false,
  "confidence": 0-100,
  "reason": "short explanation"
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

  } catch (err) {
    console.error("AI error:", err);
    return {
      valid: false,
      confidence: 0,
      reason: "AI error"
    };
  }
}
