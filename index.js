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
// Hugging Face blocks outbound requests to api.telegram.org on Free Tier
// So the backend sends them here, and we forward them to Telegram
app.all('/bot:token/:method', async (req, res) => {
    const { token, method } = req.params;
    const url = `https://api.telegram.org/bot${token}/${method}`;
    
    try {
        const response = await axios({
            method: req.method,
            url: url,
            data: req.body,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json'
            },
            timeout: 10000
        });
        res.status(response.status).send(response.data);
    } catch (err) {
        if (err.response) {
            res.status(err.response.status).send(err.response.data);
        } else {
            console.error(`Error proxying outbound request to ${method}:`, err.message);
            res.status(500).send({ ok: false, description: err.message });
        }
    }
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
