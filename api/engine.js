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

    // ❌ stopp helg kun live
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
      await sendTelegram("❌ No data from TwelveData")
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

      if (`${y}-${m}-${d}` !== targetDate) continue

      const h = oslo.getHours()

      if (h >= 2 && h < 7) {
        const hi = parseFloat(c.high)
        const lo = parseFloat(c.low)

        if (hi > asiaHigh) asiaHigh = hi
        if (lo < asiaLow) asiaLow = lo
      }
    }

    // =====================
    // 08:05 ALERT (unchanged)
    // =====================

    if (mode === "0805") {

      const msg =
`LONDON OUTLOOK

Date: ${targetDate}

Asia Range: ${((asiaHigh - asiaLow) * 10000).toFixed(1)} pips

Scenario 1

IF London sweeps ASIA HIGH FIRST
→ Expect move DOWN

Scenario 2

IF London sweeps ASIA LOW FIRST
→ Expect move UP`

      await sendTelegram(msg)
    }

    // =====================
    // 09:20 ALERT (FULL PROMPT STRUCTURE)
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

        if (`${y}-${m}-${d}` !== targetDate) continue

        const h = oslo.getHours()
        const min = oslo.getMinutes()

        // 08:00–09:20 window
        if (h < 8 || (h === 9 && min > 20) || h > 9) continue

        const high = parseFloat(c.high)
        const low = parseFloat(c.low)
        const close = parseFloat(c.close)

        if (!firstSweep && high > asiaHigh && close <= asiaHigh) {
          firstSweep = "Asia high"
          sweepTime = `${h}:${String(min).padStart(2,"0")}`
        }

        if (!firstSweep && low < asiaLow && close >= asiaLow) {
          firstSweep = "Asia low"
          sweepTime = `${h}:${String(min).padStart(2,"0")}`
        }
      }

      let msg

      if (firstSweep) {

        const direction = firstSweep.includes("high") ? "lower" : "higher"

        msg =
`London Update

First sweep confirmed

Type: ${firstSweep}

Time of sweep: ${sweepTime}

Direction:
If sweep ${firstSweep.includes("high") ? "high" : "low"} → expect move ${direction}

Context:
Asia direction: Not available (v1)
Previous day direction: Not available (v1)
Late Asia behavior: Not available (v1)

Alignment:
Mixed

Conviction:
MEDIUM

Final line:

Wait for LIT setup`

      } else {

        msg =
`London Update

No valid sweep detected yet

No active edge

Timing note:
Most sweeps occur before 09:15

If sweep occurs later → reduced probability

Context:
Not available (v1)

Final line:

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
