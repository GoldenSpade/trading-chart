<template>
  <div style="background:#121212; padding:0 16px; position:relative;">
    <!-- Верхняя панель -->
    <div class="top-panel">
      <!-- Левая панель — при наведении -->
      <div class="hover-panel-left">
        <span>🕒 {{ hoverData.time }}</span>
        <span>O: {{ hoverData.o }}</span>
        <span>H: {{ hoverData.h }}</span>
        <span>L: {{ hoverData.l }}</span>
        <span>C: {{ hoverData.c }}</span>
        <span :class="hoverData.up ? 'up' : 'down'">
          {{ hoverData.up ? '+' : '' }}{{ hoverData.changeAbs }} ({{ hoverData.up ? '+' : '' }}{{ hoverData.changePct }}%)
        </span>
      </div>
      <!-- Правая панель — всегда -->
      <div class="latest-panel-right">
        <div>
          <span>🕒 {{ latestData.time }}</span>
          <span>O: {{ latestData.o }}</span>
          <span>H: {{ latestData.h }}</span>
          <span>L: {{ latestData.l }}</span>
          <span>C: {{ latestData.c }}</span>
          <span :class="latestData.up ? 'up' : 'down'">
            {{ latestData.up ? '+' : '' }}{{ latestData.changeAbs }} ({{ latestData.up ? '+' : '' }}{{ latestData.changePct }}%)
          </span>
        </div>
        <div :class="['signal', signalClass]">
          {{ signalMessage }}
        </div>
        <button @click="toggleIndicators" class="toggle-indicators__button">
          {{ indicatorsHidden ? 'Показать индикаторы' : 'Скрыть индикаторы' }}
        </button>
      </div>
    </div>

    <!-- График -->
    <div style="height:500px; position:relative;">
      <div style="height:100%; width:100%;" @mousemove="onMouseMove" @mouseleave="onMouseLeave">
        <canvas ref="canvas" style="width:100%; height:100%;" />
      </div>

      <!-- Вертикальная линия -->
      <div v-if="cross.visible" class="vertical-line" :style="{ left: cross.x + 'px' }"></div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { Chart, registerables } from 'chart.js'
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial'
import 'chartjs-adapter-date-fns'
import zoomPlugin from 'chartjs-plugin-zoom'

let lastSignalType = null

const indicatorsHidden = ref(false)

const toggleIndicators = () => {
  if (!chart) return

  chart.data.datasets.forEach((ds, index) => {
    const isMain = ds.label === 'Свечи' || ds.label === 'Объём'
    chart.getDatasetMeta(index).hidden = !isMain && !indicatorsHidden.value
  })

  indicatorsHidden.value = !indicatorsHidden.value
  chart.update()
  setTimeout(analyzeSignal, 0)
}


Chart.register(...registerables, CandlestickController, CandlestickElement, zoomPlugin)

const canvas = ref(null)
let chart = null
let candleData = []

const hoverActive = ref(false)

const hoverData = reactive({
  time: '', o: '', h: '', l: '', c: '',
  changeAbs: '', changePct: '', up: true, x: null
})

const latestData = reactive({
  time: '', o: '', h: '', l: '', c: '',
  changeAbs: '', changePct: '', up: true, x: null
})

const cross = reactive({
  x: 0,
  visible: false
})

const parseTime = t => {
  const d = new Date(t)
  return isNaN(d.getTime()) ? Date.now() : d.getTime()
}

function calculateRSI(data, period = 14) {
  let rsi = []
  let gains = 0, losses = 0

  for (let i = 1; i <= period; i++) {
    const diff = data[i].close - data[i - 1].close
    if (diff >= 0) gains += diff
    else losses -= diff
  }

  let avgGain = gains / period
  let avgLoss = losses / period

  for (let i = period + 1; i < data.length; i++) {
    const diff = data[i].close - data[i - 1].close
    const gain = diff > 0 ? diff : 0
    const loss = diff < 0 ? -diff : 0

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    const rsiVal = 100 - 100 / (1 + rs)
    rsi.push({ x: parseTime(data[i].time), y: rsiVal })
  }

  return rsi
}

