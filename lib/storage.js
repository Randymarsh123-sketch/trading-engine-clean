const { kv } = require("@vercel/kv");

const TWELVEDATA_API_KEY = process.env.TWELVEDATA_API_KEY;

async function kvGetJson(key) {
  const data = await kv.get(key);
  return data || null;
}

async function kvSetJson(key, value) {
  await kv.set(key, value);
}

async function fetch5mFromTwelveData({ symbol, outputsize }) {
  const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=5min&outputsize=${outputsize}&apikey=${TWELVEDATA_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (!data.values) {
    throw new Error("TwelveData fetch failed");
  }

  // Convert to clean format
  return data.values.map(c => ({
    ms: new Date(c.datetime).getTime(),
    open: parseFloat(c.open),
    high: parseFloat(c.high),
    low: parseFloat(c.low),
    close: parseFloat(c.close),
    volume: parseFloat(c.volume || 0)
  })).reverse(); // oldest → newest
}

function mergeAndTrimCandles({ existing, incoming, keepDays }) {
  const map = new Map();

  for (const c of existing) {
    map.set(c.ms, c);
  }

  for (const c of incoming) {
    map.set(c.ms, c);
  }

  const merged = Array.from(map.values())
    .sort((a, b) => a.ms - b.ms);

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;

  return merged.filter(c => c.ms >= cutoff);
}

module.exports = {
  kvGetJson,
  kvSetJson,
  fetch5mFromTwelveData,
  mergeAndTrimCandles
};
