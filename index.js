require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const axios = require('axios');

const app = express();

const PORT = process.env.PORT || 10000;
const HF_BACKEND_URL = process.env.HF_BACKEND_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';

if (!HF_BACKEND_URL) {
    console.warn("⚠️ HF_BACKEND_URL is not set.");
}

// ─── Outbound Telegram API Proxy ──────────────────────────────────────────────
// IMPORTANT: This MUST come BEFORE express.json() so req is still a raw stream
// HF cannot reach api.telegram.org, so the backend sends outbound calls here
app.all(/^\/bot([^/]+)\/(.+)$/, (req, res) => {
    const token  = req.params[0];
    const method = req.params[1];

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: req.method,
        headers: {}
    };

    // Copy safe headers, skip hop-by-hop headers
    const skipHeaders = ['host', 'connection', 'transfer-encoding', 'upgrade', 'keep-alive'];
    for (const [key, val] of Object.entries(req.headers)) {
        if (!skipHeaders.includes(key.toLowerCase())) {
            options.headers[key] = val;
        }
    }

    const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (err) => {
        console.error(`[Outbound Proxy] Error on /bot.../  ${method}:`, err.message);
        if (!res.headersSent) res.status(502).json({ ok: false, description: err.message });
    });

    // Pipe raw request body directly — do NOT use express.json() above this
    req.pipe(proxyReq, { end: true });
});

// ─── JSON body parser (only for routes below this line) ──────────────────────
app.use(express.json());

// ─── Inbound Webhook Forwarding (Telegram → Render → HF) ─────────────────────
app.post('/webhook/main', async (req, res) => {
    res.sendStatus(200);
    if (!HF_BACKEND_URL) return;
    try {
        await axios.post(`${HF_BACKEND_URL}/webhook/main`, req.body, {
            headers: { 'x-webhook-secret': WEBHOOK_SECRET, 'content-type': 'application/json' },
            timeout: 10000
        });
    } catch (err) {
        console.error('[Inbound] Error forwarding main webhook:', err.message);
    }
});

app.post('/webhook/admin', async (req, res) => {
    res.sendStatus(200);
    if (!HF_BACKEND_URL) return;
    try {
        await axios.post(`${HF_BACKEND_URL}/webhook/admin`, req.body, {
            headers: { 'x-webhook-secret': WEBHOOK_SECRET, 'content-type': 'application/json' },
            timeout: 10000
        });
    } catch (err) {
        console.error('[Inbound] Error forwarding admin webhook:', err.message);
    }
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.send('pong'));

// ─── Keep-Alive Pinger ────────────────────────────────────────────────────────
setInterval(async () => {
    if (!HF_BACKEND_URL) return;
    try {
        await axios.get(`${HF_BACKEND_URL}/api/health`, { timeout: 8000 });
        console.log(`[Keep-Alive] HF pinged OK at ${new Date().toISOString()}`);
    } catch (err) {
        console.error(`[Keep-Alive] HF ping failed:`, err.message);
    }
}, 120000);

const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_EXTERNAL_URL) {
    setInterval(async () => {
        try {
            await axios.get(`${RENDER_EXTERNAL_URL}/ping`);
        } catch (_) {}
    }, 600000);
}

app.listen(PORT, () => {
    console.log(`🚀 Render Proxy running on port ${PORT}`);
    console.log(`🔗 Forwarding INBOUND to: ${HF_BACKEND_URL || 'NOT SET'}`);
    console.log(`🔗 Proxying OUTBOUND Telegram API calls`);
});