function calculateMACD(data, shortPeriod = 12, longPeriod = 26, signalPeriod = 9) {
  const ema = (arr, period) => {
    const k = 2 / (period + 1)
    let emaArr = [arr[0]]
    for (let i = 1; i < arr.length; i++) {
      emaArr.push(arr[i] * k + emaArr[i - 1] * (1 - k))
    }
    return emaArr
  }

  const closes = data.map(p => p.close)
  const shortEma = ema(closes, shortPeriod)
  const longEma = ema(closes, longPeriod)

  const macdLine = shortEma.map((v, i) => v - longEma[i])
  const signalLine = ema(macdLine.slice(longPeriod - 1), signalPeriod)

  const result = []
  for (let i = longPeriod - 1 + signalPeriod - 1; i < closes.length; i++) {
    result.push({
      x: parseTime(data[i].time),
      macd: macdLine[i],
      signal: signalLine[i - (longPeriod - 1)]
    })
  }

  return result
}

function calculateBollingerBands(data, period = 20, stdDevMultiplier = 2) {
  const closes = data.map(p => p.close)
  const result = []

  for (let i = period - 1; i < closes.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const stdDev = Math.sqrt(slice.map(v => Math.pow(v - mean, 2)).reduce((a, b) => a + b, 0) / period)
    const upper = mean + stdDevMultiplier * stdDev
    const lower = mean - stdDevMultiplier * stdDev

    result.push({
      x: parseTime(data[i].time),
      upper,
      middle: mean,
      lower
    })
  }

  return result
}

function calculateStochastic(data, kPeriod = 14, dPeriod = 3) {
  const stochK = []
  const stochD = []

  for (let i = kPeriod - 1; i < data.length; i++) {
    const slice = data.slice(i - kPeriod + 1, i + 1)
    const high = Math.max(...slice.map(d => d.high))
    const low = Math.min(...slice.map(d => d.low))
    const close = data[i].close

    const k = ((close - low) / (high - low)) * 100
    stochK.push({ x: parseTime(data[i].time), y: k })
  }

  for (let i = dPeriod - 1; i < stochK.length; i++) {
    const slice = stochK.slice(i - dPeriod + 1, i + 1)
    const avg = slice.reduce((sum, d) => sum + d.y, 0) / dPeriod
    stochD.push({ x: stochK[i].x, y: avg })
  }

  return { kLine: stochK, dLine: stochD }
}

function calculateParabolicSAR(data, step = 0.02, maxStep = 0.2) {
  const sar = []
  let isUpTrend = true
  let af = step
  let ep = data[0].low
  let sarVal = data[0].low

  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1]
    const curr = data[i]

    sarVal = sarVal + af * (ep - sarVal)

    if (isUpTrend) {
      if (curr.low < sarVal) {
        isUpTrend = false
        sarVal = ep
        ep = curr.high
        af = step
      } else {
        if (curr.high > ep) {
          ep = curr.high
          af = Math.min(af + step, maxStep)
        }
      }
    } else {
      if (curr.high > sarVal) {
        isUpTrend = true
        sarVal = ep
        ep = curr.low
        af = step
      } else {
        if (curr.low < ep) {
          ep = curr.low
          af = Math.min(af + step, maxStep)
        }
      }
    }

    sar.push({
      x: parseTime(curr.time),
      y: sarVal
    })
  }

  return sar
}

function calculateATR(data, period = 14) {
  const atr = []

  for (let i = 1; i < data.length; i++) {
    const curr = data[i]
    const prev = data[i - 1]

    const highLow = curr.high - curr.low
    const highClose = Math.abs(curr.high - prev.close)
    const lowClose = Math.abs(curr.low - prev.close)

    const trueRange = Math.max(highLow, highClose, lowClose)

    if (i === period) {
      const firstATR = data.slice(1, period + 1).reduce((acc, d, j) => {
        const prevClose = data[j].close
        const tr = Math.max(
          d.high - d.low,
          Math.abs(d.high - prevClose),
          Math.abs(d.low - prevClose)
        )
        return acc + tr
      }, 0) / period
      atr.push({ x: parseTime(curr.time), y: firstATR })
    } else if (i > period) {
      const prevATR = atr[atr.length - 1].y
      const newATR = (prevATR * (period - 1) + trueRange) / period
      atr.push({ x: parseTime(curr.time), y: newATR })
    }
  }

  return atr
}

