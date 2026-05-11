// ===== Kling Motion Studio - Local Proxy Server =====
// This server proxies API calls to Magnific API to avoid CORS issues

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const SERVER_API_KEY = process.env.MAGNIFIC_API_KEY || '';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Large limit for base64 images/videos
app.use(express.static(path.join(__dirname))); // Serve static files (HTML, CSS, JS)

app.get('/api/config', (req, res) => {
    res.json({ requiresClientApiKey: !SERVER_API_KEY });
});

// ===== API Proxy (middleware approach - works with all Express versions) =====
app.use('/api', async (req, res) => {
    // req.url is already stripped of the /api mount path by Express
    const apiPath = req.url.replace(/^\//, ''); // remove leading slash
    const targetUrl = `https://api.magnific.com/v1/ai/${apiPath}`;

    // Get API key from request header
    const apiKey = SERVER_API_KEY || req.headers['x-magnific-api-key'];
    if (!apiKey) {
        return res.status(401).json({ error: 'Missing x-magnific-api-key header' });
    }

    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'x-magnific-api-key': apiKey,
                'Content-Type': 'application/json',
            },
        };

        // Add body for POST/PUT/PATCH
        if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }

        console.log(`[Proxy] ${req.method} → ${targetUrl}`);

        const response = await fetch(targetUrl, fetchOptions);
        const data = await response.json().catch(() => ({}));

        res.status(response.status).json(data);

    } catch (err) {
        console.error(`[Proxy Error] ${err.message}`);
        res.status(500).json({ error: 'Proxy error: ' + err.message });
    }
});

// ===== Serve index.html for root =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════════╗');
    console.log('  ║   🎬 Kling Motion Studio                    ║');
    console.log(`  ║   Server running at http://localhost:${PORT}    ║`);
    console.log('  ║                                              ║');
    console.log('  ║   Open in browser to start generating!       ║');
    console.log('  ╚══════════════════════════════════════════════╝');
    console.log('');
});
