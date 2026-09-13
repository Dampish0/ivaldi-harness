import { createOpencodeClient } from '@opencode-ai/sdk/v2/client';
import { fetch as nativeFetch } from 'expo/fetch';
import { Platform } from 'react-native';
import { z } from 'zod';
import { parsePairingConnectionPayloadString } from '../generated/portable/connectionPayload';
import { createRelayTunnelClient, type RelayTunnelClient } from '../generated/portable/relay/tunnel-client';
import { authSchema, connectionSchema, healthSchema, tokenSchema, type SavedConnection } from './schema';
import { readConnections, readToken, saveConnection } from './storage';
import { StreamResponse, trackResponse } from './stream-response';
import { prepareWorkspacePage, workspaceUrl } from './workspace';
import { reusablePairingConnection } from './connection-identity';

export class ConnectionError extends Error {
  constructor(public readonly code: 'invalidUrl' | 'unreachable' | 'authRequired' | 'passwordFailed' | 'invalidPairing' | 'storage') { super(code); }
}
type Transport = { base: string; tunnel: RelayTunnelClient | null; serverId?: string };
export function normalizeAddress(value: string) {
  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value.trim()) ? value.trim() : `http://${value.trim()}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new ConnectionError('invalidUrl');
    return url.toString().replace(/\/+$/, '');
  } catch { throw new ConnectionError('invalidUrl'); }
}
async function transportRequest(transport: Transport, path: string, init: RequestInit = {}) {
  return transport.tunnel ? transport.tunnel.fetch(`${transport.base}${path}`, init) : nativeFetch(`${transport.base}${path}`, init);
}
async function establish(connection: SavedConnection): Promise<Transport> {
  const pinnedId = connection.serverId ?? connection.candidates.find(candidate => candidate.type === 'relay')?.serverId;
  for (const candidate of [...connection.candidates].sort((a, b) => (a.type === 'relay' ? 1 : 0) - (b.type === 'relay' ? 1 : 0) || (a.priority ?? 100) - (b.priority ?? 100))) {
    let tunnel: RelayTunnelClient | null = null;
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), candidate.type === 'relay' ? 15000 : 3000);
    try {
      if (candidate.type === 'relay') tunnel = createRelayTunnelClient({ ...candidate, listenToBrowserWakeEvents: false, createResponse: (body, init) => new StreamResponse(body, init) });
      const transport = { base: candidate.type === 'relay' ? 'https://ivaldi.relay' : normalizeAddress(candidate.url), tunnel };
      const response = await transportRequest(transport, '/health', { signal: abort.signal, redirect: 'error' });
      if (!response.ok) throw new ConnectionError('unreachable');
      const health = healthSchema.parse(await response.json());
      if (pinnedId && health.serverId !== pinnedId) throw new ConnectionError('unreachable');
      return { ...transport, serverId: health.serverId ?? pinnedId };
    } catch { tunnel?.close(); } finally { clearTimeout(timeout); }
  }
  throw new ConnectionError('unreachable');
}

export class NativeRuntime {
  readonly sdk;
  readonly connection: SavedConnection;
  private readonly abort = new AbortController();
  private readonly transport: Transport;
  private readonly token: string | null;
  constructor(connection: SavedConnection, transport: Transport, token: string | null) {
    this.connection = connection;
    this.transport = transport;
    this.token = token;
    this.sdk = createOpencodeClient({ baseUrl: `${transport.base}/api`, fetch: this.fetch, throwOnError: true });
  }
  // SDK Request objects retain their method, body, query, headers and signal.
  // This adapter is the only place that attaches the native credential.
  private fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    if (new URL(request.url).origin !== new URL(this.transport.base).origin) throw new ConnectionError('invalidUrl');
    if (this.token) request.headers.set('Authorization', `Bearer ${this.token}`);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    this.abort.signal.addEventListener('abort', cancel);
    request.signal.addEventListener('abort', cancel);
    if (this.abort.signal.aborted || request.signal.aborted) controller.abort();
    const eventStream = request.headers.get('Accept')?.includes('text/event-stream') || /\/(global\/)?event$/.test(new URL(request.url).pathname);
    // OAuth auto completion waits on the server while the user signs in.
    // Keep its existing abort lifetime, but allow time to finish in a browser.
    const oauthCallback = request.method === 'POST' && /^\/api\/provider\/[^/]+\/oauth\/callback$/.test(new URL(request.url).pathname);
    const timeout = eventStream ? undefined : setTimeout(cancel, oauthCallback ? 300000 : 30000);
    const finish = () => { if (timeout) clearTimeout(timeout); this.abort.signal.removeEventListener('abort', cancel); request.signal.removeEventListener('abort', cancel); };
    try {
      const options = { signal: controller.signal, redirect: 'error' as const };
      // React Native's Request retains its payload through arrayBuffer(), but
      // has no readable .body property. The browser tunnel normalizer reads
      // .body, so hand it the explicitly serialized native payload instead.
      const response = this.transport.tunnel ? await this.transport.tunnel.fetch(request.url, {
        ...options, method: request.method, headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      }) : await nativeFetch(request, options);
      if (response.status === 401 || response.status === 403) { controller.abort(); throw new ConnectionError('authRequired'); }
      return trackResponse(response, finish);
    } catch (error) { finish(); throw error; }
  };
  runtimeFetch(path: string, init?: RequestInit) {
    if (!path.startsWith('/') || path.startsWith('//')) throw new ConnectionError('invalidUrl');
    return this.fetch(`${this.transport.base}${path}`, init);
  }
  async json<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const response = await this.runtimeFetch(path, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return schema.parse(await response.json());
  }
  get supportsWorkspace() { return this.transport.tunnel === null; }
  async workspace(sessionId: string | null, mode: 'work' | 'developer') {
    if (!this.supportsWorkspace) throw new Error('Hosted tools require a direct connection');
    const page = workspaceUrl(this.transport.base, sessionId);
    const response = await this.fetch(page);
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) throw new Error('Server application unavailable');
    return prepareWorkspacePage(await response.text(), page, this.token, mode);
  }
  close() { this.abort.abort(); this.transport.tunnel?.close(); }
}

export async function reconnect(connection: SavedConnection) {
  const token = await readToken(connection.id);
  const transport = await establish(connection);
  const runtime = new NativeRuntime(connection, transport, token);
  try {
    const auth = await runtime.json('/auth/session', authSchema);
    if (!auth.authenticated && !auth.disabled) throw new ConnectionError('authRequired');
    return runtime;
  } catch (error) { runtime.close(); throw error; }
}

export async function connectAddress(address: string, password: string, suppliedToken: string) {
  const url = normalizeAddress(address);
  const existing = (await readConnections()).find(item => item.candidates.some(candidate => candidate.type !== 'relay' && normalizeAddress(candidate.url) === url));
  const connection: SavedConnection = existing ?? { id: crypto.randomUUID(), label: new URL(url).host, candidates: [{ type: 'lan', url }] };
  const transport = await establish(connection);
  let token = suppliedToken.trim() || await readToken(connection.id);
  try {
    if (password) {
      const response = await transportRequest(transport, '/auth/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ password, issueClientToken: true, trustDevice: true, clientLabel: 'Ivaldi Native', clientKind: 'mobile', devicePlatform: Platform.OS, dedupeKey: `native-${connection.id}` }),
      });
      if (!response.ok) throw new ConnectionError('passwordFailed');
      token = tokenSchema.parse(await response.json()).clientToken;
    }
    const updated = { ...connection, serverId: transport.serverId };
    const runtime = new NativeRuntime(updated, transport, token);
    try {
      const auth = await runtime.json('/auth/session', authSchema);
      if (!auth.authenticated && !auth.disabled) throw new ConnectionError('authRequired');
      await saveConnection(updated, token);
      return runtime;
    } catch (error) { runtime.close(); throw error; }
  } catch (error) { transport.tunnel?.close(); throw error; }
}

export function inspectPairing(link: string) {
  const payload = parsePairingConnectionPayloadString(link);
  if (!payload) throw new ConnectionError('invalidPairing');
  return { label: payload.label ?? 'Ivaldi', fingerprint: payload.fingerprint };
}
async function pairingDigest(link: string) {
  const normalized = link.trim().replace(/^ivaldi-native:/i, 'ivaldi:');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function wasPairingRedeemed(link: string) {
  const digest = await pairingDigest(link);
  return (await readConnections()).some(connection => connection.redeemedPairingDigest === digest);
}
export async function redeemPairing(link: string) {
  const payload = parsePairingConnectionPayloadString(link);
  if (!payload) throw new ConnectionError('invalidPairing');
  const redeemedPairingDigest = await pairingDigest(link);
  const connection = connectionSchema.parse({ id: crypto.randomUUID(), label: payload.label ?? 'Ivaldi', candidates: payload.candidates });
  const savedConnections = await readConnections();
  const transport = await establish(connection);
  const previous = reusablePairingConnection(savedConnections, connection, transport.serverId);
  if (previous) connection.id = previous.id;
  try {
    // Single-use redemption is never retried against another candidate.
    const response = await transportRequest(transport, '/api/client-auth/pairing/redeem', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ pairingId: payload.pairingId, secret: payload.secret, clientLabel: 'Ivaldi Native', clientKind: 'mobile', deviceName: 'Ivaldi Native', devicePlatform: Platform.OS, dedupeKey: `native-${connection.id}` }),
    });
    if (!response.ok) throw new ConnectionError('invalidPairing');
    const result = tokenSchema.parse(await response.json());
    const saved = { ...connection, label: payload.label ?? result.server?.label ?? 'Ivaldi', serverId: transport.serverId, redeemedPairingDigest };
    await saveConnection(saved, result.clientToken);
    return new NativeRuntime(saved, transport, result.clientToken);
  } catch (error) { transport.tunnel?.close(); throw error; }
}
