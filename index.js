const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();
require('./server'); // Keep-alive ping server

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const coins = [
  'bitcoin', 'ethereum', 'tether', 'binancecoin',
  'solana', 'ripple', 'dogecoin', 'toncoin',
  'cardano', 'avalanche-2'
];

const channelIds = process.env.CHANNEL_IDS?.split(',').map(id => id.trim());

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  await sendCryptoUpdate('📊 **Initial Crypto Market Pulse (USD)**');

  // ⏰ Every 6 hours
  cron.schedule('0 */6 * * *', () => {
    sendCryptoUpdate('⏰ **6-Hourly Crypto Market Pulse (USD)**');
  });
});

async function get24hrPriceData(coin) {
  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart`, {
      params: { vs_currency: 'usd', days: '1' }
    });
    return res.data.prices;
  } catch (err) {
    console.error(`❌ 24hr data for ${coin} failed:`, err.message);
    return [];
  }
}

async function getMarketTrendAndSuggestion(coin) {
  const data = await get24hrPriceData(coin);
  if (!data.length) return { trend: 'Unknown', suggestion: 'No data available', change: 0 };

  const first = data[0][1];
  const last = data[data.length - 1][1];
  const change = ((last - first) / first) * 100;

  let trend = change > 0 ? '📈 Upward Trend' : '📉 Downward Trend';
  let suggestion = '🔎 No strong signal';

  if (change <= -5) {
    suggestion = `💸 Dropped ${Math.abs(change).toFixed(2)}% — Possible buy opportunity.`;
  } else if (change >= 5) {
    suggestion = `🚀 Rose ${change.toFixed(2)}% — Wait for pullback?`;

  }
  return { trend, suggestion, change };
}

async function sendCryptoUpdate(header) {
  try {
    const priceRes = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: coins.join(','),
        vs_currencies: 'usd'
      }
    });

    let message = `${header}\n\n`;
    let hottest = { coin: '', change: -Infinity };

    for (const coin of coins) {
      const price = priceRes.data[coin]?.usd;
      if (price === undefined) continue;

      const displayName = coin.charAt(0).toUpperCase() + coin.slice(1).replace(/-/g, ' ');
      const { trend, suggestion, change } = await getMarketTrendAndSuggestion(coin);

      if (change > hottest.change) {
        hottest = { coin: displayName, change: change.toFixed(2), suggestion };
      }

      message += `🪙 **${displayName}**\n`;
      message += `• Price: $${price.toLocaleString()}\n`;
      message += `• ${trend}\n`;
      message += `• ${suggestion}\n\n`;
    }

    // Add prediction section for the hottest coin
    if (hottest.coin) {
      message += `🔥 **Buzz & Prediction**\n`;
      message += `The hottest mover is **${hottest.coin}**, surging by **${hottest.change}%** in the last 24h.\n`;
      message += `📢 Buzz: "Momentum looks strong — Keep your eyes on ${hottest.coin}!"\n`;
      message += `📊 Forecast: If momentum continues, expect more volatility ahead!\n`;
    }

    await sendToChannels(message);
  } catch (err) {
    console.error('❌ Price fetch failed:', err.message);
  }
}

async function sendToChannels(content) {
  for (const id of channelIds) {
    try {
      const channel = await client.channels.fetch(id);
      await channel.send({ content });
    } catch (err) {
      console.error(`❌ Couldn't send to ${id}:`, err.message);
    }
  }
}

client.login(process.env.DISCORD_TOKEN);
