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

    // ❌ stopp helg (kun live)
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
    // ASIA DATA
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

    // range type
    let rangeType = "SMALL"
    if (range >= 15) rangeType = "VALID"
    if (range >= 25) rangeType = "LARGE"

    // Asia trend
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

      let edge = "NO EDGE"

      if (hasCluster && range >= 15) {
        edge = "MID CLUSTER EDGE"
      }

      const msg =
`LONDON OUTLOOK

Date: ${targetDate}

Asia Range: ${range.toFixed(1)} pips
Range Type: ${rangeType}

Asia Direction: ${asiaDir}

Mid Cluster: ${hasCluster ? "YES" : "NO"} (${cluster.length})

EDGE:
${edge}

Scenario 1

IF London sweeps ASIA HIGH FIRST
→ Expect move DOWN

Scenario 2

IF London sweeps ASIA LOW FIRST
→ Expect move UP`

      await sendTelegram(msg)
    }

    // =====================
    // 09:20 ALERT
    // =====================

    if (mode === "0920") {

      let firstSweep = null
      let sweepTime = null
      let conviction = "NONE"

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

        // 🔥 MID CLUSTER FIRST
        if (!firstSweep && hasCluster) {

          if (asiaDir === "UP") {
            if (low < clusterLow && close >= clusterLow) {
              firstSweep = "MID LOW"
              sweepTime = `${h}:${String(min).padStart(2,"0")}`
            }
          }

          if (asiaDir === "DOWN") {
            if (high > clusterHigh && close <= clusterHigh) {
              firstSweep = "MID HIGH"
              sweepTime = `${h}:${String(min).padStart(2,"0")}`
            }
          }
        }

        // 🔁 FALLBACK TO ASIA
        if (!firstSweep) {

          if (high > asiaHigh && close <= asiaHigh) {
            firstSweep = "ASIA HIGH"
            sweepTime = `${h}:${String(min).padStart(2,"0")}`
          }

          if (low < asiaLow && close >= asiaLow) {
            firstSweep = "ASIA LOW"
            sweepTime = `${h}:${String(min).padStart(2,"0")}`
          }
        }
      }

      // =====================
      // CONVICTION
      // =====================

      if (firstSweep) {

        const isEarly = sweepTime && (
          parseInt(sweepTime.split(":")[0]) === 9 &&
          parseInt(sweepTime.split(":")[1]) <= 15
        )

        if (
          firstSweep.includes("MID") &&
          range >= 15 &&
          isEarly
        ) {
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

        const direction = firstSweep.includes("HIGH")
          ? "lower"
          : "higher"

        msg =
`London Update

First sweep confirmed

Type: ${firstSweep}

Time of sweep: ${sweepTime}

Direction:
If sweep ${firstSweep.includes("HIGH") ? "high" : "low"} → expect move ${direction}

Context:
Asia direction: ${asiaDir}
Range: ${range.toFixed(1)} pips

Conviction:
${conviction}

Final line:

Wait for LIT setup`

      } else {

        msg =
`London Update

No valid sweep detected yet

No active edge

Context:
Range: ${range.toFixed(1)} pips

Final line:

Wait for first sweep`
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
