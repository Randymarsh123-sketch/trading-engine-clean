import { sendTelegram } from "../lib/telegram.js"

const API_KEY = process.env.TWELVEDATA_API_KEY

// Asia session in UTC
// Oslo 02:00–07:00 = UTC 01:00–06:00
const ASIA_START_UTC = 1
const ASIA_END_UTC = 5

async function getCandles() {

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=EUR/USD` +
    `&interval=5min` +
    `&outputsize=500` +
    `&apikey=${API_KEY}`

  const res = await fetch(url)
  const data = await res.json()

  if (!data.values) {
    throw new Error("No candle data returned")
  }

  // oldest → newest
  return data.values.reverse()
}

function getAsiaCandles(candles, targetDate) {

  const asia = []

  for (const c of candles) {

    const d = new Date(c.datetime + "Z")

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

  const range = (high - low)
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

  let out = "\nAsia candles:\n"

  for (const c of asia) {
    out += `${c.datetime} O:${c.open} H:${c.high} L:${c.low} C:${c.close}\n`
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

    const candles = await getCandles()

    let testMode = false
    let targetDate

    if (req.query.test) {

      testMode = true

      const parts = req.query.test.split("-")
      targetDate = `${parts[0]}-${parts[1]}-${parts[2]}`

    } else {

      const now = new Date()

      const year = now.getUTCFullYear()
      const month = String(now.getUTCMonth()+1).padStart(2,"0")
      const day = String(now.getUTCDate()).padStart(2,"0")

      targetDate = `${year}-${month}-${day}`
    }

    const asia = getAsiaCandles(candles, targetDate)

    if (asia.length === 0) {

      if (testMode) {
        await sendTelegram("No Asia data found.")
      }

      return res.status(200).json({ ok:true })
    }

    const stats = calcStats(asia)

    const first = asia[0].datetime
    const last = asia[asia.length-1].datetime

    const debug = buildDebug(asia)

    const dateStr = formatDate(new Date(targetDate))

    const msg =
`TEST RUN

EURUSD London Session Outlook ${dateStr}

Asia Range: ${stats.rangePips} pips

Asia Open: ${stats.open}
Asia High: ${stats.high}
Asia Low: ${stats.low}
Asia Close: ${stats.close}

Asia Candle Count: ${asia.length}

First Asia Candle: ${first}
Last Asia Candle: ${last}

${debug}`

    if (testMode) {
      await sendTelegram(msg)
    }

    res.status(200).json({ ok:true })

  } catch (err) {

    console.error(err)

    res.status(500).json({ error: err.message })
  }
}
