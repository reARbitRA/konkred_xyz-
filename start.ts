import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { createApp } from './server';
import { handleGatewayRequest } from './server/gateway/router';
import { isGatewayConfigured, readGatewayConfig } from './server/gateway/config';
import { log, sendJson } from './server/gateway/http';

const port = Number(process.env.PORT) || 3000;

void createApp().then(async app => {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true, allowedHosts: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  // Same dispatch order as the Vercel function: gateway-owned routes first, then
  // the in-repo Express app. With no KONKRED_GATEWAY_URL configured the BFF
  // declines the request (outside production) and dev keeps the BYOK engine.
  const server = http.createServer((request, response) => {
    handleGatewayRequest(request, response)
      .then(handled => {
        if (!handled) app(request, response);
      })
      .catch(error => {
        log.error('dev.bff', 'gateway route failed', { detail: error instanceof Error ? error.message : String(error) });
        if (!response.headersSent && !response.writableEnded) {
          sendJson(response, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'The platform API failed to process this request.' } });
        }
      });
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`KONKRED Executive Server running on http://localhost:${port}`);
    const config = readGatewayConfig();
    console.log(
      isGatewayConfigured(config)
        ? `fullKONK gateway proxy active → ${config.gatewayUrl} (brain key ${config.fullkonkKey ? 'configured' : 'MISSING'})`
        : 'fullKONK gateway not configured — using the in-repo engine (set KONKRED_GATEWAY_URL + FULLKONK_KEY to proxy).',
    );
  });
}).catch(error => {
  console.error('Failed to start KONKRED server:', error);
  process.exitCode = 1;
});
