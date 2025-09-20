// index.js
// Crypto Market Pulse bot (with Kripto11 logo at bottom + "Let's Play")

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();
require('./server'); // Express keep-alive

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// === CONFIG ===
const SYMBOLS = [
  { symbol: 'BTC',  name: 'Bitcoin',  candidates: ['bitcoin'] },
  { symbol: 'USDT', name: 'Tether',   candidates: ['tether'] },
  { symbol: 'ETH',  name: 'Ethereum', candidates: ['ethereum'] },
  { symbol: 'TON',  name: 'Toncoin',  candidates: ['toncoin'] },
  { symbol: 'NOT',  name: 'Notcoin',  candidates: ['notcoin'] },
  { symbol: 'DOGS', name: 'Dogs',     candidates: ['dogs', 'dogs-2'] },
  { symbol: 'SOL',  name: 'Solana',   candidates: ['solana'] },
];

const channelIds = process.env.CHANNEL_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [];

// === HELPERS ===
const fmtUSD = (n) => n >= 1000
  ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
  : `$${n.toFixed(4)}`;
const fmtPctArrow = (p) => `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(2)}%`;
const trendWord = (p) => p > 2 ? 'Uptrend' : p < -2 ? 'Downtrend' : 'Sideways';
const colorByChange = (p) => p > 0 ? 0x1F9D55 : p < 0 ? 0xD83C3C : 0x2B2D31;
const suggestionFromChange = (c) => {
  if (c >= 7)  return `Strong move — wait for a pullback?`;
  if (c >= 3)  return `Momentum positive — watch support.`;
  if (c <= -7) return `Sharp drawdown — possible value zone (DYOR).`;
  if (c <= -3) return `Under pressure — size risk carefully.`;
  return `No strong signal — monitor price action.`;
};

// === COINGECKO ===
let resolvedIdCache = {};
async function resolveIds() {
  const allCandidates = [...new Set(SYMBOLS.flatMap(c => c.candidates))];
  const params = new URLSearchParams({
    ids: allCandidates.join(','),
    vs_currencies: 'usd',
    include_24hr_change: 'true'
  });
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`);
  SYMBOLS.forEach(entry => {
    const found = entry.candidates.find(id => data[id]?.usd !== undefined);
    resolvedIdCache[entry.symbol] = found || entry.candidates[0];
  });
}

async function fetchQuotes() {
  if (!Object.keys(resolvedIdCache).length) {
    try { await resolveIds(); } catch { SYMBOLS.forEach(e => (resolvedIdCache[e.symbol] = e.candidates[0])); }
  }
  const ids = SYMBOLS.map(s => resolvedIdCache[s.symbol]);
  const params = new URLSearchParams({
    ids: ids.join(','),
    vs_currencies: 'usd',
    include_24hr_change: 'true'
  });
  const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`);
  return data;
}

// === EMBEDS ===
function buildEmbeds(prices) {
  const rows = SYMBOLS.map(s => {
    const id = resolvedIdCache[s.symbol];
    const info = prices?.[id];
    if (!info) return null;
    const price = info.usd;
    const change = info.usd_24h_change ?? 0;
    return {
      symbol: s.symbol,
      name: s.name,
      price,
      change,
      trend: trendWord(change),
      suggestion: suggestionFromChange(change),
    };
  }).filter(Boolean);

  let hottest = null;
  for (const r of rows) {
    if (!hottest || Math.abs(r.change) > Math.abs(hottest.change)) hottest = r;
  }

  const main = new EmbedBuilder()
    .setColor(hottest ? colorByChange(hottest.change) : 0x2B2D31)
    .setTitle('📊 Market Pulse — USD')
    .setDescription('Key coins performance (24h).')
    .setFooter({ text: 'Source: CoinGecko • Not financial advice' })
    .setTimestamp(new Date());

  rows.forEach(r => {
    main.addFields({
      name: `**${r.symbol} • ${r.name}**`,
      value: `${fmtUSD(r.price)}  |  ${fmtPctArrow(r.change)}  |  ${r.trend}\n*${r.suggestion}*`,
      inline: true
    });
  });

  const buzz = new EmbedBuilder()
    .setTitle('🔥 Buzz & Forecast')
    .setColor(hottest ? colorByChange(hottest.change) : 0x2B2D31)
    .setDescription(
      hottest
        ? `**${hottest.symbol} • ${hottest.name}** moved **${fmtPctArrow(hottest.change)}**.\n` +
          `**Buzz:** Momentum notable.\n` +
          `**Forecast:** Watch volatility ahead.`
        : 'No standout mover detected in this snapshot.'
    )
    // ✅ Logo at the bottom
    .setImage('https://raw.githubusercontent.com/leledydy/kraken-crypbot/main/kripto-gold.png')
    .setFooter({ text: "Let's Play 🎮" })
    .setTimestamp(new Date());

  return [main, buzz];
}

// === POSTING ===
async function postPulse() {
  try {
    const data = await fetchQuotes();
    const embeds = buildEmbeds(data);

    for (const id of channelIds) {
      try {
        const channel = await client.channels.fetch(id);
        await channel.send({ embeds });
      } catch (err) {
        console.error(`❌ Couldn't send to channel ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Price fetch failed:', err.message);
  }
}

// === LIFECYCLE ===
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await fetchQuotes(); // resolve ids

  await postPulse();
  cron.schedule('0 */6 * * *', () => {
    postPulse();
  });
});

client.login(process.env.DISCORD_TOKEN);
