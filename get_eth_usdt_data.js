import axios from 'axios';
import { writeFile } from 'fs/promises';

// Настройки
const symbol = 'ETHUSDT';
const interval = '5m';
const limit = 288; // 24 часа * 60 / 5 = 288 свечей
const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;

try {
  const response = await axios.get(url);
  const candles = response.data.map(c => ({
    openTime: c[0],
    open: parseFloat(c[1]),
    high: parseFloat(c[2]),
    low: parseFloat(c[3]),
    close: parseFloat(c[4]),
    volume: parseFloat(c[5]),
    closeTime: c[6],
  }));

  await writeFile('eth_usdt_5m.json', JSON.stringify(candles, null, 2));
  console.log('✅ Файл сохранён: eth_usdt_5m.json');
} catch (error) {
  console.error('❌ Ошибка загрузки данных:', error.message);
}
