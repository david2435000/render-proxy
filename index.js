require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 10000;
const HF_BACKEND_URL = process.env.HF_BACKEND_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'luckybirr_super_secret';

if (!HF_BACKEND_URL) {
    console.warn("⚠️ HF_BACKEND_URL is not set. Please set it to your Hugging Face space URL (e.g., https://username-spacename.hf.space)");
}

// ─── Webhook Forwarding (Inbound to HF) ──────────────────────────────────────
app.post('/webhook/main', async (req, res) => {
    res.sendStatus(200);
    if (!HF_BACKEND_URL) return;

    try {
        await axios.post(`${HF_BACKEND_URL}/webhook/main`, req.body, {
            headers: { 'x-webhook-secret': WEBHOOK_SECRET },
            timeout: 10000
        });
    } catch (err) {
        console.error('Error forwarding main bot webhook:', err.message);
    }
});

app.post('/webhook/admin', async (req, res) => {
    res.sendStatus(200);
    if (!HF_BACKEND_URL) return;

    try {
        await axios.post(`${HF_BACKEND_URL}/webhook/admin`, req.body, {
            headers: { 'x-webhook-secret': WEBHOOK_SECRET },
            timeout: 10000
        });
    } catch (err) {
        console.error('Error forwarding admin bot webhook:', err.message);
    }
});

// ─── Outbound Telegram API Proxy (HF to Telegram) ────────────────────────────
const https = require('https');

app.all('/bot:token/:method', (req, res) => {
    const { token, method } = req.params;
    
    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: req.method,
        headers: { ...req.headers }
    };
    
    // Clean headers that shouldn't be forwarded
    delete options.headers['host'];
    delete options.headers['connection'];
    
    const proxyReq = https.request(options, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res, { end: true });
    });
    
    proxyReq.on('error', (err) => {
        console.error(`Error proxying outbound request to ${method}:`, err.message);
        res.status(500).send({ ok: false, description: err.message });
    });
    
    // Pipe the original request body straight to the Telegram API
    req.pipe(proxyReq, { end: true });
});

// ─── Health & Keep-Alive ─────────────────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.send('Proxy is awake');
});

setInterval(async () => {
    if (!HF_BACKEND_URL) return;
    try {
        await axios.get(`${HF_BACKEND_URL}/api/health`, { timeout: 10000 });
        console.log(`[Keep-Alive] Pinged Hugging Face successfully at ${new Date().toISOString()}`);
    } catch (err) {
        console.error(`[Keep-Alive] Failed to ping Hugging Face:`, err.message);
    }
}, 120000);

const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_EXTERNAL_URL) {
    setInterval(async () => {
        try {
            await axios.get(`${RENDER_EXTERNAL_URL}/ping`);
            console.log(`[Keep-Alive] Pinged Render self successfully`);
        } catch (err) {
            console.error(`[Keep-Alive] Failed to ping Render self:`, err.message);
        }
    }, 600000);
}

app.listen(PORT, () => {
    console.log(`🚀 Render Proxy running on port ${PORT}`);
    console.log(`🔗 Forwarding INBOUND to: ${HF_BACKEND_URL || 'NOT SET'}`);
    console.log(`🔗 Proxying OUTBOUND for Telegram API enabled`);
});
