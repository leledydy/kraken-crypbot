// market-bot.js
// Business-look crypto pulse for Discord with Kripto11-branded banner
// Deps: discord.js ^14, axios ^1, cron ^3, dotenv ^16, @resvg/resvg-js ^2

const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const axios = require('axios');
const cron = require('node-cron');
const { Resvg } = require('@resvg/resvg-js');
require('dotenv').config();
try { require('./server'); } catch (_) { /* optional keep-alive */ }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// =======================
// CONFIG
// =======================
const SYMBOLS = [
  { symbol: 'BTC',  name: 'Bitcoin',  candidates: ['bitcoin'] },
  { symbol: 'USDT', name: 'Tether',   candidates: ['tether'] },
  { symbol: 'ETH',  name: 'Ethereum', candidates: ['ethereum'] },
  { symbol: 'TON',  name: 'Toncoin',  candidates: ['toncoin'] },
  { symbol: 'NOT',  name: 'Notcoin',  candidates: ['notcoin'] },
  // DOGS can be `dogs` or `dogs-2` on CoinGecko, resolve dynamically:
  { symbol: 'DOGS', name: 'Dogs',     candidates: ['dogs', 'dogs-2'] },
  { symbol: 'SOL',  name: 'Solana',   candidates: ['solana'] },
];

const channelIds =
  process.env.CHANNEL_IDS?.split(',').map(s => s.trim()).filter(Boolean) || [];

// =======================
// FORMATTING HELPERS
// =======================
const fmtUSD = (n) => {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(4)}`.replace(/(\.\d*[1-9])0+$/,'$1').replace(/\.0+$/,'');
};
const fmtPctArrow = (p) => `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(2)}%`;
const trendWord = (p) => p > 2 ? 'Uptrend' : p < -2 ? 'Downtrend' : 'Sideways';
const colorByChange = (p) => p > 0 ? 0x1F9D55 : p < 0 ? 0xD83C3C : 0x2B2D31;
const suggestionFromChange = (c) => {
  if (c >= 7)  return `Strong move — consider waiting for a pullback.`;
  if (c >= 3)  return `Momentum positive — watch key supports.`;
  if (c <= -7) return `Sharp drawdown — potential value zone (DYOR).`;
  if (c <= -3) return `Under pressure — size risk carefully.`;
  return `No strong signal — monitor price action.`;
};

// =======================
// COINGECKO: ID RESOLVE + QUOTES
// =======================
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

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data } = await axios.get(`https://api.coingecko.com/api/v3/simple/price?${params.toString()}`);
      return data;
    } catch (e) {
      if (attempt === 1) throw e;
      await new Promise(r => setTimeout(r, 800));
    }
  }
}

// =======================
// LOGO: fetch once → base64 embed
// =======================
let logoBase64 = null;
async function loadLogo() {
  try {
    // Use RAW GitHub file URL so we get just the bytes
    const url = 'https://raw.githubusercontent.com/leledydy/kraken-crypbot/main/kripto-gold.png';
    const resp = await axios.get(url, { responseType: 'arraybuffer' });
    logoBase64 = Buffer.from(resp.data).toString('base64');
  } catch (err) {
    console.error('❌ Failed to load logo:', err.message);
    logoBase64 = null; // render without logo if fetch failed
  }
}

// =======================
// SVG → PNG banner (via @resvg/resvg-js)
// =======================
function buildHeaderSvg({ title, subtitle, rows }) {
  const W = 1200, H = 280;
  const now = new Date();
  const ts = now.toLocaleString('en-US', { hour12: false });

  // ticker chips (compact, readable)
  const chipsRow = rows.map((r, i) => {
    const green = r.change >= 0;
    const bg = green ? '#123e2b' : '#3e1b1b';
    const fg = green ? '#32d296' : '#ff6b6b';
    const x = 20 + i * 190;
    return `
      <g transform="translate(${x},200)">
        <rect rx="10" ry="10" width="180" height="52" fill="${bg}" />
        <text x="14" y="34" font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial" font-size="20" fill="#E7E9EC" font-weight="700">${r.symbol}</text>
        <text x="84" y="22" font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial" font-size="16" fill="#B9C1CB">${r.price}</text>
        <text x="84" y="40" font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial" font-size="14" fill="${fg}">${fmtPctArrow(r.change)}</text>
      </g>
    `;
  }).join('');

  const logoTag = logoBase64
    ? `<image href="data:image/png;base64,${logoBase64}" x="40" y="40" width="80" height="80" />`
    : '';

  return `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f1216"/>
          <stop offset="100%" stop-color="#1a2028"/>
        </linearGradient>
        <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#4f46e5"/>
          <stop offset="100%" stop-color="#22d3ee"/>
        </linearGradient>
      </defs>

      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <rect x="20" y="20" width="${W-40}" height="${H-40}" rx="18"
            fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.06)"/>

      ${logoTag}

      <text x="${logoBase64 ? 140 : 48}" y="90"
            font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial"
            font-size="42" fill="#E7E9EC" font-weight="800">${title}</text>

      <rect x="${logoBase64 ? 140 : 48}" y="106" width="360" height="4" rx="2" fill="url(#accent)"/>

      <text x="${logoBase64 ? 140 : 48}" y="148"
            font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial"
            font-size="20" fill="#9AA4AF">${subtitle}</text>

      <text x="${W-48}" y="148" text-anchor="end"
            font-family="Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial"
            font-size="18" fill="#6B7280">${ts}</text>

      ${chipsRow}
    </svg>
  `;
}

