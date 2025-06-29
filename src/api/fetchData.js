import axios from 'axios'
import { EMA } from 'technicalindicators'

const SYMBOL = 'ETHUSDT'
const INTERVAL = '5m'
const LIMIT = 200

export async function fetchChartData() {
  const url = `https://api.binance.com/api/v3/klines?symbol=${SYMBOL}&interval=${INTERVAL}&limit=${LIMIT}`
  const res = await axios.get(url)

  const raw = res.data.map((k) => ({
    time: k[0],
    open: +k[1],
    high: +k[2],
    low: +k[3],
    close: +k[4],
  }))

  const closes = raw.map((p) => p.close)

  const ema = (period) => EMA.calculate({ period, values: closes })

  const ema20 = ema(20)
  const ema50 = ema(50)
  const ema100 = ema(100)
  const ema200 = ema(200)

  return raw.map((p, i) => ({
    ...p,
    time: new Date(p.time),
    ema20: i >= 19 ? ema20[i - 19] : null,
    ema50: i >= 49 ? ema50[i - 49] : null,
    ema100: i >= 99 ? ema100[i - 99] : null,
    ema200: i >= 199 ? ema200[i - 199] : null,
  }))
}
