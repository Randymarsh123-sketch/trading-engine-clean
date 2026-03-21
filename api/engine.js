import { sendTelegram } from "../lib/telegram.js"

const API_KEY = process.env.TWELVEDATA_API_KEY

const ASIA_START_UTC = 1
const ASIA_END_UTC = 6

async function getCandles() {

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=EUR/USD` +
    `&interval=5min` +
    `&outputsize=1000` +
    `&timezone=UTC` +
    `&apikey=${API_KEY}`

  try {

    const res = await fetch(url)
    const data = await res.json()

    if (!data.values) {
      console.error("TwelveData error:", data)
      return []
    }

    return data.values.reverse()

  } catch (err) {
    console.error("Fetch failed:", err)
    return []
  }
}

function getAsiaCandles(candles, targetDate) {

  const asia = []

  for (const c of candles) {

    const d = new Date(c.datetime)

    const year = d.getUTCFullYear()
    const month = String(d.getUTCMonth() + 1).padStart(2,"0")
    const day = String(d.getUTCDate()).padStart(2,"0")

    const candleDate = `${year}-${month}-${day}`

    if (candleDate !== targetDate) continue

    const hour = d.getUTCHours()

    if (hour >= ASIA_START_UTC && hour < ASIA_END_UTC) {
      asia.push(c)
    }
  }

  return asia
}

function calcStats(asia) {

  let high = -Infinity
  let low = Infinity

  for (const c of asia) {

    const h = parseFloat(c.high)
    const l = parseFloat(c.low)

    if (h > high) high = h
    if (l < low) low = l
  }

  const open = parseFloat(asia[0].open)
  const close = parseFloat(asia[asia.length - 1].close)

  const range = high - low
  const rangePips = (range * 10000).toFixed(1)

  return {
    open,
    high,
    low,
    close,
    rangePips
  }
}

function buildDebug(asia) {

  let out = "\nAsia candles:\n\n"

  for (const c of asia) {

    const utc = new Date(c.datetime)

    const oslo = new Date(
      utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
    )

    out +=
`${c.datetime}
UTC:   ${utc.toISOString()}
OSLO:  ${oslo.toISOString()}
O:${c.open} H:${c.high} L:${c.low} C:${c.close}

`
  }

  return out
}

function formatDate(d) {

  const day = String(d.getDate()).padStart(2,"0")
  const month = String(d.getMonth()+1).padStart(2,"0")
  const year = d.getFullYear()

  return `${day}.${month}.${year}`
}

export default async function handler(req, res) {

  try {

    const isTest = typeof req.query.days !== "undefined"

    // ❌ STOPP HELG (kun live, ikke test)
    if (!isTest) {
      const now = new Date()
      const day = now.getUTCDay()

      if (day === 0 || day === 6) {
        return res.status(200).json({ ok:true })
      }
    }

    const candles = await getCandles()

    if (!candles || candles.length === 0) {
      await sendTelegram("❌ No candle data returned")
      return res.status(200).json({ ok:true })
    }

    const daysBack = parseInt(req.query.days || "0")

    const baseDate = new Date()
    baseDate.setUTCDate(baseDate.getUTCDate() - daysBack)

    const year = baseDate.getUTCFullYear()
    const month = String(baseDate.getUTCMonth()+1).padStart(2,"0")
    const dayStr = String(baseDate.getUTCDate()).padStart(2,"0")

    const targetDate = `${year}-${month}-${dayStr}`

    const asia = getAsiaCandles(candles, targetDate)

    if (asia.length === 0) {
      await sendTelegram(`❌ No Asia candles found for ${targetDate}`)
      return res.status(200).json({ ok:true })
    }

    const stats = calcStats(asia)

    const first = asia[0].datetime
    const last = asia[asia.length-1].datetime

    const debug = buildDebug(asia)

    const dateStr = formatDate(new Date(targetDate))

    const msg =
`TEST RUN

EURUSD Asia Session ${dateStr}

Range: ${stats.rangePips} pips

Open: ${stats.open}
High: ${stats.high}
Low: ${stats.low}
Close: ${stats.close}

Candles: ${asia.length}

First: ${first}
Last: ${last}

${debug}`

    await sendTelegram(msg)

    res.status(200).json({ ok:true })

  } catch (err) {

    console.error("ENGINE ERROR:", err)

    await sendTelegram(`❌ Engine crashed: ${err.message}`)

    res.status(200).json({ ok:true })
  }
}
