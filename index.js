const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();
require('./server'); // keep-alive express server

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const coins = [
  'bitcoin', 'ethereum', 'tether', 'binancecoin',
  'solana', 'ripple', 'dogecoin', 'toncoin',
  'cardano', 'avalanche-2'
];

const channelIds = process.env.CHANNEL_IDS.split(',').map(id => id.trim());

async function fetchAndSendPrices() {
  try {
    const res = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: coins.join(','),
        vs_currencies: 'usd'
      }
    });

    let message = `📊 **Top 10 Crypto Prices (USD)**\n`;
    for (const coin of coins) {
      const price = res.data[coin]?.usd;
      if (price !== undefined) {
        const name = coin.charAt(0).toUpperCase() + coin.slice(1).replace(/-/g, ' ');
        message += `• **${name}**: $${price.toLocaleString()}\n`;
      }
    }

    for (const id of channelIds) {
      const channel = await client.channels.fetch(id);
      await channel.send(message);
    }

    console.log('✅ Prices sent');
  } catch (err) {
    console.error('❌ Error fetching/sending prices:', err.message);
  }
}

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  fetchAndSendPrices(); // send on startup

  // hourly updates
  cron.schedule('0 * * * *', fetchAndSendPrices);
});

client.login(process.env.DISCORD_TOKEN);