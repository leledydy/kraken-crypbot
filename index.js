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

  await sendCryptoUpdate('📊 **Initial Crypto Prices (USD)**');

  // ⏰ Schedule hourly updates
  cron.schedule('0 * * * *', () => {
    sendCryptoUpdate('⏰ **Hourly Crypto Update (USD)**');
  });
});

// Reusable message sender
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
      }
    }

    for (const id of channelIds) {
      try {
        const channel = await client.channels.fetch(id);
        await channel.send(message);
      } catch (err) {
        console.error(`❌ Failed to send to channel ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch prices:', err.message);
  }
}

client.login(process.env.DISCORD_TOKEN);
