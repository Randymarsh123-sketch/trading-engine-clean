import { sendTelegram } from "../lib/telegram.js"
import { RULES } from "../lib/londonRules.js"

export default async function handler(req, res) {

  try {

    const isTest = typeof req.query.test !== "undefined"

    // ❌ stopp helg kun live
    if (!isTest) {
      const now = new Date()
      const day = now.getUTCDay()
      if (day === 0 || day === 6) {
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

    let targetDate

    if (isTest) {
      const parts = req.query.test.split("-")
      targetDate = `${parts[0]}-${parts[1]}-${parts[2]}`
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

    let high = -Infinity
    let low = Infinity

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

      if (hour >= 2 && hour < 7) {
        const h = parseFloat(c.high)
        const l = parseFloat(c.low)

        if (h > high) high = h
        if (l < low) low = l
      }
    }

    if (high === -Infinity) {
      await sendTelegram(`❌ No Asia data for ${targetDate}`)
      return res.status(200).json({ ok: true })
    }

    const rangePips = ((high - low) * 10000)

    // =====================
    // RANGE CLASSIFICATION
    // =====================

    let rangeType = "medium"

    if (rangePips <= 15) rangeType = "small"
    else if (rangePips >= 25) rangeType = "large"

    // =====================
    // SCORING (simple v1)
    // =====================

    let scoreHigh = 0
    let scoreLow = 0

    // Early timing (always true kl 08)
    scoreHigh += RULES.SCORING.earlyTiming
    scoreLow += RULES.SCORING.earlyTiming

    // Range
    if (rangeType === "small") {
      scoreHigh += RULES.SCORING.smallRange
      scoreLow += RULES.SCORING.smallRange
    }

    // =====================
    // CONVICTION
    // =====================

    function getConviction(score) {
      if (score >= RULES.CONVICTION.high.min) return "HIGH"
      if (score >= RULES.CONVICTION.medium.min) return "MEDIUM"
      return "LOW"
    }

    const convHigh = getConviction(scoreHigh)
    const convLow = getConviction(scoreLow)

    // =====================
    // MESSAGE
    // =====================

    const msg =
`LONDON OUTLOOK

Date: ${targetDate}

Asia Range: ${rangePips.toFixed(1)} pips
Session: 02:00–07:00 (Oslo)

EDGE FOUND (Base model)

Scenario 1

IF London sweeps ASIA HIGH FIRST
→ Expect move DOWN

Type: Asia High
Timing: Early (${RULES.TIMING.early.label})
Conviction: ${convHigh}

Scenario 2

IF London sweeps ASIA LOW FIRST
→ Expect move UP

Type: Asia Low
Timing: Early (${RULES.TIMING.early.label})
Conviction: ${convLow}

Notes:
- Base edge winrate ~75–81% (15p)
- First sweep is trigger
- Internal liquidity not included (v1)`

    await sendTelegram(msg)

    return res.status(200).json({ ok: true })

  } catch (err) {

    console.error(err)
    await sendTelegram(`❌ Engine error: ${err.message}`)

    return res.status(200).json({ ok: true })
  }
}
