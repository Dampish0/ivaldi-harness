import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';

import { createGlobalMessageStreamHub } from '../event-stream/global-hub.js';
import { createSessionGoalRuntime } from './runtime.js';

it('recovers through the real HTTP client and shared SSE hub after startup and a lost connection', async () => {
  const session = {
    id: 'ses_http', directory: '/http-project', time: { updated: 100 },
    metadata: { openchamber: { goal: {
      id: 'goal_http', objective: 'Finish the task', status: 'active', turnsUsed: 2, createdAt: 1,
    } } },
  };
  const messages = [{ info: {
    id: 'msg_001', role: 'assistant', providerID: 'provider', modelID: 'model', time: { completed: 2 },
  }, parts: [{ type: 'text', text: 'More work remains.' }] }];
  const streams = new Set();
  let discoveries = 0;
  let prompts = 0;
  let busy = true;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const send = (body) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body)); };
    if (url.pathname === '/global/event') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      response.write(': connected\n\n');
      streams.add(response);
      response.on('close', () => streams.delete(response));
      return;
    }
    if (url.pathname === '/experimental/session') {
      discoveries += 1;
      send([session]);
      return;
    }
    if (url.searchParams.get('directory') !== session.directory) {
      response.writeHead(400).end();
      return;
    }
    if (url.pathname === '/session/status') return send(busy ? { ses_http: { type: 'busy' } } : {});
    if (url.pathname.endsWith('/children')) return send([]);
    if (url.pathname.endsWith('/message')) return send(messages);
    if (request.method === 'PATCH') {
      let body = '';
      for await (const chunk of request) body += chunk;
      session.metadata = JSON.parse(body).metadata;
    }
    if (url.pathname.endsWith('/prompt_async')) {
      prompts += 1;
      busy = true;
      response.writeHead(204).end();
      return;
    }
    send(session);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const buildOpenCodeUrl = (pathname) => `http://127.0.0.1:${server.address().port}${pathname}`;
  const getOpenCodeAuthHeaders = () => ({});
  const hub = createGlobalMessageStreamHub({ buildOpenCodeUrl, getOpenCodeAuthHeaders, upstreamReconnectDelayMs: 10 });
  const runtime = createSessionGoalRuntime({
    buildOpenCodeUrl, getOpenCodeAuthHeaders, idleQuietMs: 10,
    getSmallModelService: async () => ({ generateSmallModelText: async () => ({ text: '{"verdict":"continue","note":"More work remains"}' }) }),
  });
  try {
    runtime.start(hub);
    hub.start();
    await vi.waitFor(() => expect(discoveries).toBe(1));
    expect(prompts).toBe(0);
    busy = false;
    for (const response of streams) response.end();
    await vi.waitFor(() => expect(prompts).toBe(1));
    expect(discoveries).toBe(2);
    expect(session.metadata.openchamber.goal).toMatchObject({ turnsUsed: 3, continuationAfterMessageID: 'msg_001' });
  } finally {
    runtime.stop();
    hub.stop();
    for (const response of streams) response.end();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
