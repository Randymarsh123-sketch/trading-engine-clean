import { sendTelegram } from "../lib/telegram.js";

export default async function handler(req, res) {
  try {

    await sendTelegram("🚀 Trading engine Telegram test OK");

    return res.status(200).json({
      ok: true,
      message: "Telegram test sent"
    });

  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}
