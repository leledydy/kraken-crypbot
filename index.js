const { Client, GatewayIntentBits, AttachmentBuilder } = require('discord.js'); // Use AttachmentBuilder instead of MessageAttachment
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

  await sendCryptoUpdate('📊 **Initial Crypto Prices (USD)**');

  // ⏰ Schedule hourly updates
  cron.schedule('0 * * * *', () => {
    sendCryptoUpdate('⏰ **Hourly Crypto Update (USD)**');
  });
});

// Fetch historical prices for trend analysis
async function get24hrPriceData(coin) {
  try {
    const res = await axios.get(`https://api.coingecko.com/api/v3/coins/${coin}/market_chart`, {
      params: {
        vs_currency: 'usd',
        days: '1' // Last 24 hours
      }
    });
    return res.data.prices; // returns array of [timestamp, price]
  } catch (err) {
    console.error(`❌ Failed to fetch 24hr data for ${coin}:`, err.message);
    return [];
  }
}

// Determine market trend and buying suggestion
async function getMarketTrendAndSuggestion(coin) {
  const priceData = await get24hrPriceData(coin);
  if (priceData.length === 0) return { trend: 'Unknown', suggestion: 'No data available' };

  const price24hrAgo = priceData[0][1];
  const priceNow = priceData[priceData.length - 1][1];

  // Market Trend: Compare prices
  const trend = priceNow > price24hrAgo ? 'Upward Trend' : 'Downward Trend';

  // Buying suggestion: Simple rule for significant drop (e.g., 5% drop)
  const priceChange = ((priceNow - price24hrAgo) / price24hrAgo) * 100;
  let suggestion = 'No suggestion';

  if (priceChange < -5) {
    suggestion = `📉 Significant drop detected! Consider buying now as it dropped by ${Math.abs(priceChange).toFixed(2)}%.`;
  } else if (priceChange > 5) {
    suggestion = `📈 The price has increased by ${priceChange.toFixed(2)}%. Consider waiting for a potential dip.`;
  }

  return { trend, suggestion };
}

// Reusable message sender with images
async function sendCryptoUpdate(header) {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: coins.join(','),
        vs_currencies: 'usd'
      }
    });

    let message = `${header}\n`;
    for (const coin of coins) {
      const price = res.data[coin]?.usd;
      if (price !== undefined) {
        const name = coin.charAt(0).toUpperCase() + coin.slice(1).replace(/-/g, ' ');
        message += `• **${name}**: $${price.toLocaleString()}\n`;

        // Add market trend and buying suggestion
        const { trend, suggestion } = await getMarketTrendAndSuggestion(coin);
        message += `  → **Market Trend**: ${trend}\n`;
        message += `  → **Suggestion**: ${suggestion}\n`;

        // Add a link to a price chart image or generate one dynamically
        const chartUrl = `https://www.tradingview.com/chart/?symbol=BINANCE%3A${coin.toUpperCase()}USDT`; // Example link
        message += `📊 [Price Chart for ${name}](${chartUrl})\n`;

        // If you have custom images, you can generate or provide them here
        const attachment = new AttachmentBuilder('path_to_image_or_chart.png'); // Use AttachmentBuilder here
        await sendWithImage(message, attachment);
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch prices:', err.message);
  }
}

// Send message with image
async function sendWithImage(message, attachment) {
  for (const id of channelIds) {
    try {
      const channel = await client.channels.fetch(id);
      await channel.send({ content: message, files: [attachment] });
    } catch (err) {
      console.error(`❌ Failed to send to channel ${id}:`, err.message);
    }
  }
}

client.login(process.env.DISCORD_TOKEN);