const updateHoverData = (candle) => {
  if (!candle) return
  const o = candle.o, c = candle.c
  hoverData.time = new Date(candle.x).toLocaleTimeString()
  hoverData.o = o
  hoverData.h = candle.h
  hoverData.l = candle.l
  hoverData.c = c
  hoverData.changeAbs = (c - o).toFixed(2)
  hoverData.changePct = ((c - o) / o * 100).toFixed(2)
  hoverData.up = c >= o
  hoverData.x = candle.x
}

const updateLatestData = (candle) => {
  if (!candle) return
  const o = candle.o, c = candle.c
  latestData.time = new Date(candle.x).toLocaleTimeString()
  latestData.o = o
  latestData.h = candle.h
  latestData.l = candle.l
  latestData.c = c
  latestData.changeAbs = (c - o).toFixed(2)
  latestData.changePct = ((c - o) / o * 100).toFixed(2)
  latestData.up = c >= o
}

const drawChart = async () => {
  const { fetchChartData } = await import('@/api/fetchData')
  const data = await fetchChartData()

  if (!canvas.value || !data.length) return

  candleData = data.slice(-300).map(p => ({
    x: parseTime(p.time),
    o: p.open,
    h: p.high,
    l: p.low,
    c: p.close,
    v: p.volume
  }))

  // === Локальный расчёт EMA ===
  function calcEMA(arr, period) {
    const k = 2 / (period + 1)
    const ema = [arr[0]]
    for (let i = 1; i < arr.length; i++) {
      ema.push(arr[i] * k + ema[i - 1] * (1 - k))
    }
    return ema
  }

  const closes = candleData.map(p => p.c)
  const ema20 = calcEMA(closes, 20)
  const ema50 = calcEMA(closes, 50)
  const ema100 = calcEMA(closes, 100)
  const ema200 = calcEMA(closes, 200)

  candleData.forEach((p, i) => {
    p.ema20 = i < 19 ? null : ema20[i]
    p.ema50 = i < 49 ? null : ema50[i]
    p.ema100 = i < 99 ? null : ema100[i]
    p.ema200 = i < 199 ? null : ema200[i]
  })

  updateLatestData(candleData[candleData.length - 1])

  const ema = (label, key, color) => ({
    label,
    data: data.filter(p => p[key] !== null).map(p => ({
      x: parseTime(p.time),
      y: p[key]
    })),
    type: 'line',
    borderColor: color,
    borderWidth: 1.4,
    pointRadius: 0,
    fill: false
  })

  const rsiData = calculateRSI(data)
  const macdData = calculateMACD(data)
  const stochastic = calculateStochastic(data)
  const sarData = calculateParabolicSAR(data)
  const atrData = calculateATR(data)

  let hiddenStates = []
  if (chart) {
    hiddenStates = chart.data.datasets.map((_, i) => chart.getDatasetMeta(i).hidden)
    chart.destroy()
  }


  if (chart) chart.destroy()

  const bollinger = calculateBollingerBands(data)

  chart = new Chart(canvas.value.getContext('2d'), {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: 'Объём',
          type: 'bar',
          data: candleData.map(p => ({
            x: p.x,
            y: p.v
          })),
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          borderRadius: 1,
          yAxisID: 'yVolume'
        },
        {
          label: 'Свечи',
          type: 'candlestick',
          data: candleData,
          borderColor: '#000',
          color: {
            up: '#00b300',
            down: '#ff3333',
            unchanged: '#999'
          }
        },
        ema('EMA 20', 'ema20', '#f39c12'),
        ema('EMA 50', 'ema50', '#e74c3c'),
        ema('EMA 100', 'ema100', '#1abc9c'),
        ema('EMA 200', 'ema200', '#8e44ad'),
        {
          label: 'RSI',
          data: rsiData.map(d => ({ x: d.x, y: d.y })),
          type: 'line',
          borderColor: '#3498db',
          borderWidth: 1.2,
          pointRadius: 0,
          yAxisID: 'y2'
        },
        {
          label: 'MACD',
          data: macdData.map(d => ({ x: d.x, y: d.macd })),
          type: 'line',
          borderColor: '#e67e22',
          borderWidth: 1.2,
          pointRadius: 0,
          yAxisID: 'y2'
        },
        {
          label: 'MACD Signal',
          data: macdData.map(d => ({ x: d.x, y: d.signal })),
          type: 'line',
          borderColor: '#e74c3c',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y2'
        },
        {
          label: 'BB Upper',
          data: bollinger.map(d => ({ x: d.x, y: d.upper })),
          type: 'line',
          borderColor: '#9b59b6',
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'BB Middle',
          data: bollinger.map(d => ({ x: d.x, y: d.middle })),
          type: 'line',
          borderColor: '#2980b9',
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'BB Lower',
          data: bollinger.map(d => ({ x: d.x, y: d.lower })),
          type: 'line',
          borderColor: '#9b59b6',
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        },
        {
          label: '%K (Stoch)',
          data: stochastic.kLine,
          type: 'line',
          borderColor: '#1abc9c',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y2'
        },
        {
          label: '%D (Stoch)',
          data: stochastic.dLine,
          type: 'line',
          borderColor: '#f1c40f',
          borderWidth: 1,
          pointRadius: 0,
          yAxisID: 'y2'
        },
        {
          label: 'Parabolic SAR',
          data: sarData,
          type: 'line',
          showLine: false,
          pointRadius: 3,
          pointStyle: 'circle',
          backgroundColor: '#ffffff',
          borderColor: '#ffffff',
          yAxisID: 'y'
        },
        {
          label: 'ATR',
          data: atrData.map(d => ({ x: d.x, y: d.y })),
          type: 'line',
          borderColor: '#00c3ff',
          borderWidth: 1.2,
          pointRadius: 0,
          yAxisID: 'y2'
        }
      ]
    },
    options: {
      animation: false,
      parsing: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'HH:mm',
            displayFormats: { minute: 'HH:mm' }
          },
          ticks: { color: '#ccc' },
          grid: { color: '#333' },
          offset: true
        },
        y: {
          ticks: { color: '#ccc' },
          grid: { color: '#333' }
        },
        y2: {
          position: 'right',
          ticks: { color: '#888' },
          grid: { display: false },
          display: true
        },
        yVolume: {
          position: 'left',
          ticks: { color: '#888' },
          grid: { display: false },
          display: true,
          beginAtZero: true,
          title: {
            display: true,
            text: 'Объём',
            color: '#888'
          }
        }

      },
      plugins: {
        legend: { labels: { color: '#ccc' } },
        tooltip: { enabled: false },
        zoom: {
          pan: { enabled: true, mode: 'xy', modifierKey: 'ctrl' },
          zoom: {
            wheel: { enabled: true },
            pinch: { enabled: true },
            mode: 'xy'
          }
        }
      },
      interaction: {
        mode: 'nearest',
        intersect: false
      }
    }
  })

  chart.data.datasets.forEach((_, i) => {
    chart.getDatasetMeta(i).hidden = hiddenStates[i] ?? false
  })
  chart.update()
}

