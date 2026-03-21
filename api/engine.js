export default async function handler(req, res) {

  const TELEGRAM_URL = `https://api.telegram.org/bot8662614781:AAEWm8XxLymsUMtu54Z6ERkqKO3SP4448Xk/sendMessage`

  function send(msg) {
    return fetch(TELEGRAM_URL, {
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

    await send("🚀 ENGINE START")

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
      await send("❌ No data from TwelveData")
      return res.status(200).json({ ok:true })
    }

    const candles = data.values.reverse()

    await send(`✅ Candles fetched: ${candles.length}`)

    const daysBack = parseInt(req.query.days || "0")

    const baseDate = new Date()
    baseDate.setUTCDate(baseDate.getUTCDate() - daysBack)

    const year = baseDate.getUTCFullYear()
    const month = String(baseDate.getUTCMonth()+1).padStart(2,"0")
    const day = String(baseDate.getUTCDate()).padStart(2,"0")

    const targetDate = `${year}-${month}-${day}`

    const asia = []

    for (const c of candles) {

      const d = new Date(c.datetime)

      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth()+1).padStart(2,"0")
      const d2 = String(d.getUTCDate()).padStart(2,"0")

      const dateStr = `${y}-${m}-${d2}`

      if (dateStr !== targetDate) continue

      const hour = d.getUTCHours()

      if (hour >= 1 && hour < 6) {
        asia.push(c)
      }
    }

    await send(`📊 Asia candles: ${asia.length}`)

    if (asia.length === 0) {
      await send(`❌ No Asia candles for ${targetDate}`)
      return res.status(200).json({ ok:true })
    }

    let high = -Infinity
    let low = Infinity

    for (const c of asia) {
      const h = parseFloat(c.high)
      const l = parseFloat(c.low)

      if (h > high) high = h
      if (l < low) low = l
    }

    const open = asia[0].open
    const close = asia[asia.length - 1].close

    const range = ((high - low) * 10000).toFixed(1)

    let debug = `\n\nCandles:\n\n`

    for (const c of asia) {

      const utc = new Date(c.datetime)

      const oslo = new Date(
        utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
      )

      debug +=
`${c.datetime}
UTC: ${utc.toISOString()}
OSLO: ${oslo.toISOString()}
O:${c.open} H:${c.high} L:${c.low} C:${c.close}

`
    }

    const msg =
`TEST

Date: ${targetDate}

Range: ${range} pips

Open: ${open}
High: ${high}
Low: ${low}
Close: ${close}

${debug}`

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
        text: `❌ CRASH: ${err.message}`
      })
    })

    return res.status(200).json({ ok:true })
  }
}
