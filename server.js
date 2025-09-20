// server.js
// Simple Express keep-alive server

const express = require('express');
const app = express();

// Health check route
app.get('/', (req, res) => {
  res.send('✅ Bot is alive and running!');
});

// Optional: an uptime route
app.get('/uptime', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Keep-alive server running on http://localhost:${PORT}`);
});
