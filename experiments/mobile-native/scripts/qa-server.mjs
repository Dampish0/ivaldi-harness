// A loopback-only API fixture for Android acceptance. Never packaged in the app.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { startQaRelay } from './qa-relay.mjs';
import { createProviderFixture } from './fixtures/native-providers.mjs';
import { createSettingsStorageFixture } from './fixtures/native-settings-storage.mjs';

const port = z.coerce.number().int().min(1024).max(65534).parse(process.argv.find(argument => argument.startsWith('--port='))?.slice(7) ?? 39123);
const fixtureLabel = port === 39123 ? 'Native QA' : `Native QA ${port}`;
const images = process.argv.includes('--images');
const chatDisplay = process.argv.includes('--chat-display');
const visual = process.argv.includes('--visual') || images || chatDisplay;
const relay = process.argv.includes('--relay') ? await startQaRelay(port + 1, port) : null;
const adb = join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const emulatorHost = process.argv.includes('--emulator-host');
if (emulatorHost && (relay || !/^emulator-\d+$/.test(serial))) throw new Error('Host alias requires a direct Android emulator fixture');
const exec = promisify(execFile);
const token = randomUUID(); const secret = randomUUID(); const pairingId = randomUUID();
let redeemed = false;
const stats = { redemptions: 0, rejectedAuth: 0, rejectedAuthCategories: { favicon: 0, workspace: 0, 'workspace-check': 0, other: 0 }, authChecks: 0, prompts: 0, aborts: 0, permissionReplies: [], questionReplies: [], attachmentCount: 0, settingsReads: 0, settingsWrites: 0, sessionGets: 0, sessionCreates: 0, sessionLists: 0, sessionUpdateAttempts: 0, sessionUpdates: 0, lastSessionUpdate: null, workspaceLoads: 0, workspaceChecks: 0, lastPrompt: null, lastDeletedSession: null };
const settings = { defaultModel: 'qa/native', defaultVariant: 'high', defaultAgent: 'build', showReasoning: true };
const registrySchema = z.array(z.object({ id: z.string().min(1), path: z.string().startsWith('C:/IvaldiNativeQA/'), label: z.string().optional() }).strict());
let projectRegistry = process.argv.includes('--projects') ? registrySchema.parse([
  { id: 'research', path: 'C:/IvaldiNativeQA/research', label: 'Research' },
  { id: 'design', path: 'C:/IvaldiNativeQA/project', label: 'Design system' },
  { id: 'long', path: 'C:/IvaldiNativeQA/a-project-with-a-deliberately-long-folder-name', label: 'A project name that should fit without displacing its controls' },
]) : null;
const storedSettings = process.argv.includes('--settings-storage') ? await createSettingsStorageFixture(settings) : null;
const settingsStorageControl = z.object({ command: z.enum(['read', 'write', 'corrupt', 'repair']) }).strict();
const defaultsPatchSchema = z.object({ defaultModel: z.string().trim().optional(), defaultVariant: z.string().trim().optional(), defaultAgent: z.string().trim().optional() });
const operationSchema = z.enum(['settings-read', 'settings-write', 'session-get', 'session-create', 'session-list', 'session-update', 'session-update-response', 'workspace-load', 'auth-session', 'pairing-redeem', 'provider-list', 'agent-list', 'provider-auth', 'provider-source', 'provider-save', 'provider-delete', 'provider-authorize', 'provider-callback', 'provider-reload', 'provider-config-read', 'provider-config-write', 'provider-config-delete']);
const failureSchema = z.object({ operation: operationSchema, status: z.union([z.literal(404), z.literal(409), z.literal(422), z.literal(500), z.literal(503)]).default(503) })
  .refine(value => value.status !== 404 || value.operation === 'session-get')
  .refine(value => value.status !== 409 || ['provider-config-write', 'provider-config-delete'].includes(value.operation))
  .refine(value => value.status !== 422 || ['provider-config-read', 'provider-config-write'].includes(value.operation));