// Распознавание паттернов
function aggregateTo15m(data) {
  const aggregated = []
  for (let i = 0; i < data.length; i += 3) {
    const chunk = data.slice(i, i + 3)
    if (chunk.length < 3) continue

    const time = chunk[0].time
    const open = chunk[0].open
    const close = chunk[2].close
    const high = Math.max(...chunk.map(c => c.high))
    const low = Math.min(...chunk.map(c => c.low))
    const volume = chunk.reduce((sum, c) => sum + c.volume, 0)

    aggregated.push({ time, open, high, low, close, volume })
  }
  return aggregated
}

const signalMessage = ref('Анализ...')
const signalClass = ref('neutral')

function detectCandlePattern(candle) {
  const body = Math.abs(candle.c - candle.o)
  const upperWick = candle.h - Math.max(candle.c, candle.o)
  const lowerWick = Math.min(candle.c, candle.o) - candle.l

  const totalRange = candle.h - candle.l
  if (totalRange === 0) return null

  const upperRatio = upperWick / totalRange
  const lowerRatio = lowerWick / totalRange
  const bodyRatio = body / totalRange

  // Молот
  if (lowerRatio > 0.5 && upperRatio < 0.1 && bodyRatio < 0.3 && candle.c > candle.o) {
    return 'hammer'
  }

  // Повешенный
  if (lowerRatio > 0.5 && upperRatio < 0.1 && bodyRatio < 0.3 && candle.c < candle.o) {
    return 'hanging'
  }

  // Доджи
  if (bodyRatio < 0.05) {
    return 'doji'
  }

  return null
}


