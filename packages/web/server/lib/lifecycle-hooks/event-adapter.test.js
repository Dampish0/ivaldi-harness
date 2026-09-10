import { describe, expect, it } from 'vitest';

import { createOpenCodeLifecycleEventAdapter } from './event-adapter.js';

const createAdapter = () => createOpenCodeLifecycleEventAdapter();

describe('lifecycle hook OpenCode event adapter', () => {
  it('maps root session creation to ChatStart and ignores child session creation', () => {
    const adapter = createAdapter();

    expect(adapter.map({
      directory: 'global',
      payload: {
        type: 'session.created',
        properties: {
          sessionID: 'ses_root',
          info: { id: 'ses_root', directory: '/repo/app', title: 'New chat' },
        },
      },
    })).toEqual([{
      event: 'ChatStart',
      sessionId: 'ses_root',
      directory: '/repo/app',
      session: { id: 'ses_root', directory: '/repo/app', title: 'New chat' },
    }]);

    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.created',
        properties: {
          sessionID: 'ses_child',
          info: { id: 'ses_child', parentID: 'ses_root', directory: '/repo/app', title: 'Research' },
        },
      },
    })).toEqual([]);
  });

  it('maps root session deletion to ChatEnd and ignores child deletion', () => {
    const adapter = createAdapter();

    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.deleted',
        properties: {
          sessionID: 'ses_root',
          info: { id: 'ses_root', directory: '/repo/app' },
        },
      },
    })).toEqual([{
      event: 'ChatEnd',
      sessionId: 'ses_root',
      directory: '/repo/app',
      session: { id: 'ses_root', directory: '/repo/app' },
    }]);

    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.deleted',
        properties: {
          sessionID: 'ses_child',
          info: { id: 'ses_child', parentID: 'ses_root', directory: '/repo/app' },
        },
      },
    })).toEqual([]);
  });

  it('maps authoritative tool call and success events with call correlation', () => {
    const adapter = createAdapter();
    const called = adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.called',
        properties: {
          timestamp: 10,
          sessionID: 'ses_1',
          assistantMessageID: 'msg_1',
          callID: 'call_1',
          tool: 'bash',
          input: { command: 'git status' },
          provider: { executed: false },
        },
      },
    });
    expect(called).toEqual([{
      event: 'BeforeToolCall',
      sessionId: 'ses_1',
      directory: '/repo/app',
      tool: {
        callID: 'call_1',
        assistantMessageID: 'msg_1',
        name: 'bash',
        input: { command: 'git status' },
        provider: { executed: false },
        timestamp: 10,
      },
    }]);

    const succeeded = adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.success',
        properties: {
          timestamp: 20,
          sessionID: 'ses_1',
          assistantMessageID: 'msg_1',
          callID: 'call_1',
          structured: {},
          content: [],
          result: { exitCode: 0 },
          provider: { executed: false },
        },
      },
    });
    expect(succeeded).toHaveLength(1);
    expect(succeeded[0]).toMatchObject({
      event: 'AfterToolCall',
      sessionId: 'ses_1',
      tool: {
        callID: 'call_1',
        name: 'bash',
        input: { command: 'git status' },
        status: 'success',
      },
    });
  });

  it('maps tool failures and does not require prior correlation for the generic failure event', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.failed',
        properties: {
          timestamp: 20,
          sessionID: 'ses_1',
          assistantMessageID: 'msg_1',
          callID: 'call_missing',
          error: { name: 'UnknownError', message: 'failed' },
          provider: { executed: false },
        },
      },
    })).toEqual([{
      event: 'ToolCallFailed',
      sessionId: 'ses_1',
      directory: '/repo/app',
      tool: {
        timestamp: 20,
        sessionID: 'ses_1',
        assistantMessageID: 'msg_1',
        callID: 'call_missing',
        error: { name: 'UnknownError', message: 'failed' },
        provider: { executed: false },
        name: null,
        input: undefined,
        status: 'failed',
      },
    }]);
  });

  it('maps task tool lifecycle to agent spawn, return, and task completion', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.called',
        properties: {
          timestamp: 10,
          sessionID: 'ses_parent',
          assistantMessageID: 'msg_1',
          callID: 'call_task',
          tool: 'task',
          input: { description: 'Inspect tests', subagent_type: 'research' },
          provider: { executed: false },
        },
      },
    }).map((payload) => payload.event)).toEqual(['BeforeToolCall', 'BeforeAgentSpawn', 'TaskCreated']);

    const terminal = adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.success',
        properties: {
          timestamp: 30,
          sessionID: 'ses_parent',
          assistantMessageID: 'msg_1',
          callID: 'call_task',
          structured: {},
          content: [],
          result: { sessionId: 'ses_child' },
          provider: { executed: false },
        },
      },
    });
    expect(terminal.map((payload) => payload.event)).toEqual(['AfterToolCall', 'AfterAgentReturn', 'TaskCompleted']);
    expect(terminal[1]).toMatchObject({
      agent: {
        callID: 'call_task',
        input: { description: 'Inspect tests', subagent_type: 'research' },
        status: 'success',
      },
    });
  });

  it('bounds remembered tool calls and drops the oldest correlation', () => {
    const adapter = createOpenCodeLifecycleEventAdapter({ maxTrackedToolCalls: 1 });
    const call = (callID, tool) => adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.called',
        properties: {
          timestamp: 10,
          sessionID: 'ses_1',
          assistantMessageID: 'msg_1',
          callID,
          tool,
          input: {},
          provider: { executed: false },
        },
      },
    });
    call('call_1', 'task');
    call('call_2', 'bash');

    const terminal = adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.tool.success',
        properties: {
          timestamp: 20,
          sessionID: 'ses_1',
          assistantMessageID: 'msg_1',
          callID: 'call_1',
          structured: {},
          content: [],
          provider: { executed: false },
        },
      },
    });
    expect(terminal.map((payload) => payload.event)).toEqual(['AfterToolCall']);
    expect(terminal[0].tool.name).toBeNull();
  });

  it('maps both permission event generations to PermissionRequest', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        payload: {
          type: 'permission.asked',
          properties: {
            id: 'perm_1',
            sessionID: 'ses_1',
            permission: 'bash',
            patterns: ['git status'],
            metadata: {},
            always: [],
          },
        },
      },
    })[0]).toMatchObject({
      event: 'PermissionRequest',
      sessionId: 'ses_1',
      request: { id: 'perm_1', permission: 'bash' },
    });

    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'permission.v2.asked',
        properties: {
          id: 'perm_2',
          sessionID: 'ses_1',
          action: 'write',
          resources: ['/repo/app/file.ts'],
        },
      },
    })[0]).toMatchObject({
      event: 'PermissionRequest',
      request: { id: 'perm_2', action: 'write' },
    });
  });

  it('only maps rejected permission replies to PermissionDenied', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'permission.replied',
        properties: { sessionID: 'ses_1', requestID: 'perm_1', reply: 'once' },
      },
    })).toEqual([]);

    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'permission.v2.replied',
        properties: { sessionID: 'ses_1', requestID: 'perm_2', reply: 'reject' },
      },
    })).toEqual([{
      event: 'PermissionDenied',
      sessionId: 'ses_1',
      directory: '/repo/app',
      request: { requestID: 'perm_2', reply: 'reject' },
    }]);
  });

  it('maps the authoritative compaction-start event to BeforeCompact', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: {
        type: 'session.next.compaction.started',
        properties: {
          timestamp: 42,
          sessionID: 'ses_1',
          messageID: 'msg_1',
          reason: 'auto',
        },
      },
    })).toEqual([{
      event: 'BeforeCompact',
      sessionId: 'ses_1',
      directory: '/repo/app',
      compaction: { messageID: 'msg_1', reason: 'auto', timestamp: 42 },
    }]);
  });

  it('ignores unrelated and malformed events', () => {
    const adapter = createAdapter();
    expect(adapter.map({
      directory: '/repo/app',
      payload: { type: 'session.status', properties: { sessionID: 'ses_1' } },
    })).toEqual([]);
    expect(adapter.map({ payload: { type: 'session.created', properties: {} } })).toEqual([]);
  });
});
