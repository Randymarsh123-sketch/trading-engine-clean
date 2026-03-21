import { sendTelegram } from "../lib/telegram.js"

export default async function handler(req, res) {

  try {

    // ❌ stopp helg
    const now = new Date()
    const day = now.getUTCDay()

    if (day === 0 || day === 6) {
      return res.status(200).json({ ok: true })
    }

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
      await sendTelegram("❌ No data from TwelveData")
      return res.status(200).json({ ok: true })
    }

    const candles = data.values.reverse()

    // 👉 dagens dato (UTC anchor)
    const baseDate = new Date()

    const year = baseDate.getUTCFullYear()
    const month = String(baseDate.getUTCMonth()+1).padStart(2,"0")
    const dayStr = String(baseDate.getUTCDate()).padStart(2,"0")

    const targetDate = `${year}-${month}-${dayStr}`

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

      // 👉 Asia session: 02:00–06:59 Oslo
      if (hour >= 2 && hour < 7) {

        const h = parseFloat(c.high)
        const l = parseFloat(c.low)

        if (h > high) high = h
        if (l < low) low = l

        count++
      }
    }

    if (count === 0) {
      await sendTelegram(`❌ No Asia candles for ${targetDate}`)
      return res.status(200).json({ ok: true })
    }

    const rangePips = ((high - low) * 10000).toFixed(1)

    const msg =
`EURUSD Asia Session

Date: ${targetDate}

Session: 02:00–07:00 (Oslo)

High: ${high}
Low: ${low}
Range: ${rangePips} pips`

    await sendTelegram(msg)

    return res.status(200).json({ ok: true })

  } catch (err) {

    console.error(err)

    await sendTelegram(`❌ Engine error: ${err.message}`)

    return res.status(200).json({ ok: true })
  }
}
