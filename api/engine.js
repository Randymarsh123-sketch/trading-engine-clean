export default async function handler(req, res) {

  try {

    const url = `https://api.telegram.org/bot8662614781:AAEWm8XxLymsUMtu54Z6ERkqKO3SP4448Xk/sendMessage`

    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: "8263696819",
        text: "🔥 DIRECT ENGINE TEST"
      })
    })

    return res.status(200).json({ ok: true })

  } catch (err) {

    console.error("ENGINE ERROR:", err)

    return res.status(200).json({ ok: true })
  }
}
