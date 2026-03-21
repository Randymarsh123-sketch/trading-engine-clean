export const RULES = {

  DATASET: {
    days: 444
  },

  BASE_EDGE: {
    occurrence: "35–40%",
    firstSweepDistribution: {
      internal: 41,
      asiaHigh: 29,
      asiaLow: 30
    },
    winrates: {
      p15: {
        internal: 81.2,
        asiaHigh: 75.6,
        asiaLow: 76.8
      },
      p20: {
        internal: 68.5,
        asiaHigh: 63.1,
        asiaLow: 64.0
      }
    }
  },

  TIMING: {
    early: {
      label: "08:00–09:15",
      occurrence: 52,
      winrate15: 81.8,
      winrate20: 70.2,
      score: 2
    },
    mid: {
      label: "09:15–10:00",
      occurrence: 28,
      winrate15: 77.1,
      winrate20: 65.4,
      score: 1
    },
    late: {
      label: "10:00+",
      occurrence: 20,
      winrate15: 71.3,
      winrate20: 59.1,
      score: 0
    }
  },

  RANGE: {
    small: {
      label: "0–15 pips",
      occurrence: 28,
      winrate15: 79.4,
      score: 0.5
    },
    medium: {
      label: "15–25 pips",
      occurrence: 46,
      winrate15: 77.2,
      score: 0
    },
    large: {
      label: "25+ pips",
      occurrence: 26,
      winrate15: 74.8,
      score: -1
    }
  },

  SCORING: {
    internal: 2,
    earlyTiming: 2,
    prevDayAlignment: 2,
    asiaTrend: 1,
    lateAsia: 1,
    smallRange: 0.5
  },

  CONVICTION: {
    low: { min: 0, max: 2 },
    medium: { min: 3, max: 5 },
    high: { min: 6 }
  }

}
