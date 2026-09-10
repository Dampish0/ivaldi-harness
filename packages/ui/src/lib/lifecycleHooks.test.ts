import { afterEach, describe, expect, test } from 'bun:test';

import {
  fetchLifecycleHooks,
  saveLifecycleHooks,
  testLifecycleHook,
  type LifecycleHook,
} from './lifecycleHooks';
import { configureRuntimeUrlResolver, getRuntimeUrlResolver, setRuntimeUrlResolver } from './runtime-url';

const originalFetch = globalThis.fetch;
const originalResolver = getRuntimeUrlResolver();

const hook: LifecycleHook = {
  id: 'check-prompt',
  event: 'UserPromptSubmit',
  command: ['node', 'hook.mjs'],
  enabled: true,
  timeoutMs: 5000,
  failureMode: 'block',
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  setRuntimeUrlResolver(originalResolver);
});

describe('lifecycle hook API', () => {
  test('loads and parses the server snapshot through the active runtime', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://runtime.example' });
    let requestedUrl = '';
    globalThis.fetch = async (input) => {
      requestedUrl = input.toString();
      return Response.json({
        hooks: [hook],
        recentExecutions: [],
        supportedEvents: ['UserPromptSubmit', 'ChatStart', 'BeforeToolCall', 'TaskCompleted', 'WorktreeCreate', 'Notification'],
        blockingEvents: ['UserPromptSubmit'],
        failureModes: ['warn', 'block'],
      });
    };

    expect(await fetchLifecycleHooks()).toEqual({
      hooks: [hook],
      recentExecutions: [],
      supportedEvents: ['UserPromptSubmit', 'ChatStart', 'BeforeToolCall', 'TaskCompleted', 'WorktreeCreate', 'Notification'],
      blockingEvents: ['UserPromptSubmit'],
      failureModes: ['warn', 'block'],
    });
    expect(requestedUrl).toBe('https://runtime.example/api/lifecycle-hooks');
  });

  test('persists the complete ordered hook list with JSON request fidelity', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://runtime.example' });
    const requests: Array<{ url: string; method: string; contentType: string | null; body: unknown }> = [];
    globalThis.fetch = async (input, init) => {
      const request = new Request(input, init);
      requests.push({
        url: request.url,
        method: request.method,
        contentType: request.headers.get('content-type'),
        body: await request.clone().json(),
      });
      return Response.json({ success: true, hooks: [hook] });
    };

    expect(await saveLifecycleHooks([hook])).toEqual([hook]);
    expect(requests).toEqual([{
      url: 'https://runtime.example/api/lifecycle-hooks',
      method: 'PUT',
      contentType: 'application/json',
      body: { hooks: [hook] },
    }]);
  });

  test('normalizes a dry-run result into the recent-execution contract', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://runtime.example' });
    globalThis.fetch = async () => Response.json({
      success: true,
      result: {
        hookId: hook.id,
        event: hook.event,
        ok: true,
        code: 0,
        signal: null,
        startedAt: 123,
        durationMs: 4,
        stdout: 'ok',
        stderr: '',
        stdoutTruncated: false,
        stderrTruncated: false,
      },
    });

    expect(await testLifecycleHook(hook)).toEqual({
      hookId: hook.id,
      event: hook.event,
      source: 'test',
      sessionId: 'lifecycle-hook-test',
      directory: null,
      ok: true,
      code: 0,
      signal: null,
      startedAt: 123,
      durationMs: 4,
      stdout: 'ok',
      stderr: '',
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  });

  test('rejects malformed server responses instead of treating them as empty state', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://runtime.example' });
    globalThis.fetch = async () => Response.json({ hooks: 'invalid' });

    await expect(fetchLifecycleHooks()).rejects.toThrow();
  });

  test('keeps compatibility with servers that predate blocking event metadata', async () => {
    configureRuntimeUrlResolver({ apiBaseUrl: 'https://runtime.example' });
    globalThis.fetch = async () => Response.json({
      hooks: [hook],
      recentExecutions: [],
      supportedEvents: ['UserPromptSubmit'],
      failureModes: ['warn', 'block'],
    });

    expect((await fetchLifecycleHooks()).blockingEvents).toEqual(['UserPromptSubmit']);
  });
});
