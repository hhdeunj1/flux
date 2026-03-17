const http = require('http');
const https = require('https');

const PORT = 3001;

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      const { apiKey, ...rest } = JSON.parse(body);
      const payload = JSON.stringify(rest);

      const options = {
        hostname: 'h-chat-api.autoever.com',
        path: '/claude-code/v2/v1/messages',
        method: 'POST',
        headers: {
          'authorization': `Bearer ${apiKey}`,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      };

      const proxyReq = https.request(options, (proxyRes) => {
        let responseBody = '';
        proxyRes.on('data', chunk => responseBody += chunk);
        proxyRes.on('end', () => {
          if (proxyRes.statusCode !== 200) {
            console.error('Anthropic 오류:', proxyRes.statusCode, responseBody);
          }
          res.writeHead(proxyRes.statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(responseBody);
        });
      });

      proxyReq.on('error', (e) => {
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      });

      proxyReq.write(payload);
      proxyReq.end();
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
  });
});

server.listen(PORT, () => console.log(`✓ 프록시 서버 실행 중: http://localhost:${PORT}`));
