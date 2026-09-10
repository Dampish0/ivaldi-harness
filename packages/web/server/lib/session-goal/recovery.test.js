import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSessionGoalRuntime } from './runtime.js';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', ...headers },
});
const makeSession = (id = 'ses_recover', status = 'active') => ({
  id, directory: `/projects/${id}`, time: { updated: 100, archived: 0 },
  metadata: { other: 'preserved', openchamber: { goal: {
    id: `goal_${id}`, objective: 'Finish the task', status,
    turnsUsed: 3, tokensUsed: 10, tokensBaseline: 2, tokensCommitted: 0,
    lastAccountedMessageID: 'msg_001', createdAt: 1,
  } } },
});
const assistant = (id = 'msg_002') => ({
  info: {
    id, role: 'assistant', providerID: 'provider', modelID: 'model', agent: 'build',
    time: { completed: 3 }, tokens: { input: 10, output: 5, cache: { read: 0 } },
  }, parts: [{ type: 'text', text: 'More work remains.' }],
});

const activeRuntimes = [];
const setup = ({ sessions = [makeSession()], audit, intercept, acceptPrompt = true } = {}) => {
  const rows = new Map(sessions.map((session) => [session.id, structuredClone(session)]));
  const messages = new Map(sessions.map((session) => [session.id, [assistant()]]));
  const statuses = {};
  const children = new Map();
  const requests = [];
  const prompts = [];
  const listeners = new Set();
  let connected = false;
  const hub = {
    isConnected: () => connected,
    subscribeStatus: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const status = (type) => {
    connected = type === 'connect';
    for (const listener of listeners) listener({ type });
  };
  const service = { generateSmallModelText: vi.fn(audit ?? (async () => ({ text: '{"verdict":"continue","note":"More work remains"}' }))) };
  vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
    const url = new URL(input);
    const request = { url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined, signal: init.signal };
    requests.push(request);
    const intercepted = await intercept?.(request);
    if (intercepted) return intercepted;
    if (url.pathname === '/experimental/session') return json([...rows.values()]);
    const directory = url.searchParams.get('directory');
    if (url.pathname === '/session/status') return json(statuses);
    const [, , id, action] = url.pathname.split('/');
    const session = rows.get(id);
    if (!session) return json({}, 404);
    expect(directory).toBe(session.directory);
    if (action === 'children') return json(children.get(id) ?? []);
    if (action === 'message') return json(messages.get(id));
    if (action === 'prompt_async') {
      prompts.push(request);
      if (acceptPrompt) messages.get(id).push({ info: { id: 'msg_003', role: 'user' }, parts: request.body.parts });
      return new Response(null, { status: 204 });
    }
    if (request.method === 'PATCH') session.metadata = request.body.metadata;
    return json(session);
  }));
  const create = () => {
    const runtime = createSessionGoalRuntime({
      buildOpenCodeUrl: (pathname) => `http://opencode.test${pathname}`,
      getOpenCodeAuthHeaders: () => ({}),
      getSmallModelService: async () => service,
      idleQuietMs: 20,
    });
    activeRuntimes.push(runtime);
    runtime.start(hub);
    return runtime;
  };
  const runtime = create();
  return { runtime, create, status, rows, messages, statuses, children, requests, prompts, service, listeners };
};
const advance = () => vi.advanceTimersByTimeAsync(30);

