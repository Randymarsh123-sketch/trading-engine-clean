import { sendTelegram } from "../lib/telegram.js"
import { RULES } from "../lib/londonRules.js"

export default async function handler(req, res) {

  try {

    const isTest = typeof req.query.test !== "undefined"
    const mode = req.query.mode || "0805" // default = 08 alert

    const now = new Date()

    const osloNow = new Date(
      now.toLocaleString("en-US", { timeZone: "Europe/Oslo" })
    )

    const hour = osloNow.getHours()
    const minute = osloNow.getMinutes()

    // ❌ stopp helg kun live
    if (!isTest) {
      const day = osloNow.getDay()
      if (day === 0 || day === 6) {
        return res.status(200).json({ ok: true })
      }
    }

    // =====================
    // TIME GATING (live)
    // =====================

    if (!isTest) {
      if (hour === 8 && minute === 5) {
        // run 08 alert
      } else if (hour === 9 && minute === 20) {
        // run 09:20 alert
      } else {
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
      await sendTelegram("❌ No data from TwelveData")
      return res.status(200).json({ ok: true })
    }

    const candles = data.values.reverse()

    // =====================
    // DATE
    // =====================

    let targetDate

    if (isTest) {
      targetDate = req.query.test
    } else {
      const d = new Date()
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth()+1).padStart(2,"0")
      const da = String(d.getUTCDate()).padStart(2,"0")
      targetDate = `${y}-${m}-${da}`
    }

    // =====================
    // ASIA RANGE
    // =====================

    let asiaHigh = -Infinity
    let asiaLow = Infinity

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

      const h = oslo.getHours()

      if (h >= 2 && h < 7) {
        const hi = parseFloat(c.high)
        const lo = parseFloat(c.low)

        if (hi > asiaHigh) asiaHigh = hi
        if (lo < asiaLow) asiaLow = lo
      }
    }

    if (asiaHigh === -Infinity) {
      await sendTelegram("❌ No Asia data")
      return res.status(200).json({ ok: true })
    }

    const rangePips = (asiaHigh - asiaLow) * 10000

    // =====================
    // 08:05 ALERT
    // =====================

    if (mode === "0805") {

      let scoreHigh = RULES.SCORING.earlyTiming
      let scoreLow = RULES.SCORING.earlyTiming

      function getConviction(score) {
        if (score >= 6) return "HIGH"
        if (score >= 3) return "MEDIUM"
        return "LOW"
      }

      const msg =
`LONDON OUTLOOK

Date: ${targetDate}

Asia Range: ${rangePips.toFixed(1)} pips
Session: 02:00–07:00 (Oslo)

EDGE FOUND (Base model)

Scenario 1

IF London sweeps ASIA HIGH FIRST
→ Expect move DOWN

Conviction: ${getConviction(scoreHigh)}

Scenario 2

IF London sweeps ASIA LOW FIRST
→ Expect move UP

Conviction: ${getConviction(scoreLow)}

Notes:
- First sweep defines bias
- Base winrate ~75–81% (15p)`

      await sendTelegram(msg)
    }

    // =====================
    // 09:20 ALERT
    // =====================

    if (mode === "0920") {

      let firstSweep = null
      let sweepTime = null

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

        const h = oslo.getHours()
        const min = oslo.getMinutes()

        // only London window
        if (h < 8 || (h === 9 && min > 20) || h > 9) continue

        const high = parseFloat(c.high)
        const low = parseFloat(c.low)
        const close = parseFloat(c.close)

        // sweep high
        if (!firstSweep && high > asiaHigh && close <= asiaHigh) {
          firstSweep = "ASIA HIGH"
          sweepTime = `${h}:${String(min).padStart(2,"0")}`
        }

        // sweep low
        if (!firstSweep && low < asiaLow && close >= asiaLow) {
          firstSweep = "ASIA LOW"
          sweepTime = `${h}:${String(min).padStart(2,"0")}`
        }
      }

      let msg

      if (firstSweep) {

        const direction =
          firstSweep === "ASIA HIGH" ? "DOWN" : "UP"

        msg =
`London Update

First sweep confirmed

Type: ${firstSweep}

Time of sweep: ${sweepTime}

Direction:
IF sweep ${firstSweep.includes("HIGH") ? "high" : "low"} → expect move ${direction}

Conviction: MEDIUM

Final:
Wait for LIT setup`

      } else {

        msg =
`London Update

No valid sweep detected yet

No active edge

Timing note:
Most sweeps occur before 09:15

If sweep occurs later → reduced probability

Final:
Wait for first sweep
or LIT setup if no clear move develops`
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