function svgToPngBuffer(svg) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, background: 'transparent' });
  return r.render().asPng();
}

// =======================
// Embed builders
// =======================
function buildEmbedsAndBanner(prices) {
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

  // select standout mover by absolute % change
  let hottest = null;
  for (const r of rows) {
    if (!hottest || Math.abs(r.change) > Math.abs(hottest.change)) hottest = r;
  }

  // Build header image
  const bannerSvg = buildHeaderSvg({
    title: 'Market Pulse — USD',
    subtitle: 'Kripto11 • BTC • USDT • ETH • TON • NOT • DOGS • SOL',
    rows: rows.map(r => ({ symbol: r.symbol, price: fmtUSD(r.price), change: r.change }))
  });
  const pngBuffer = svgToPngBuffer(bannerSvg);
  const headerAttachment = new AttachmentBuilder(pngBuffer, { name: 'header.png' });

  // Main embed
  const main = new EmbedBuilder()
    .setColor(hottest ? colorByChange(hottest.change) : 0x2B2D31)
    .setImage('attachment://header.png')
    .setTitle('📊 Market Pulse — USD')
    .setDescription('Boardroom view of key coins. Prices and 24h performance at a glance.')
    .setFooter({ text: 'Source: CoinGecko • Not financial advice' })
    .setTimestamp(new Date());

  rows.forEach(r => {
    main.addFields({
      name: `**${r.symbol} • ${r.name}**`,
      value: `${fmtUSD(r.price)}  |  ${fmtPctArrow(r.change)}  |  ${r.trend}\n*${r.suggestion}*`,
      inline: true
    });
  });

  // Buzz / Forecast embed
  const buzz = new EmbedBuilder()
    .setTitle('🔥 Buzz & Forecast')
    .setColor(hottest ? colorByChange(hottest.change) : 0x2B2D31)
    .setDescription(
      hottest
        ? `**${hottest.symbol} • ${hottest.name}** is the standout mover at **${fmtPctArrow(hottest.change)}**.\n` +
          `**Buzz:** Momentum notable; liquidity clustering near intraday pivots.\n` +
          `**Forecast:** Elevated volatility if momentum persists; manage entries around supports/resistances.`
        : 'No standout mover detected in this snapshot.'
    )
    .setTimestamp(new Date());

  return { embeds: [main, buzz], files: [headerAttachment] };
}

// =======================
// Posting
// =======================
async function postPulse(preamble) {
  try {
    const data = await fetchQuotes();
    const { embeds, files } = buildEmbedsAndBanner(data);

    for (const id of channelIds) {
      try {
        const channel = await client.channels.fetch(id);
        if (preamble) await channel.send({ content: preamble });
        await channel.send({ embeds, files });
      } catch (err) {
        console.error(`❌ Couldn't send to channel ${id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('❌ Price fetch failed:', err.message);
  }
}

// =======================
// Lifecycle
// =======================
client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  await loadLogo();      // fetch + inline the Kripto11 logo
  await fetchQuotes();   // warm up ID resolution

  await postPulse('📌 **Initial Crypto Market Pulse (USD)**');

  // Every 6 hours on the hour
  cron.schedule('0 */6 * * *', () => {
    postPulse('⏰ **6-Hourly Crypto Market Pulse (USD)**');
  });
});

client.login(process.env.DISCORD_TOKEN);