describe('session goal restart recovery', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    for (const runtime of activeRuntimes.splice(0)) runtime.stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('recovers a persisted active goal without session events and preserves accounting and metadata', async () => {
    const state = setup();
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(1);
    expect(state.rows.get('ses_recover').metadata).toMatchObject({ other: 'preserved', openchamber: { goal: {
      id: 'goal_ses_recover', status: 'active', turnsUsed: 4, tokensUsed: 13, tokensBaseline: 2,
      continuationAfterMessageID: 'msg_002', lastAccountedMessageID: 'msg_002',
    } } });
    expect(state.prompts[0].body).toMatchObject({ model: { providerID: 'provider', modelID: 'model' }, agent: 'build' });
  });

  it('leaves paused, settled, archived and child goals untouched', async () => {
    const sessions = ['paused', 'complete', 'blocked', 'budgetLimited'].map((status) => makeSession(`ses_${status}`, status));
    sessions.push({ ...makeSession('ses_archived'), time: { updated: 100, archived: 50 } });
    sessions.push({ ...makeSession('ses_child'), parentID: 'ses_parent' });
    const state = setup({ sessions });
    state.status('connect');
    await advance();
    expect(state.requests.map((request) => request.url.pathname)).toEqual(['/experimental/session']);
    expect(state.prompts).toHaveLength(0);
  });

  it('reconciles missed idle events after reconnect and coalesces duplicate connects', async () => {
    const state = setup();
    state.statuses.ses_recover = { type: 'busy' };
    state.status('connect');
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(0);
    state.status('disconnect');
    delete state.statuses.ses_recover;
    state.status('connect');
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(1);
    expect(state.requests.filter((request) => request.url.pathname === '/experimental/session')).toHaveLength(2);
  });

  it('waits for working children and preserves the budget cap after restart', async () => {
    const state = setup();
    state.rows.get('ses_recover').metadata.openchamber.goal.tokenBudget = 12;
    state.children.set('ses_recover', [{ id: 'ses_child' }]);
    state.statuses.ses_child = { type: 'retry' };
    state.status('connect');
    await advance();
    expect(state.service.generateSmallModelText).not.toHaveBeenCalled();
    state.status('disconnect');
    delete state.statuses.ses_child;
    state.status('connect');
    await advance();
    expect(state.rows.get('ses_recover').metadata.openchamber.goal.status).toBe('budgetLimited');
    expect(state.prompts).toHaveLength(0);
  });

  it('does not replay a dispatch whose response was lost, including across runtime instances', async () => {
    const state = setup({ intercept: (request) => {
      if (request.url.pathname.endsWith('/prompt_async')) throw new Error('Connection lost after dispatch');
    } });
    state.status('connect');
    await advance();
    state.runtime.stop();
    state.create();
    await advance();
    expect(state.requests.filter((request) => request.url.pathname.endsWith('/prompt_async'))).toHaveLength(1);
    expect(state.rows.get('ses_recover').metadata.openchamber.goal).toMatchObject({
      status: 'blocked', turnsUsed: 4, statusReason: expect.stringContaining('delivery uncertain'),
    });
  });

  it('continues after a newer completed reply, without charging the previous turn again', async () => {
    const state = setup();
    state.status('connect');
    await advance();
    state.runtime.stop();
    state.messages.get('ses_recover').push(assistant('msg_004'));
    state.create();
    await advance();
    expect(state.prompts).toHaveLength(2);
    expect(state.rows.get('ses_recover').metadata.openchamber.goal).toMatchObject({ turnsUsed: 5, tokensUsed: 13 });
  });

  it.each(['user', 'assistant'])('exposes an interrupted idle %s turn for inspection without replaying tools', async (role) => {
    const state = setup();
    state.messages.set('ses_recover', [{ info: { id: 'msg_incomplete', role, time: {} }, parts: [] }]);
    state.status('connect');
    await advance();
    expect(state.rows.get('ses_recover').metadata.openchamber.goal).toMatchObject({ status: 'blocked', statusReason: expect.stringContaining('interrupted turn') });
    expect(state.prompts).toHaveLength(0);
  });

  it.each(['pause', 'stop', 'disconnect', 'abort'])('drops an in-flight audit on %s', async (action) => {
    const pending = Promise.withResolvers();
    const state = setup({ audit: () => pending.promise });
    state.status('connect');
    await advance();
    expect(state.service.generateSmallModelText).toHaveBeenCalledOnce();
    if (action === 'pause') state.rows.get('ses_recover').metadata.openchamber.goal.status = 'paused';
    if (action === 'stop') state.runtime.stop();
    if (action === 'disconnect') state.status('disconnect');
    if (action === 'abort') state.runtime.processPayload({ type: 'message.updated', properties: { info: {
      role: 'assistant', sessionID: 'ses_recover', error: { name: 'MessageAbortedError' },
    } } }, '/projects/ses_recover');
    pending.resolve({ text: '{"verdict":"continue","note":"More work remains"}' });
    await advance();
    expect(state.prompts).toHaveLength(0);
    expect(state.rows.get('ses_recover').metadata.openchamber.goal.turnsUsed).toBe(3);
    if (action === 'pause' || action === 'abort') expect(state.rows.get('ses_recover').metadata.openchamber.goal.status).toBe('paused');
  });

  it('retries a failed page without losing valid goals from other pages', async () => {
    const first = Array.from({ length: 200 }, (_, index) => ({ ...makeSession(`ses_old_${index}`, 'complete'), time: { updated: 200 - index } }));
    first[0] = makeSession('ses_first');
    let fail = true;
    const state = setup({ sessions: [first[0], makeSession()], intercept: (request) => {
      if (request.url.pathname !== '/experimental/session') return;
      expect(request.url.searchParams.get('archived')).toBe('true');
      expect(request.url.searchParams.get('roots')).toBe('true');
      if (!request.url.searchParams.has('cursor')) return json(first, 200, { 'x-next-cursor': '1' });
      expect(request.url.searchParams.get('cursor')).toBe('1');
      if (fail) return json({}, 503);
    } });
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(1);
    fail = false;
    await vi.advanceTimersByTimeAsync(1_050);
    expect(state.prompts).toHaveLength(2);
  });

  it('keeps valid sessions recoverable when another record is malformed', async () => {
    const state = setup({ intercept: (request) => {
      if (request.url.pathname === '/experimental/session') return json([null, makeSession()]);
    } });
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(1);
    state.runtime.stop();
    const count = state.requests.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(state.requests).toHaveLength(count);
    expect(state.listeners.size).toBe(0);
  });

  it('retries failed or malformed live reads instead of treating them as idle', async () => {
    let fail = true;
    const state = setup({ intercept: (request) => {
      if (request.url.pathname === '/session/status' && fail) return json({ ses_recover: { unexpected: true } });
    } });
    state.status('connect');
    await advance();
    expect(state.service.generateSmallModelText).not.toHaveBeenCalled();
    fail = false;
    await advance();
    expect(state.prompts).toHaveLength(1);
  });

  it('ignores a discovery response arriving after disconnect', async () => {
    const pending = Promise.withResolvers();
    const state = setup({ intercept: (request) => request.url.pathname === '/experimental/session' ? pending.promise : undefined });
    state.status('connect');
    state.status('disconnect');
    pending.resolve(json([makeSession()]));
    await advance();
    expect(state.requests).toHaveLength(1);
    expect(state.prompts).toHaveLength(0);
  });

  it('recovers after reconnect without waiting for the disconnected audit to finish', async () => {
    const pending = Promise.withResolvers();
    let calls = 0;
    const state = setup({ audit: () => {
      calls += 1;
      return calls === 1 ? pending.promise : Promise.resolve({ text: '{"verdict":"continue","note":"Continue"}' });
    } });
    state.status('connect');
    await advance();
    state.status('disconnect');
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(1);
    pending.resolve({ text: '{"verdict":"complete","note":"Complete"}' });
    await advance();
    expect(state.rows.get('ses_recover').metadata.openchamber.goal.status).toBe('active');
    expect(state.prompts).toHaveLength(1);
  });

  it('drops an audit result when the objective was edited in place', async () => {
    const pending = Promise.withResolvers();
    const state = setup({ audit: () => pending.promise });
    state.status('connect');
    await advance();
    const goal = state.rows.get('ses_recover').metadata.openchamber.goal;
    goal.objective = 'A different task';
    goal.updatedAt = 99;
    pending.resolve({ text: '{"verdict":"complete","note":"Old task complete"}' });
    await advance();
    expect(goal.status).toBe('active');
    expect(state.requests.filter((request) => request.method === 'PATCH')).toHaveLength(0);
  });

  it('allows an explicit resume after inspecting an uncertain dispatch', async () => {
    const session = makeSession();
    session.metadata.openchamber.goal.continuationAfterMessageID = 'msg_002';
    const state = setup({ sessions: [session] });
    state.status('connect');
    await advance();
    const current = state.rows.get(session.id);
    expect(current.metadata.openchamber.goal.status).toBe('blocked');
    Object.assign(current.metadata.openchamber.goal, { status: 'active', statusReason: 'resumed', turnsUsed: 0 });
    state.runtime.processPayload({ type: 'session.updated', properties: { info: current } });
    await vi.advanceTimersByTimeAsync(260);
    expect(state.prompts).toHaveLength(1);
  });

  it('does not dispatch before a failed reservation write has succeeded', async () => {
    let fail = true;
    const state = setup({ intercept: (request) => request.method === 'PATCH' && fail ? json({}, 503) : undefined });
    state.status('connect');
    await advance();
    expect(state.prompts).toHaveLength(0);
    expect(state.rows.get('ses_recover').metadata.openchamber.goal.turnsUsed).toBe(3);
    fail = false;
    await advance();
    expect(state.prompts).toHaveLength(1);
    expect(state.rows.get('ses_recover').metadata.openchamber.goal.turnsUsed).toBe(4);
  });

  it('backs off when a full discovery page has a non-advancing cursor', async () => {
    const page = Array.from({ length: 200 }, (_, index) => makeSession(`ses_${index}`, 'complete'));
    const state = setup({ intercept: (request) => request.url.pathname === '/experimental/session'
      ? json(page, 200, { 'x-next-cursor': '100' }) : undefined });
    state.status('connect');
    await advance();
    expect(state.requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(state.requests).toHaveLength(4);
  });
});
