<template>
  <div style="background:#121212; padding:16px; height:500px;">
    <canvas ref="canvas" style="width:100%; height:100%;" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { Chart, registerables } from 'chart.js'
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial'
import 'chartjs-adapter-date-fns'
import { fetchChartData } from '@/api/fetchData'

Chart.register(...registerables, CandlestickController, CandlestickElement)

const canvas = ref(null)
let chart = null

// Безопасный парсинг времени
const parseTime = t => {
  const date = new Date(t)
  return isNaN(date.getTime()) ? Date.now() : date.getTime() // Chart.js ожидает timestamp
}

const drawChart = async () => {
  const data = await fetchChartData()
  if (!canvas.value || !data.length) return

  const candles = data.slice(-100).map(p => ({
    x: parseTime(p.time),
    o: p.open,
    h: p.high,
    l: p.low,
    c: p.close
  }))

  const ema = (label, key, color) => ({
    label,
    data: data
      .filter(p => p[key] !== null)
      .map(p => ({ x: parseTime(p.time), y: p[key] })),
    type: 'line',
    borderColor: color,
    borderWidth: 1.4,
    pointRadius: 0,
    fill: false
  })

  // Уничтожаем старый график
  if (chart) {
    chart.destroy()
    chart = null
  }

  chart = new Chart(canvas.value.getContext('2d'), {
    type: 'candlestick',
    data: {
      datasets: [
        {
          label: 'Свечи',
          type: 'candlestick',
          data: candles,
          color: {
            up: '#00b300',
            down: '#ff3333',
            unchanged: '#999'
          },
          borderColor: '#000'
        },
        ema('EMA 20', 'ema20', '#f39c12'),
        ema('EMA 50', 'ema50', '#e74c3c'),
        ema('EMA 100', 'ema100', '#1abc9c'),
        ema('EMA 200', 'ema200', '#8e44ad')
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
            displayFormats: {
              hour: 'HH:mm',
              minute: 'HH:mm'
            }
          },
          ticks: {
            color: '#ccc',
            autoSkip: true,
            maxTicksLimit: 10
          },
          grid: { color: '#333' }
        },
        y: {
          title: {
            display: true,
            text: 'Цена (USDT)',
            color: '#ccc'
          },
          ticks: { color: '#ccc' },
          grid: { color: '#333' }
        }
      },
      plugins: {
        legend: {
          labels: {
            color: '#ccc',
            boxWidth: 12
          }
        }
      }
    }
  })
}

onMounted(() => {
  drawChart()
  setInterval(drawChart, 10000) // обновлять раз в 10 секунд
})
</script>

<style scoped>
canvas {
  background: #121212;
}
</style>
