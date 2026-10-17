import { createServer } from 'node:http';
import { renderStills } from './runStill.js';

const port = Number(process.env.PORT || 8080);

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method !== 'POST' || req.url !== '/render') {
    res.writeHead(404);
    res.end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Parameters<typeof renderStills>[0];
    const result = await renderStills(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ detail: error instanceof Error ? error.message : 'Render failed' }));
  }
});

server.listen(port, '0.0.0.0');