function analyzeSignal() {
  if (candleData.length < 30) {
    signalMessage.value = 'Недостаточно данных'
    signalClass.value = 'neutral'
    return
  }

  // === Тренд старшего таймфрейма ===
  const data15m = aggregateTo15m(candleData)
  const macd15m = calculateMACD(data15m)
  const sar15m = calculateParabolicSAR(data15m)

  const macdTrend = macd15m.at(-1)?.macd - macd15m.at(-1)?.signal
  const sarTrend = data15m.at(-1)?.close - sar15m.at(-1)?.y

  const trendUp = macdTrend > 0 && sarTrend > 0
  const trendDown = macdTrend < 0 && sarTrend < 0

  // === Индикаторы текущего таймфрейма ===
  const rsi = calculateRSI(candleData, 7)
  const macd = calculateMACD(candleData, 5, 13, 4)
  const stoch = calculateStochastic(candleData, 9, 3)
  const sar = calculateParabolicSAR(candleData, 0.03, 0.25)
  const boll = calculateBollingerBands(candleData, 14)
  const atr = calculateATR(candleData, 14)

  const latest = candleData.at(-1)
  const prev = candleData.at(-2)

  const rsiVal = rsi.at(-1)?.y || 50
  const macdLine = macd.at(-1)?.macd || 0
  const macdSignal = macd.at(-1)?.signal || 0
  const k = stoch.kLine.at(-1)?.y || 50
  const d = stoch.dLine.at(-1)?.y || 50
  const lastSar = sar.at(-1)?.y || latest.c
  const bollLower = boll.at(-1)?.lower || latest.c
  const bollUpper = boll.at(-1)?.upper || latest.c
  const atrVal = atr.at(-1)?.y || 0
  const volume = latest.v || 0

  const adaptiveRSI = Math.max(5, Math.min(20, atrVal))
  const rsiBuyThreshold = 30 - adaptiveRSI
  const rsiSellThreshold = 70 + adaptiveRSI

  const ema20 = latest.ema20 ?? 0
  const ema50 = latest.ema50 ?? 0
  const emaDiff = Math.abs(ema20 - ema50)
  const macdThreshold = Math.max(0.05, emaDiff * 0.25)

  const body = Math.abs(latest.c - latest.o)
  const range = latest.h - latest.l
  const bodyRatio = range > 0 ? body / range : 0
  const isImpulse = body > atrVal

  const avgVolume = candleData.slice(-20).reduce((sum, d) => sum + d.v, 0) / 20
  const isLowVolume = volume < avgVolume * 0.8

  let score = 0

  // === Анализ по индикаторам ===
  if (rsiVal < rsiBuyThreshold) score += 1
  else if (rsiVal > rsiSellThreshold) score -= 1

  if (macdLine - macdSignal > macdThreshold) score += 1
  else if (macdSignal - macdLine > macdThreshold) score -= 1

  if (k > d && k < 20) score += 1
  else if (k < d && k > 80) score -= 1

  if (latest.c > lastSar) score += 1
  else score -= 1

  if (latest.c <= bollLower) score += 1
  else if (latest.c >= bollUpper) score -= 1

  if (isImpulse) score += 2

  // === Фильтрация сигналов по тренду 15m ===
  if (isLowVolume) score -= 0.5
  if (bodyRatio < 0.5) score -= 0.5

  // === Свечной паттерн (Price Action) ===
  const pattern = detectCandlePattern(latest)
  if (pattern === 'hammer') score += 1
  else if (pattern === 'hanging') score -= 1
  else if (pattern === 'doji') score -= 0.5



  if (trendUp && score < 0) score = 0
  if (trendDown && score > 0) score = 0

  // === Проверка на флет ===
  const isSideways =
    Math.abs(latest.c - lastSar) < atrVal * 0.2 &&
    Math.abs(macdLine - macdSignal) < macdThreshold

  let currentSignal = 'wait'

  if (isSideways) {
    signalMessage.value = '⏸ Ожидание / Флет'
    signalClass.value = 'neutral'
    lastSignalType = 'wait'
    return
  }

  if (score >= 4) currentSignal = 'strongBuy'
  else if (score === 3) currentSignal = 'weakBuy'
  else if (score <= -4) currentSignal = 'strongSell'
  else if (score === -3) currentSignal = 'weakSell'
  else currentSignal = 'wait'

  if (currentSignal === lastSignalType && currentSignal !== 'wait') {
    signalMessage.value = '⚠ Повтор сигнала. Ожидание.'
    signalClass.value = 'neutral'
    return
  }

  lastSignalType = currentSignal

  if (currentSignal === 'strongBuy') {
    signalMessage.value = '📈 Сильный сигнал на покупку'
    signalClass.value = 'buy'
  } else if (currentSignal === 'weakBuy') {
    signalMessage.value = '📥 Слабый сигнал на покупку'
    signalClass.value = 'buy'
  } else if (currentSignal === 'strongSell') {
    signalMessage.value = '📉 Сильный сигнал на продажу'
    signalClass.value = 'sell'
  } else if (currentSignal === 'weakSell') {
    signalMessage.value = '📤 Слабый сигнал на продажу'
    signalClass.value = 'sell'
  } else {
    signalMessage.value = '⏳ Ожидание'
    signalClass.value = 'neutral'
  }
}

