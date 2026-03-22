import { sendTelegram } from "../lib/telegram.js"

export default async function handler(req, res) {

  try {

    const isTest = typeof req.query.test !== "undefined"
    const mode = req.query.mode || "0805"

    const now = new Date()

    const osloNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
    )

    const hour = osloNow.getHours()
    const minute = osloNow.getMinutes()

    // ❌ stopp helg
    if (!isTest) {
      const day = osloNow.getDay()
      if (day === 0 || day === 6) {
        return res.status(200).json({ ok: true })
      }
    }

    // ⏰ TIME GATING
    if (!isTest) {
      if (!(hour === 8 && minute === 5) && !(hour === 9 && minute === 20)) {
        return res.status(200).json({ ok: true })
      }
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
      await sendTelegram("❌ No data")
      return res.status(200).json({ ok: true })
    }

    const candles = data.values.reverse()

    // =====================
    // DATE
    // =====================

    let targetDate = isTest ? req.query.test : (() => {
      const d = new Date()
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth()+1).padStart(2,"0")
      const da = String(d.getUTCDate()).padStart(2,"0")
      return `${y}-${m}-${da}`
    })()

    // =====================
    // ASIA
    // =====================

    let asiaHigh = -Infinity
    let asiaLow = Infinity
    let asiaCandles = []

    for (const c of candles) {

      const utc = new Date(c.datetime)
      const oslo = new Date(
        utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
      )

      const y = oslo.getFullYear()
      const m = String(oslo.getMonth()+1).padStart(2,"0")
      const d = String(oslo.getDate()).padStart(2,"0")

      if (`${y}-${m}-${d}` !== targetDate) continue

      const h = oslo.getHours()

      if (h >= 2 && h < 7) {
        asiaCandles.push({ ...c, oslo })
        const hi = parseFloat(c.high)
        const lo = parseFloat(c.low)

        if (hi > asiaHigh) asiaHigh = hi
        if (lo < asiaLow) asiaLow = lo
      }
    }

    const range = (asiaHigh - asiaLow) * 10000
    const mid = (asiaHigh + asiaLow) / 2

    let rangeType = "SMALL"
    if (range >= 15) rangeType = "VALID"
    if (range >= 25) rangeType = "LARGE"

    const asiaOpen = parseFloat(asiaCandles[0]?.open || 0)
    const asiaClose = parseFloat(asiaCandles[asiaCandles.length-1]?.close || 0)
    const asiaDir = asiaClose > asiaOpen ? "UP" : "DOWN"

    // =====================
    // MID CLUSTER
    // =====================

    const zoneSize = (asiaHigh - asiaLow) * 0.10
    const zoneHigh = mid + zoneSize
    const zoneLow = mid - zoneSize

    const cluster = asiaCandles.filter(c =>
      parseFloat(c.high) >= zoneLow &&
      parseFloat(c.low) <= zoneHigh
    )

    const hasCluster = cluster.length >= 6

    const clusterHigh = hasCluster
      ? Math.max(...cluster.map(c => parseFloat(c.high)))
      : null

    const clusterLow = hasCluster
      ? Math.min(...cluster.map(c => parseFloat(c.low)))
      : null

    // =====================
    // 08:05 ALERT
    // =====================

    if (mode === "0805") {

      let modelText = "NO CLEAR EDGE"

      if (range >= 15 && hasCluster) {
        modelText =
`PRIMARY MODEL (HIGH PROBABILITY)

IF London sweeps MID CLUSTER first
→ expect CONTINUATION in Asia direction (${asiaDir})

SECONDARY MODEL

IF London sweeps ASIA HIGH/LOW first
→ expect REVERSAL`
      }

      const msg =
`LONDON OUTLOOK

Date: ${targetDate}

Asia Range: ${range.toFixed(1)} pips (${rangeType})
Asia Direction: ${asiaDir}

Mid Cluster: ${hasCluster ? "YES" : "NO"} (${cluster.length})

MODEL:

${modelText}

NOTES:
- 09:00–09:15 = highest probability window
- Range <15 = avoid`

      await sendTelegram(msg)
    }

    // =====================
    // 09:20 ALERT
    // =====================

    if (mode === "0920") {

      let firstSweep = null
      let sweepTime = null
      let modelUsed = null
      let conviction = "LOW"

      for (const c of candles) {

        const utc = new Date(c.datetime)
        const oslo = new Date(
          utc.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
        )

        const y = oslo.getFullYear()
        const m = String(oslo.getMonth()+1).padStart(2,"0")
        const d = String(oslo.getDate()).padStart(2,"0")

        if (`${y}-${m}-${d}` !== targetDate) continue

        const h = oslo.getHours()
        const min = oslo.getMinutes()

        if (h < 8 || (h === 9 && min > 20) || h > 9) continue

        const high = parseFloat(c.high)
        const low = parseFloat(c.low)
        const close = parseFloat(c.close)

        // MID FIRST
        if (!firstSweep && hasCluster) {

          if (asiaDir === "UP") {
            if (low < clusterLow && close >= clusterLow) {
              firstSweep = "MID LOW"
              modelUsed = "CONTINUATION"
              sweepTime = `${h}:${String(min).padStart(2,"0")}`
            }
          }

          if (asiaDir === "DOWN") {
            if (high > clusterHigh && close <= clusterHigh) {
              firstSweep = "MID HIGH"
              modelUsed = "CONTINUATION"
              sweepTime = `${h}:${String(min).padStart(2,"0")}`
            }
          }
        }

        // ASIA FALLBACK
        if (!firstSweep) {

          if (high > asiaHigh && close <= asiaHigh) {
            firstSweep = "ASIA HIGH"
            modelUsed = "REVERSAL"
            sweepTime = `${h}:${String(min).padStart(2,"0")}`
          }

          if (low < asiaLow && close >= asiaLow) {
            firstSweep = "ASIA LOW"
            modelUsed = "REVERSAL"
            sweepTime = `${h}:${String(min).padStart(2,"0")}`
          }
        }
      }

      // =====================
      // CONVICTION
      // =====================

      if (firstSweep) {

        const [h, m] = sweepTime.split(":").map(Number)
        const early = h === 9 && m <= 15

        if (modelUsed === "CONTINUATION" && early && range >= 15) {
          conviction = "HIGH"
        }
        else if (range >= 15) {
          conviction = "MEDIUM"
        }
        else {
          conviction = "LOW"
        }
      }

      // =====================
      // MESSAGE
      // =====================

      let msg

      if (firstSweep) {

        let direction = "UNKNOWN"

        if (modelUsed === "REVERSAL") {
          direction = firstSweep.includes("HIGH") ? "DOWN" : "UP"
        }

        if (modelUsed === "CONTINUATION") {
          direction = asiaDir
        }

        msg =
`London Update

First sweep confirmed

Type: ${firstSweep}
Model: ${modelUsed}

Time: ${sweepTime}

Expected Move:
${direction}

Context:
Asia Direction: ${asiaDir}
Range: ${range.toFixed(1)} pips

Conviction:
${conviction}

Final:
Wait for LIT setup`

      } else {

        msg =
`London Update

No sweep yet

Bias:
Await first liquidity sweep

Context:
Range: ${range.toFixed(1)} pips
Asia Direction: ${asiaDir}

Final:
Wait for setup`
      }

      await sendTelegram(msg)
    }

    return res.status(200).json({ ok: true })

  } catch (err) {

    console.error(err)
    await sendTelegram(`❌ Engine error: ${err.message}`)

    return res.status(200).json({ ok: true })
  }
}
