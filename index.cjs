const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Get port and target from environment variables with fallback values
const PORT = process.env.PORT || 3000;
const TARGET = process.env.PROXY_TARGET || "bea-data.ixchannels.com";
const MCW_API_PATH = '/mcw/api/'

// Create a proxy server instance
const proxy = httpProxy.createProxyServer({});

// Configuration
const IMAGES_PATH = path.join(__dirname, 'images');
const ALLOWED_IMAGE_TYPES = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/.txt'
};

// List of API endpoints to proxy
const API_ENDPOINTS = [
    '/api/bd/v2_1/report/generateSettledBetsSummary',
    '/api/bd/v2_1/setting/getCustomerService',
    '/api/bd/v2_1/setting/getRegisterSetting',
    '/api/bd/v2_1/provider/getFavouriteGames',
    '/api/bd/v2_1/provider/setFavoriteByGameId',
    '/api/bd/v2_1/provider/getGameListByCategory',
    '/api/bd/v2_1/provider/getGameUrl',
    '/api/bd/v2_1/user/deleteInbox',
    '/api/bd/v2_1/user/getCaptchaCode',
    '/api/bd/v2_1/user/getInboxFromDC',
    '/api/bd/v2_1/user/getPlayerInfo',
    '/api/bd/v2_1/user/getProfile',
    '/api/bd/v2_1/user/forgotPassword',
    '/api/bd/v2_1/user/getVerifyCodeByContactType',
    '/api/bd/v2_1/user/login',
    '/api/bd/v2_1/user/register',
    '/api/bd/v2_1/user/readInbox',
    '/api/bd/v2_1/user/refreshToken',
    '/api/bd/v2_1/user/verifyContact',
    '/api/bd/v2_1/user/changePassword',
    '/api/bd/v2_1/provider/getCategoriesByGroup',
    '/api/bd/v2_1/provider/getVendors',
    '/api/bd/v2_1/user/getBalance',
    '/api/bd/v2_1/report/generateSettledBetsDetail',
    '/api/bd/v2_1/report/generateUnsettledBetsDetail',
    '/api/bd/v2_1/message/getMessageByTypes',
    '/api/bd/v2_1/provider/getCategoriesByGroup'
];

// Function to log request details
const logRequest = (req, body = '') => {
    const timestamp = new Date().toISOString();
    console.log('\n=== Request Log ===');
    console.log(`Timestamp: ${timestamp}`);
    console.log(`Method: ${req.method}`);
    console.log(`URL: ${req.url}`);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    
    if (body) {
        try {
            const parsedBody = JSON.parse(body);
            console.log('Body:', JSON.stringify(parsedBody, null, 2));
        } catch (e) {
            console.log('Body:', body);
        }
    }
};

// Function to decompress response
const decompressResponse = (buffer, encoding) => {
    return new Promise((resolve, reject) => {
        if (!buffer || buffer.length === 0) {
            resolve(buffer);
            return;
        }

        switch (encoding) {
            case 'gzip':
                zlib.gunzip(buffer, (err, decoded) => {
                    if (err) reject(err);
                    else resolve(decoded);
                });
                break;
            case 'deflate':
                zlib.inflate(buffer, (err, decoded) => {
                    if (err) reject(err);
                    else resolve(decoded);
                });
                break;
            case 'br':
                zlib.brotliDecompress(buffer, (err, decoded) => {
                    if (err) reject(err);
                    else resolve(decoded);
                });
                break;
            default:
                resolve(buffer);
        }
    });
};