const onMouseMove = (e) => {
  if (!chart || !candleData.length) return
  const rect = canvas.value.getBoundingClientRect()
  const x = e.clientX - rect.left
  cross.x = x
  cross.visible = true
  hoverActive.value = true

  const points = chart.getElementsAtEventForMode(e, 'nearest', { intersect: false }, false)
  if (points.length > 0) {
    const index = points[0].index
    const candleDataset = chart.data.datasets.find(ds => ds.type === 'candlestick')
    if (candleDataset) {
      const candle = candleDataset.data[index]
      updateHoverData(candle)
    }
  }
}

const onMouseLeave = () => {
  hoverActive.value = false
  cross.visible = false
}
onMounted(() => {
  drawChart().then(analyzeSignal)
  setInterval(() => {
    drawChart().then(analyzeSignal)
  }, 1000)
})
</script>

<style scoped>
canvas {
  background: #121212;
}

.top-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #ccc;
  font-size: 14px;
  padding: 6px 0;
}

.hover-panel-left,
.latest-panel-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.vertical-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(255, 255, 255, 0.3);
  pointer-events: none;
}

.up {
  color: #00b300;
}

.down {
  color: #ff3333;
}

.toggle-indicators__wrap {
  display: flex;
  justify-content: center;
  min-width: 100%;
}

.toggle-indicators__button {
  background: none;
  outline: none;
  padding: 4px 6px;
  border-radius: 5px;
  border: solid 1px rgba(255, 255, 255, 0.3);
  color: rgba(255, 255, 255, 0.3);
  font-size: 16px;
  transition: border-color 400ms, color 400ms;
}

.toggle-indicators__button:hover {
  border-color: #00afdb;
  color: #00afdb;
  cursor: pointer;
}

.signal {
  padding: 4px 10px;
  border-radius: 5px;
  font-weight: bold;
  font-size: 14px;
}

.signal.buy {
  color: #00e676;
}

.signal.sell {
  color: #ff5252;
}

.signal.neutral {
  color: #ffa726;
}
</style>