const delaySchema = z.object({ operation: operationSchema, delayMs: z.number().int().min(1).max(15000) });
const deleteSessionSchema = z.object({ sessionId: z.string().regex(/^ses_(?:native_qa|visual_\d+|[a-f\d-]{36})$/), emitEvent: z.boolean().default(true) });
const promptSelectionSchema = z.object({ model: z.object({ providerID: z.string(), modelID: z.string(), variant: z.string().optional() }).optional(), variant: z.string().optional(), agent: z.string().optional() });
const sessionCreateSchema = z.object({ title: z.string().optional(), agent: z.string().trim().min(1).optional(), model: z.object({ id: z.string().min(1), providerID: z.string().min(1), variant: z.string().min(1).optional() }).optional() });
const sessionPatchSchema = z.union([z.object({ title: z.string().trim().min(1) }).strict(), z.object({ time: z.object({ archived: z.number().nonnegative() }).strict() }).strict()]);
const externalSessionPatchSchema = deleteSessionSchema.pick({ sessionId: true }).extend({ update: sessionPatchSchema });
const failures = new Map();
const delays = new Map();
const connections = new Set(); const timers = new Map();
const directory = 'C:/IvaldiNativeQA/project';
const seedModel = { id: 'native', providerID: 'qa', variant: 'high' };
const seed = { id: 'ses_native_qa', title: 'Native acceptance', directory, model: { ...seedModel }, agent: 'build', time: { created: Date.now(), updated: Date.now() } };
const sessions = [seed]; const messages = new Map([[seed.id, []]]); const statuses = {};
let permissions = [{ id: 'per_native_qa', sessionID: seed.id, permission: 'read', patterns: ['fixture.txt'] }];
let questions = [{ id: 'que_native_qa', sessionID: seed.id, questions: [{ header: 'Fixture', question: 'Choose the native test result.', options: [{ label: 'Passed', description: 'Submit the fixture answer.' }, { label: 'Retry', description: 'Repeat this test.' }], custom: true }] }];
const providers = { all: [{ id: 'qa', name: 'Native QA', models: { native: { id: 'native', name: 'Native fixture', variants: { low: {}, high: {} } }, second: { id: 'second', name: 'Second fixture' } } }], connected: ['qa'], default: { qa: 'native' } };
if (visual) {
  seed.title = 'Review typography, long content, and keyboard transitions on Android';
  permissions = []; questions = [];
  for (let index = 0; index < 18; index++) {
    const session = { id: 'ses_visual_' + index, title: index % 3 ? 'Conversation ' + (index + 1) : 'A long conversation title that should truncate without displacing other controls', directory: index < 6 ? 'C:/IvaldiNativeQA/.config/ivaldi/chats/visual-' + index : index < 12 ? directory : 'C:/IvaldiNativeQA/a-project-with-a-deliberately-long-folder-name', model: { ...seedModel }, agent: 'build', time: { created: Date.now() - index, updated: Date.now() - index } };
    if (index === 17) session.time.archived = Date.now();
    sessions.push(session); messages.set(session.id, []);
  }
  const info = { id: 'msg_visual', sessionID: seed.id, role: 'assistant', time: { created: Date.now(), completed: Date.now() } };
  const part = { messageID: info.id, sessionID: seed.id };
  messages.set(seed.id, [{ info, parts: [
    { ...part, id: 'prt_visual_text', type: 'text', text: '# A clear, readable conversation\n\nThis is a **bold phrase**, an *italic phrase*, and `inlineCode()` beside ordinary text.\n\n## A useful next step\n\nLong code should scroll horizontally and preserve indentation.\n\n```typescript\nconst message = { title: "This line is intentionally wider than the available phone screen", status: "ready" };\nfunction greet(name: string) {\n  return `Hello, ${name}`;\n}\n```\n\n> A quotation should have enough padding and contrast to stay readable.\n\n| Setting | Current value | Reason |\n| --- | --- | --- |\n| Font | Selawik | Match desktop typography |\n| Composer | Always available | Choose a model before typing |\n\n1. Open the sidebar.\n2. Expand a project folder.\n3. Return to your conversation.\n\nA final paragraph for checking the space above the composer.' },
    { ...part, id: 'prt_visual_reasoning', type: 'reasoning', text: 'This disclosure contains several lines of reasoning. Opening and closing it should animate both the content and the rows below it. Larger text must remain readable.' },
    { ...part, id: 'prt_visual_tool', type: 'tool', tool: 'read', callID: 'call_visual', state: { status: 'completed', title: 'Read the project documentation and inspect the current mobile layout', input: { path: 'README.md' }, output: 'Visual fixture completed successfully.\nNo user files were accessed.' } },
  ] }]);
  const userInfo = { id: 'msg_visual_user', sessionID: seed.id, role: 'user', agent: 'build', model: { providerID: 'qa', modelID: 'native', variant: 'high' }, time: { created: info.time.created - 1000 } };
  messages.get(seed.id).unshift({ info: userInfo, parts: [
    { id: 'prt_visual_user_text', messageID: userInfo.id, sessionID: seed.id, type: 'text', text: 'Please review this document and explain the next steps.' },
    { id: 'prt_visual_file', messageID: userInfo.id, sessionID: seed.id, type: 'file', filename: 'Mobile layout review with a deliberately long document name.txt', mime: 'text/plain', url: 'data:text/plain;base64,TmF0aXZlIFFBIGZpeHR1cmU=' },
  ] });
  if (chatDisplay) {
    seed.title = 'Chat display preferences review';
    const displayInfo = { ...userInfo, id: 'msg_chat_display_user', time: { created: info.time.created - 500 } };
    messages.get(seed.id).splice(1, 0, { info: displayInfo, parts: [
      { id: 'prt_chat_display_user_text', messageID: displayInfo.id, sessionID: seed.id, type: 'text', text: 'Keep this **bold request** and `inlineCode()` readable.\n\nVisit [the sample page](https://example.com/chat-display) or https://example.com/chat-display for this synthetic review.\n\nThis deliberately long user message line checks wrapping at larger text sizes without losing the last words, moving the bubble past the screen edge, or hiding the next message.\n\n```typescript\nconst displayPreferences = { reasoning: "visible", tools: "collapsed", userMessage: "a deliberately long value that must remain readable on a narrow phone" };\n```' },
    ] });
    const assistant = messages.get(seed.id).find(message => message.info.id === info.id);
    assistant.parts.push(
      { ...part, id: 'prt_chat_display_bash', type: 'tool', tool: 'bash', callID: 'call_chat_display_bash', state: { status: 'completed', title: 'Bash output', input: { command: 'printf "Synthetic bash fixture"' }, output: 'Bash fixture output is visible.\nNo command was executed.' } },
      { ...part, id: 'prt_chat_display_shell', type: 'tool', tool: 'shell', callID: 'call_chat_display_shell', state: { status: 'completed', title: 'Shell output', input: { command: 'printf "Synthetic shell fixture"' }, output: 'Shell alias output is visible.\nNo command was executed.' } },
      { ...part, id: 'prt_chat_display_edit', type: 'tool', tool: 'edit', callID: 'call_chat_display_edit', state: { status: 'completed', title: 'Edit output', input: { filePath: 'fixture.txt', oldString: 'Before', newString: 'After' }, output: 'Edit fixture output is visible.\nNo file was modified.' } },
      { ...part, id: 'prt_chat_display_apply_patch', type: 'tool', tool: 'apply_patch', callID: 'call_chat_display_apply_patch', state: { status: 'completed', title: 'Patch output', input: { patchText: '*** Begin Patch\n*** Update File: fixture.txt\n@@\n-Before\n+After\n*** End Patch' }, output: 'Patch alias output is visible.\nNo file was modified.' } },
    );
  }
  for (let index = 0; index < 22; index++) providers.all[0].models['visual-' + index] = { id: 'visual-' + index, name: index === 0 ? 'A deliberately long model name with a version and descriptive suffix' : 'Visual model ' + String(index + 1).padStart(2, '0') };
}
if (images) {
  seed.title = 'Image attachment review';
  const image = readFileSync(new URL('./fixtures/native-image.png', import.meta.url));
  const info = { id: 'msg_image', sessionID: seed.id, role: 'user', agent: 'build', model: { providerID: 'qa', modelID: 'native', variant: 'high' }, time: { created: Date.now() } };
  const part = { messageID: info.id, sessionID: seed.id, type: 'file', mime: 'image/png' };
  messages.set(seed.id, [{ info, parts: [
    { ...part, id: 'prt_image', filename: 'Ivaldi image preview.png', url: 'data:image/png;base64,' + image.toString('base64') },
    { ...part, id: 'prt_image_broken', filename: 'Unavailable image.png', url: 'data:image/png;base64,aW1hZ2U=' },
    { ...part, id: 'prt_image_remote', filename: 'Server file.png', url: 'file:///sdcard/Download/native-image.png' },
  ] }]);
}
const event = (type, properties) => { const data = `data: ${JSON.stringify({ directory, payload: { id: randomUUID(), type, properties } })}\n\n`; for (const response of connections) response.write(data); };
const answer = (response, value, status = 200) => { response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value)); };
async function applyNextControl(operation, response) {
  const status = failures.get(operation); const delayMs = delays.get(operation);
  failures.delete(operation); delays.delete(operation);
  if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  if (!status) return false;
  answer(response, { error: 'Requested fixture failure' }, status); return true;
}
async function body(request, limit = 30 * 1024 * 1024) { let text = ''; for await (const chunk of request) { text += chunk; if (text.length > limit) throw new Error('Fixture body too large'); } return text ? JSON.parse(text) : {}; }
const providerFixture = process.argv.includes('--providers') ? createProviderFixture({ origin: `http://127.0.0.1:${port}`, catalog: providers, answer, body, applyNextControl }) : null;
if (visual && providerFixture) { sessions.push(providerFixture.alternateSession); messages.set(providerFixture.alternateSession.id, []); }
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`); const path = url.pathname;
    if (path === '/__qa/stats') {
      const snapshot = { ...stats, settings: { defaultModel: settings.defaultModel ?? '', defaultVariant: settings.defaultVariant ?? '', defaultAgent: settings.defaultAgent ?? '', showReasoning: settings.showReasoning }, settingsStorage: storedSettings?.stats(), pendingFailures: Object.fromEntries(failures), pendingDelays: Object.fromEntries(delays), relayHandshakes: relay?.handshakes() ?? 0 };
      if (providerFixture) snapshot.providers = providerFixture.snapshot();
      return answer(response, snapshot);
    }
    if (await providerFixture?.handlePublic(request, response, url)) return;
    if (path === '/__qa/projects' && request.method === 'POST' && projectRegistry !== null) {
      const parsed = registrySchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid synthetic project registry' }, 400);
      projectRegistry = parsed.data;
      return answer(response, { count: projectRegistry.length });
    }
    if (path === '/__qa/settings-storage' && request.method === 'POST' && storedSettings) {
      const parsed = settingsStorageControl.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid Settings storage control' }, 400);
      await storedSettings.control(parsed.data.command);
      return answer(response, storedSettings.stats());
    }
    if (path === '/__qa/fail-next' && request.method === 'POST') {
      const parsed = failureSchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Unsupported fixture failure' }, 400);
      failures.set(parsed.data.operation, parsed.data.status);
      return answer(response, parsed.data);
    }
    if (path === '/__qa/delay-next' && request.method === 'POST') {
      const parsed = delaySchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Unsupported fixture delay' }, 400);
      delays.set(parsed.data.operation, parsed.data.delayMs);
      return answer(response, parsed.data);
    }
    if (path === '/__qa/update-session' && request.method === 'POST') {
      const parsed = externalSessionPatchSchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid fixture update' }, 400);
      const session = sessions.find(item => item.id === parsed.data.sessionId);
      if (!session) return answer(response, { error: 'Missing fixture session' }, 404);
      if ('title' in parsed.data.update) session.title = parsed.data.update.title;
      else session.time.archived = parsed.data.update.time.archived;
      session.time.updated = Math.max(Date.now(), session.time.updated + 1);
      event('session.updated', { info: session });
      return answer(response, { sessionId: session.id, ...parsed.data.update });
    }
    if (path === '/__qa/delete-session' && request.method === 'POST') {
      const parsed = deleteSessionSchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid fixture session' }, 400);
      const index = sessions.findIndex(session => session.id === parsed.data.sessionId);
      if (index < 0) return answer(response, { error: 'Missing fixture session' }, 404);
      const [removed] = sessions.splice(index, 1);
      messages.delete(removed.id); delete statuses[removed.id]; clearInterval(timers.get(removed.id)); timers.delete(removed.id);
      permissions = permissions.filter(item => item.sessionID !== removed.id); questions = questions.filter(item => item.sessionID !== removed.id);
      stats.lastDeletedSession = removed.id;
      if (parsed.data.emitEvent) event('session.deleted', { info: removed });
      return answer(response, { sessionId: removed.id, emitted: parsed.data.emitEvent });
    }
    if (path === '/__qa/status' && request.method === 'POST') {
      const payload = await body(request);
      if (!['idle', 'busy', 'retry'].includes(payload.type)) return answer(response, { error: 'Unsupported fixture status' }, 400);
      statuses[seed.id] = payload.type === 'retry' ? { type: 'retry', attempt: 1, message: 'The visual fixture is temporarily unavailable. Your conversation is preserved.', next: Date.now() + 5000 } : { type: payload.type };
      event('session.status', { sessionID: seed.id, status: statuses[seed.id] });
      return answer(response, { type: statuses[seed.id].type });
    }
    if (path === '/health') return answer(response, { serverId: 'ivaldi-native-qa' });
    if (path === '/api/client-auth/pairing/redeem') {
      const payload = await body(request);
      if (redeemed || payload.secret !== secret || payload.pairingId !== pairingId) return answer(response, { error: 'Invalid pairing' }, 403);
      if (await applyNextControl('pairing-redeem', response)) return;
      if (redeemed) return answer(response, { error: 'Invalid pairing' }, 403);
      redeemed = true; stats.redemptions++; return answer(response, { clientToken: token, server: { label: fixtureLabel } });
    }
    const authenticated = request.headers.authorization === `Bearer ${token}`;
    if (path === '/auth/session') {
      stats.authChecks++;
      if (await applyNextControl('auth-session', response)) return;
      return answer(response, { authenticated, disabled: false });
    }
    if (!authenticated) {
      stats.rejectedAuth++;
      const category = path === '/favicon.ico' ? 'favicon' : path === '/mobile' ? 'workspace' : path === '/api/__qa/workspace-check' ? 'workspace-check' : 'other';
      stats.rejectedAuthCategories[category]++;
      return answer(response, { error: 'Unauthorized' }, 401);
    }
    if (await providerFixture?.handle(request, response, url)) return;
    if (path === '/mobile') {
      stats.workspaceLoads++;
      if (await applyNextControl('workspace-load', response)) return;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return response.end(readFileSync(new URL('./fixtures/native-workspace.html', import.meta.url), 'utf8'));
    }
    if (path === '/api/__qa/workspace-check') { stats.workspaceChecks++; return answer(response, { connected: true }); }
    if (path === '/api/config/settings' && request.method === 'GET') {
      stats.settingsReads++;
      if (await applyNextControl('settings-read', response)) return;
      const current = storedSettings ? await storedSettings.read() : settings;
      const projects = projectRegistry ?? providerFixture?.projects();
      return answer(response, projects ? { ...current, projects } : current);
    }
    if (path === '/api/config/settings' && request.method === 'PUT') {
      const parsed = defaultsPatchSchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid fixture defaults' }, 400);
      if (await applyNextControl('settings-write', response)) return;
      if (storedSettings) {
        const committed = await storedSettings.write(parsed.data);
        for (const key of ['defaultModel', 'defaultVariant', 'defaultAgent']) {
          if (committed[key]) settings[key] = committed[key]; else delete settings[key];
        }
      } else {
        for (const key of ['defaultModel', 'defaultVariant', 'defaultAgent']) {
          if (parsed.data[key] === undefined) continue;
          if (parsed.data[key]) settings[key] = parsed.data[key]; else delete settings[key];
        }
      }
      stats.settingsWrites++;
      return answer(response, providerFixture ? { ...settings, projects: providerFixture.projects() } : settings);
    }
    if (path === '/api/global/event') {
      response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      response.write(`data: ${JSON.stringify({ directory, payload: { type: 'server.connected', properties: {} } })}\n\n`);
      connections.add(response); request.on('close', () => connections.delete(response)); return;
    }
    if (path === '/api/experimental/session') {
      stats.sessionLists++;
      const snapshot = structuredClone(providerFixture ? sessions.filter(session => providerFixture.sessionAvailable(session.id)) : sessions);
      if (await applyNextControl('session-list', response)) return;
      return answer(response, snapshot);
    }
    if (path === '/api/provider') return answer(response, providers);
    if (path === '/api/agent') return answer(response, [{ name: 'build', mode: 'primary' }, { name: 'plan', mode: 'primary' }]);
    if (path === '/api/session/status') return answer(response, statuses);
    if (path === '/api/permission') return answer(response, permissions);
    if (path === '/api/question') return answer(response, questions);
    if (path === '/api/fs/home') return answer(response, { home: 'C:/IvaldiNativeQA', dataDirectory: 'C:/IvaldiNativeQA/.config/ivaldi' });
    if (path === '/api/fs/mkdir') return answer(response, { success: true });
    if (path === '/api/session' && request.method === 'POST') {
      const parsed = sessionCreateSchema.safeParse(await body(request));
      if (!parsed.success) return answer(response, { error: 'Invalid fixture session selection' }, 400);
      stats.sessionCreates++;
      if (await applyNextControl('session-create', response)) return;
      const target = url.searchParams.get('directory');
      if (!target) return answer(response, { error: 'Fixture requires a directory query' }, 400);
      const model = parsed.data.model ?? { ...seedModel };
      const catalog = providerFixture ? providerFixture.catalog(target) : providers;
      const available = catalog.all.some(provider => provider.id === model.providerID && Object.values(provider.models).some(candidate => candidate.id === model.id && (!model.variant || Object.keys(candidate.variants ?? {}).includes(model.variant))));
      if (!available) return answer(response, { error: 'Unavailable fixture model or variant' }, 400);
      const agents = providerFixture ? providerFixture.agents(target).map(agent => agent.name) : ['build', 'plan'];
      if (parsed.data.agent && !agents.includes(parsed.data.agent)) return answer(response, { error: 'Unavailable fixture agent' }, 400);
      const session = { id: 'ses_' + randomUUID(), title: parsed.data.title ?? 'Native fixture chat', directory: target, model, agent: parsed.data.agent ?? 'build', time: { created: Date.now(), updated: Date.now() } };
      sessions.unshift(session); messages.set(session.id, []); event('session.created', { info: session }); return answer(response, session);
    }
    const approval = path.match(/^\/api\/(permission|question)\/([^/]+)\/(reply|reject)$/);
    if (approval) {
      const payload = await body(request);
      if (approval[1] === 'permission') { stats.permissionReplies.push(payload.reply); permissions = permissions.filter(item => item.id !== approval[2]); }
      else { stats.questionReplies.push(payload.answers ?? null); questions = questions.filter(item => item.id !== approval[2]); }
      event(approval[1] + '.replied', { sessionID: seed.id, requestID: approval[2] }); return answer(response, true);
    }
    const route = path.match(/^\/api\/session\/([^/]+)(?:\/(.*))?$/);
    if (route) {
      const id = route[1]; const action = route[2]; const session = sessions.find(item => item.id === id);
      if (!action && request.method === 'GET') {
        stats.sessionGets++;
        if (await applyNextControl('session-get', response)) return;
        if (providerFixture && !providerFixture.sessionAvailable(id)) return answer(response, { error: 'Synthetic session is temporarily unavailable' }, 503);
        return answer(response, session ?? { error: 'Missing session' }, session ? 200 : 404);
      }
      if (!session) return answer(response, { error: 'Missing session' }, 404);
      if (action === 'message') return answer(response, messages.get(id).slice(-Number(url.searchParams.get('limit') || 100)));
      if (action?.startsWith('message/')) { const message = messages.get(id).find(item => item.info.id === action.slice(8)); return answer(response, message ?? { error: 'Missing message' }, message ? 200 : 404); }
      if (action === 'prompt_async') {
        const payload = await body(request); const selection = promptSelectionSchema.parse(payload);
        stats.prompts++; stats.attachmentCount += payload.parts.filter(part => part.type === 'file').length;
        const model = selection.model ?? { providerID: session.model.providerID, modelID: session.model.id, variant: session.model.variant };
        const variant = selection.variant ?? model.variant;
        const agent = selection.agent ?? session.agent;
        stats.lastPrompt = { model: { providerID: model.providerID, modelID: model.modelID }, variant: variant ?? null, agent };
        const user = { info: { id: payload.messageID, sessionID: id, role: 'user', model: { ...model, variant }, agent, time: { created: Date.now() } }, parts: payload.parts.map(part => ({ ...part, id: 'prt_' + randomUUID(), messageID: payload.messageID, sessionID: id })) };
        const assistant = { info: { id: 'msg_' + randomUUID(), sessionID: id, role: 'assistant', time: { created: Date.now() } }, parts: [] };
        const part = { id: 'prt_' + randomUUID(), messageID: assistant.info.id, sessionID: id, type: 'text', text: '' }; assistant.parts.push(part);
        messages.get(id).push(user, assistant); event('message.updated', { info: user.info }); for (const part of user.parts) event('message.part.updated', { part });
        event('message.updated', { info: assistant.info }); event('message.part.updated', { part }); statuses[id] = { type: 'busy' }; event('session.status', { sessionID: id, status: statuses[id] });
        const words = 'Native streaming works. The composer stays below this answer. Drafts belong to their own conversation.'.split(' '); let index = 0;
        timers.set(id, setInterval(() => { if (index >= words.length) { clearInterval(timers.get(id)); timers.delete(id); assistant.info.time.completed = Date.now(); statuses[id] = { type: 'idle' }; event('session.status', { sessionID: id, status: statuses[id] }); return; } const delta = (index ? ' ' : '') + words[index++]; part.text += delta; event('message.part.delta', { sessionID: id, messageID: assistant.info.id, partID: part.id, field: 'text', delta }); }, 180));
        response.writeHead(204); return response.end();
      }
      if (action === 'abort') { stats.aborts++; clearInterval(timers.get(id)); timers.delete(id); statuses[id] = { type: 'idle' }; event('session.status', { sessionID: id, status: statuses[id] }); return answer(response, true); }
      if (!action && request.method === 'PATCH') {
        const parsed = sessionPatchSchema.safeParse(await body(request));
        if (!parsed.success || url.searchParams.get('directory') !== session.directory) return answer(response, { error: 'Invalid fixture session update' }, 400);
        stats.sessionUpdateAttempts++;
        if (await applyNextControl('session-update', response)) return;
        if (!sessions.includes(session)) return answer(response, { error: 'Missing session' }, 404);
        if ('title' in parsed.data) session.title = parsed.data.title;
        else session.time.archived = parsed.data.time.archived;
        session.time.updated = Math.max(Date.now(), session.time.updated + 1);
        stats.sessionUpdates++;
        stats.lastSessionUpdate = { sessionId: id, directory: session.directory, ...parsed.data };
        const snapshot = structuredClone(session);
        event('session.updated', { info: snapshot });
        if (await applyNextControl('session-update-response', response)) return;
        return answer(response, snapshot);
      }
    }
    answer(response, { error: 'Unsupported fixture route' }, 404);
  } catch { answer(response, { error: 'Fixture request failed' }, 500); }
});
server.listen(port, '127.0.0.1', async () => {
  if (!emulatorHost) await exec(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
  if (relay) await exec(adb, ['-s', serial, 'reverse', `tcp:${port + 1}`, `tcp:${port + 1}`]);
  const candidates = relay ? [{ type: 'relay', serverId: 'ivaldi-native-qa', relayUrl: `ws://127.0.0.1:${port + 1}`, hostEncPubJwk: relay.publicKey }] : [{ type: 'lan', url: `http://${emulatorHost ? '10.0.2.2' : '127.0.0.1'}:${port}`, priority: 1 }];
  const payload = { v: 2, pairingId, secret, label: relay ? 'Native Relay QA' : fixtureLabel, fingerprint: 'QA-LOCAL', expiresAt: new Date(Date.now() + 600000).toISOString(), candidates };
  const link = `ivaldi-native://connect?v=2&p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  await exec(adb, ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, '-p', 'dev.ivaldi.nativecomparison']);
  console.log(`${fixtureLabel} fixture ready. Confirm it on the device. Pairing credentials remain in memory.`);
});
process.on('SIGINT', () => { for (const timer of timers.values()) clearInterval(timer); for (const response of connections) response.end(); relay?.close(); server.close(() => { void storedSettings?.close(); }); });
