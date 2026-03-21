export default async function handler(req, res) {

  const TELEGRAM_URL = `https://api.telegram.org/bot8662614781:AAEWm8XxLymsUMtu54Z6ERkqKO3SP4448Xk/sendMessage`

  async function send(msg) {
    await fetch(TELEGRAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: "8263696819",
        text: msg
      })
    })
  }

  try {

    const API_KEY = process.env.TWELVEDATA_API_KEY

    const url =
      `https://api.twelvedata.com/time_series` +
      `?symbol=EUR/USD` +
      `&interval=5min` +
      `&outputsize=1000` +
      `&timezone=UTC` +
      `&apikey=${API_KEY}`

    const resApi = await fetch(url)
    const data = await resApi.json()

    if (!data.values) {
      await send("❌ No data from API")
      return res.status(200).json({ ok:true })
    }

    const candles = data.values.reverse()

    const daysBack = parseInt(req.query.days || "0")

    const baseDate = new Date()
    baseDate.setUTCDate(baseDate.getUTCDate() - daysBack)

    const year = baseDate.getUTCFullYear()
    const month = String(baseDate.getUTCMonth()+1).padStart(2,"0")
    const day = String(baseDate.getUTCDate()).padStart(2,"0")

    const targetDate = `${year}-${month}-${day}`

    let high = -Infinity
    let low = Infinity

    let count = 0

    for (const c of candles) {

      const utc = new Date(c.datetime)

      const oslo = new Date(
        utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
      )

      const y = oslo.getFullYear()
      const m = String(oslo.getMonth()+1).padStart(2,"0")
      const d = String(oslo.getDate()).padStart(2,"0")

      const dateStr = `${y}-${m}-${d}`

      if (dateStr !== targetDate) continue

      const hour = oslo.getHours()

      // 👉 Asia: 02:00–06:59 Oslo
      if (hour >= 2 && hour < 7) {

        const h = parseFloat(c.high)
        const l = parseFloat(c.low)

        if (h > high) high = h
        if (l < low) low = l

        count++
      }
    }

    if (count === 0) {
      await send(`❌ No Asia candles for ${targetDate}`)
      return res.status(200).json({ ok:true })
    }

    const rangePips = ((high - low) * 10000).toFixed(1)

    const msg =
`ASIA RANGE TEST

Date: ${targetDate}

High: ${high}
Low: ${low}

Range: ${rangePips} pips

Candles counted: ${count}`

    await send(msg)

    return res.status(200).json({ ok:true })

  } catch (err) {

    await fetch(`https://api.telegram.org/bot8662614781:AAEWm8XxLymsUMtu54Z6ERkqKO3SP4448Xk/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        chat_id: "8263696819",
        text: `❌ ERROR: ${err.message}`
      })
    })

    return res.status(200).json({ ok:true })
  }
}