// Function to log response details
const logResponse = async (proxyRes, req, res) => {
    const chunks = [];
    
    proxyRes.on('data', chunk => chunks.push(chunk));
    
    proxyRes.on('end', async () => {
        const buffer = Buffer.concat(chunks);
        const encoding = proxyRes.headers['content-encoding'];
        
        try {
            // Decompress the response if it's compressed
            const decompressedBuffer = await decompressResponse(buffer, encoding);
            const responseBody = decompressedBuffer.toString('utf8');

            console.log('\n=== Response Log ===');
            console.log(`Timestamp: ${new Date().toISOString()}`);
            console.log(`URL: ${req.url}`);
            console.log(`Status Code: ${proxyRes.statusCode}`);
            console.log('Response Headers:', JSON.stringify(proxyRes.headers, null, 2));
            
            try {
                const parsedBody = JSON.parse(responseBody);
                console.log('Response Body:', JSON.stringify(parsedBody, null, 2));
            } catch (e) {
                console.log('Response Body:', responseBody);
            }
        } catch (error) {
            console.error('Error processing response:', error);
        }
    });
};

// Function to serve static images
const serveImage = (req, res) => {
    const parsedUrl = url.parse(req.url);
    const imagePath = path.join(IMAGES_PATH, decodeURIComponent(parsedUrl.pathname.replace('/images/', '')));
    
    if (!imagePath.startsWith(IMAGES_PATH)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    const ext = path.extname(imagePath).toLowerCase();
    
    if (!ALLOWED_IMAGE_TYPES[ext]) {
        res.writeHead(403);
        return res.end('File type not allowed');
    }

    fs.readFile(imagePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                return res.end('Image not found');
            }
            res.writeHead(500);
            return res.end('Internal server error');
        }

        console.log(`\n=== Static Image Request ===`);
        console.log(`Timestamp: ${new Date().toISOString()}`);
        console.log(`File: ${imagePath}`);
        console.log(`Size: ${data.length} bytes`);

        res.writeHead(200, {
            'Content-Type': ALLOWED_IMAGE_TYPES[ext],
            'Content-Length': data.length,
            'Cache-Control': 'public, max-age=86400'
        });
        res.end(data);
    });
};

// Create server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url);
    
    if (parsedUrl.pathname.startsWith('/images/')) {
        return serveImage(req, res);
    }
    
    if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}update`)) {
      return forceUpdate(req, res);
    }

    if (parsedUrl.pathname.startsWith(`${MCW_API_PATH}maintenance`)) {
        return getMaintenance(req, res);
    }

    if (API_ENDPOINTS.includes(parsedUrl.pathname)) {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', () => {
            // Log the complete request including body
            logRequest(req, body);

            // Create a buffer stream from the body
            const bodyStream = require('stream').Readable.from([body]);

            // Forward the request to the target server
            proxy.web(req, res, {
                target: TARGET,
                changeOrigin: true,
                buffer: bodyStream
            });
        });
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// API route to serve the update JSON
const forceUpdate = (req, res) => {
    const filePath = path.join(__dirname, 'json', 'update.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading update.json:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Failed to load update details" }));
        }

        try {
            const updateInfo = JSON.parse(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(updateInfo));
        } catch (parseError) {
            console.error("Error parsing update.json:", parseError);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Invalid JSON format in update.json" }));
        }
    });
};

const getMaintenance = (req, res) => {
    const filePath = path.join(__dirname, 'json', 'maintenance.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error("Error reading maintenance.json:", err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: "Failed to load maintenance data" }));
        }

        try {
            const maintenanceInfo = JSON.parse(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(maintenanceInfo));
        } catch (parseError) {
            console.error("Error parsing maintenance.json:", parseError);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "Invalid JSON format in maintenance.json" }));
        }
    });
};

// Error handling
proxy.on('error', (err, req, res) => {
    console.error('Proxy Error:', err);
    res.writeHead(500, {
        'Content-Type': 'text/plain'
    });
    res.end('Proxy Error');
});

// Set up proxy response logging
proxy.on('proxyRes', (proxyRes, req, res) => {
    logResponse(proxyRes, req, res);
});

// Ensure images directory exists
if (!fs.existsSync(IMAGES_PATH)) {
    fs.mkdirSync(IMAGES_PATH, { recursive: true });
    console.log(`Created images directory at: ${IMAGES_PATH}`);
}

// Start the server
server.listen(PORT, () => {
    console.log(`Proxy server is running on port ${PORT}`);
    console.log(`Serving images from: ${IMAGES_PATH}`);
});