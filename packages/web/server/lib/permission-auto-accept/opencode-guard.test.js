import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

import { createOpenCodePermissionGuard } from './opencode-guard.js';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

const rule = (permission, pattern, action) => ({ permission, pattern, action });

// OpenCode's own defaults, trimmed to the rules that matter here.
const DEFAULTS = [
  rule('*', '*', 'allow'),
  rule('doom_loop', '*', 'ask'),
  rule('external_directory', '*', 'ask'),
  rule('read', '*.env', 'ask'),
];
const BUILD = [...DEFAULTS];
const PLAN = [...DEFAULTS, rule('edit', '*', 'deny'), rule('edit', '.opencode/plans/*.md', 'allow')];
const EXPLORE = [...DEFAULTS, rule('*', '*', 'deny'), rule('grep', '*', 'allow'), rule('read', '*', 'allow'), rule('bash', '*', 'allow')];
const AGENTS = [
  { name: 'build', permission: BUILD },
  { name: 'plan', permission: PLAN },
  { name: 'explore', permission: EXPLORE },
];

// Mirrors OpenCode's Wildcard.match and Permission.evaluate.
const wildcardMatch = (input, pattern) => {
  let escaped = pattern.replaceAll('\\', '/').replace(/[.+^$|{}()[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  if (escaped.endsWith(' .*')) escaped = `${escaped.slice(0, -3)}( .*)?`;
  return new RegExp(`^${escaped}$`, process.platform === 'win32' ? 'si' : 's').test(input.replaceAll('\\', '/'));
};
const evaluate = (rules, permission, pattern) => (
  rules.findLast((item) => wildcardMatch(permission, item.permission) && wildcardMatch(pattern, item.pattern))?.action ?? 'ask'
);

const loadPlugin = async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ivaldi-permission-guard-'));
  temporaryDirectories.push(dataDir);
  const guard = createOpenCodePermissionGuard({ fsPromises: fs, path, dataDir });
  await guard.prepareManagedOpenCodeEnv('{}');
  const pluginPath = path.join(dataDir, 'permission-guard', 'ivaldi-permission-guard-plugin.js');
  const pluginModule = await import(`${pathToFileURL(pluginPath).href}?test=${Date.now()}-${Math.random()}`);
  return pluginModule.IvaldiPermissionGuardPlugin;
};

// A fake OpenCode that keeps one session and appends rules on update, as
// PATCH /session/:id does.
const createOpenCode = ({ sessionRules = [], agents = AGENTS, overrides = {} } = {}) => {
  const state = { sessionRules: [...sessionRules], updates: 0 };
  const client = {
    app: { agents: overrides.agents ?? (async () => ({ data: agents })) },
    session: {
      get: overrides.get ?? (async ({ path: { id } }) => ({ data: { id, permission: state.sessionRules } })),
      update: overrides.update ?? (async ({ body }) => {
        state.updates += 1;
        state.sessionRules = [...state.sessionRules, ...body.permission];
        return { data: {} };
      }),
    },
  };
  return { client, state };
};

const sendMessage = async (Plugin, client, agent) => {
  const hooks = await Plugin({ client });
  await hooks['chat.message']({ sessionID: 'session-1', agent }, { message: { agent }, parts: [] });
};

describe('OpenCode permission guard', () => {
  it('injects the plugin after existing plugins and keeps the rest of the config', async () => {
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ivaldi-permission-guard-'));
    temporaryDirectories.push(dataDir);
    const guard = createOpenCodePermissionGuard({ fsPromises: fs, path, dataDir });
    const pluginUrl = pathToFileURL(path.join(dataDir, 'permission-guard', 'ivaldi-permission-guard-plugin.js')).href;

    const prepared = await guard.prepareManagedOpenCodeEnv(`{ "plugin": ["file:///existing.js", "${pluginUrl}"], "model": "test/model", }`);
    const config = JSON.parse(prepared.OPENCODE_CONFIG_CONTENT);

    expect(config.model).toBe('test/model');
    expect(config.plugin).toEqual(['file:///existing.js', pluginUrl]);
    await expect(guard.prepareManagedOpenCodeEnv('{ "plugin": "one.js" }')).rejects.toThrow('plugin must be an array');
    await expect(guard.prepareManagedOpenCodeEnv('not json')).rejects.toThrow('valid JSON object');
  });

  it('makes the build agent ask before edits and shell commands and leaves other tools alone', async () => {
    const Plugin = await loadPlugin();
    const { client, state } = createOpenCode();

    await sendMessage(Plugin, client, 'build');
    const rules = [...BUILD, ...state.sessionRules];

    expect(evaluate(rules, 'edit', 'src/app.ts')).toBe('ask');
    expect(evaluate(rules, 'bash', 'git status')).toBe('ask');
    expect(evaluate(rules, 'read', 'src/app.ts')).toBe('allow');
    expect(evaluate(rules, 'grep', '*')).toBe('allow');
  });

  it('keeps every deny the agent and the session already had', async () => {
    const Plugin = await loadPlugin();
    const { client, state } = createOpenCode({ sessionRules: [rule('bash', 'rm *', 'deny')] });

    await sendMessage(Plugin, client, 'plan');
    const planRules = [...PLAN, ...state.sessionRules];
    expect(evaluate(planRules, 'edit', 'src/app.ts')).toBe('deny');
    expect(evaluate(planRules, 'edit', '.opencode/plans/next.md')).toBe('ask');
    expect(evaluate(planRules, 'bash', 'rm -rf build')).toBe('deny');
    expect(evaluate(planRules, 'bash', 'ls')).toBe('ask');

    await sendMessage(Plugin, client, 'explore');
    const exploreRules = [...EXPLORE, ...state.sessionRules];
    expect(evaluate(exploreRules, 'edit', 'src/app.ts')).toBe('deny');
    expect(evaluate(exploreRules, 'bash', 'ls')).toBe('ask');
    expect(evaluate(exploreRules, 'bash', 'rm -rf build')).toBe('deny');
  });

  it('writes nothing when the newest block already matches', async () => {
    const Plugin = await loadPlugin();
    const { client, state } = createOpenCode();

    await sendMessage(Plugin, client, 'build');
    await sendMessage(Plugin, client, 'build');
    expect(state.updates).toBe(1);

    await sendMessage(Plugin, client, 'plan');
    await sendMessage(Plugin, client, 'build');
    expect(state.updates).toBe(3);
    expect(evaluate([...BUILD, ...state.sessionRules], 'edit', 'src/app.ts')).toBe('ask');
  });

  it('rebuilds a subagent block from its own agent, not the inherited one', async () => {
    const Plugin = await loadPlugin();
    const parent = createOpenCode();
    await sendMessage(Plugin, parent.client, 'plan');
    // A subagent inherits only the parent's deny rules, then gets its own.
    const inherited = [...parent.state.sessionRules.filter((item) => item.action === 'deny'), rule('todowrite', '*', 'deny')];

    const child = createOpenCode({ sessionRules: inherited });
    await sendMessage(Plugin, child.client, 'build');
    const childRules = [...BUILD, ...child.state.sessionRules];

    expect(evaluate(childRules, 'edit', 'src/app.ts')).toBe('ask');
    expect(evaluate(childRules, 'todowrite', '*')).toBe('deny');
  });

  it('writes nothing and never throws when the rules cannot be read or saved', async () => {
    const Plugin = await loadPlugin();
    const cases = [
      { agents: async () => { throw new Error('offline'); } },
      { agents: async () => ({ error: { message: 'unauthorized' } }) },
      { get: async () => ({ error: { message: 'not found' } }) },
      { update: async () => { throw new Error('offline'); } },
    ];
    for (const overrides of cases) {
      const { client, state } = createOpenCode({ overrides });
      await expect(sendMessage(Plugin, client, 'build')).resolves.toBeUndefined();
      expect(state.sessionRules).toEqual([]);
    }

    const unknownAgent = createOpenCode();
    await sendMessage(Plugin, unknownAgent.client, 'missing');
    expect(unknownAgent.state.updates).toBe(0);
  });
});
