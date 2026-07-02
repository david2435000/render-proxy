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

// ─── Webhook Forwarding ──────────────────────────────────────────────────────
app.post('/webhook/main', async (req, res) => {
    // Acknowledge Telegram immediately to prevent retries
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

// ─── Health & Keep-Alive ─────────────────────────────────────────────────────
app.get('/ping', (req, res) => {
    res.send('Proxy is awake');
});

// Ping Hugging Face every 2 minutes (120000 ms) to keep it awake
setInterval(async () => {
    if (!HF_BACKEND_URL) return;
    try {
        await axios.get(`${HF_BACKEND_URL}/api/health`, { timeout: 10000 });
        console.log(`[Keep-Alive] Pinged Hugging Face successfully at ${new Date().toISOString()}`);
    } catch (err) {
        console.error(`[Keep-Alive] Failed to ping Hugging Face:`, err.message);
    }
}, 120000);

// Also ping itself every 10 minutes (Render free tier sleeps after 15 min)
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_EXTERNAL_URL) {
    setInterval(async () => {
        try {
            await axios.get(`${RENDER_EXTERNAL_URL}/ping`);
            console.log(`[Keep-Alive] Pinged Render self successfully`);
        } catch (err) {
            console.error(`[Keep-Alive] Failed to ping Render self:`, err.message);
        }
    }, 600000); // 10 minutes
}

app.listen(PORT, () => {
    console.log(`🚀 Render Proxy running on port ${PORT}`);
    console.log(`🔗 Forwarding to: ${HF_BACKEND_URL || 'NOT SET'}`);
});
