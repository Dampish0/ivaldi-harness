import { z } from 'zod';

const sessionSchema = z.object({
  id: z.string().optional(),
  parentID: z.string().nullable().optional(),
  directory: z.string().optional(),
}).passthrough();

const sessionCreatedSchema = z.object({
  type: z.literal('session.created'),
  properties: z.object({
    sessionID: z.string().min(1),
    info: sessionSchema,
  }),
}).passthrough();

const sessionDeletedSchema = z.object({
  type: z.literal('session.deleted'),
  properties: z.object({
    sessionID: z.string().min(1),
    info: sessionSchema,
  }),
}).passthrough();

const providerSchema = z.object({
  executed: z.boolean(),
}).passthrough();

const toolCalledSchema = z.object({
  type: z.literal('session.next.tool.called'),
  properties: z.object({
    timestamp: z.number(),
    sessionID: z.string().min(1),
    assistantMessageID: z.string().min(1),
    callID: z.string().min(1),
    tool: z.string().min(1),
    input: z.record(z.string(), z.unknown()),
    provider: providerSchema,
  }),
}).passthrough();

const toolSuccessSchema = z.object({
  type: z.literal('session.next.tool.success'),
  properties: z.object({
    timestamp: z.number(),
    sessionID: z.string().min(1),
    assistantMessageID: z.string().min(1),
    callID: z.string().min(1),
    structured: z.record(z.string(), z.unknown()),
    content: z.array(z.unknown()),
    outputPaths: z.array(z.string()).optional(),
    result: z.unknown().optional(),
    provider: providerSchema,
  }),
}).passthrough();

const toolFailedSchema = z.object({
  type: z.literal('session.next.tool.failed'),
  properties: z.object({
    timestamp: z.number(),
    sessionID: z.string().min(1),
    assistantMessageID: z.string().min(1),
    callID: z.string().min(1),
    error: z.unknown(),
    result: z.unknown().optional(),
    provider: providerSchema,
  }),
}).passthrough();

const permissionAskedSchema = z.object({
  type: z.literal('permission.asked'),
  properties: z.object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    permission: z.string(),
    patterns: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()),
    always: z.array(z.string()),
    tool: z.object({
      messageID: z.string(),
      callID: z.string(),
    }).optional(),
  }),
}).passthrough();

const permissionV2AskedSchema = z.object({
  type: z.literal('permission.v2.asked'),
  properties: z.object({
    id: z.string().min(1),
    sessionID: z.string().min(1),
    action: z.string(),
    resources: z.array(z.string()),
    save: z.array(z.string()).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    source: z.object({
      type: z.literal('tool'),
      messageID: z.string(),
      callID: z.string(),
    }).optional(),
  }),
}).passthrough();

const permissionRepliedSchema = z.object({
  type: z.literal('permission.replied'),
  properties: z.object({
    sessionID: z.string().min(1),
    requestID: z.string().min(1),
    reply: z.enum(['once', 'always', 'reject']),
  }),
}).passthrough();

const permissionV2RepliedSchema = z.object({
  type: z.literal('permission.v2.replied'),
  properties: z.object({
    sessionID: z.string().min(1),
    requestID: z.string().min(1),
    reply: z.enum(['once', 'always', 'reject']),
  }),
}).passthrough();

const compactionStartedSchema = z.object({
  type: z.literal('session.next.compaction.started'),
  properties: z.object({
    timestamp: z.number(),
    sessionID: z.string().min(1),
    messageID: z.string().min(1),
    reason: z.enum(['auto', 'manual']),
  }),
}).passthrough();

const supportedSourceEventSchema = z.discriminatedUnion('type', [
  sessionCreatedSchema,
  sessionDeletedSchema,
  toolCalledSchema,
  toolSuccessSchema,
  toolFailedSchema,
  permissionAskedSchema,
  permissionV2AskedSchema,
  permissionRepliedSchema,
  permissionV2RepliedSchema,
  compactionStartedSchema,
]);

const eventEnvelopeSchema = z.object({
  directory: z.string().optional(),
  payload: z.union([
    supportedSourceEventSchema,
    z.object({ payload: supportedSourceEventSchema }).passthrough(),
  ]),
}).passthrough();

const normalizeDirectory = (envelopeDirectory, eventDirectory) => {
  if (envelopeDirectory && envelopeDirectory !== 'global') return envelopeDirectory;
  return eventDirectory || null;
};

const callKey = (sessionID, callID) => `${sessionID}:${callID}`;

export const createOpenCodeLifecycleEventAdapter = ({ maxTrackedToolCalls = 2048 } = {}) => {
  const toolCalls = new Map();

  const rememberToolCall = (properties, directory) => {
    const key = callKey(properties.sessionID, properties.callID);
    toolCalls.delete(key);
    toolCalls.set(key, {
      tool: properties.tool,
      input: properties.input,
      directory,
    });
    while (toolCalls.size > maxTrackedToolCalls) {
      const oldest = toolCalls.keys().next().value;
      if (!oldest) break;
      toolCalls.delete(oldest);
    }
  };

  const takeToolCall = (properties) => {
    const key = callKey(properties.sessionID, properties.callID);
    const remembered = toolCalls.get(key) ?? null;
    toolCalls.delete(key);
    return remembered;
  };

  const map = (candidate) => {
    const envelope = eventEnvelopeSchema.safeParse(candidate);
    if (!envelope.success) return [];

    const source = 'payload' in envelope.data.payload
      ? envelope.data.payload.payload
      : envelope.data.payload;
    const sourceSession = source.type === 'session.created' || source.type === 'session.deleted'
      ? source.properties.info
      : null;
    const directory = normalizeDirectory(envelope.data.directory, sourceSession?.directory);

    switch (source.type) {
      case 'session.created': {
        if (source.properties.info.parentID) return [];
        return [{
          event: 'ChatStart',
          sessionId: source.properties.sessionID,
          directory,
          session: source.properties.info,
        }];
      }
      case 'session.deleted':
        if (source.properties.info.parentID) return [];
        return [{
          event: 'ChatEnd',
          sessionId: source.properties.sessionID,
          directory,
          session: source.properties.info,
        }];
      case 'session.next.tool.called': {
        rememberToolCall(source.properties, directory);
        const tool = {
          callID: source.properties.callID,
          assistantMessageID: source.properties.assistantMessageID,
          name: source.properties.tool,
          input: source.properties.input,
          provider: source.properties.provider,
          timestamp: source.properties.timestamp,
        };
        const payloads = [{
          event: 'BeforeToolCall',
          sessionId: source.properties.sessionID,
          directory,
          tool,
        }];
        if (source.properties.tool === 'task') {
          payloads.push({
            event: 'BeforeAgentSpawn',
            sessionId: source.properties.sessionID,
            directory,
            agent: tool,
          });
          payloads.push({
            event: 'TaskCreated',
            sessionId: source.properties.sessionID,
            directory,
            task: tool,
          });
        }
        return payloads;
      }
      case 'session.next.tool.success':
      case 'session.next.tool.failed': {
        const remembered = takeToolCall(source.properties);
        const status = source.type === 'session.next.tool.success' ? 'success' : 'failed';
        const resolvedDirectory = directory ?? remembered?.directory ?? null;
        const tool = {
          ...source.properties,
          name: remembered?.tool ?? null,
          input: remembered?.input,
          status,
        };
        const payloads = [{
          event: status === 'success' ? 'AfterToolCall' : 'ToolCallFailed',
          sessionId: source.properties.sessionID,
          directory: resolvedDirectory,
          tool,
        }];
        if (remembered?.tool === 'task') {
          const agent = {
            callID: source.properties.callID,
            assistantMessageID: source.properties.assistantMessageID,
            input: remembered.input,
            status,
            result: source.properties.result,
            error: status === 'failed' ? source.properties.error : undefined,
            timestamp: source.properties.timestamp,
          };
          payloads.push({
            event: 'AfterAgentReturn',
            sessionId: source.properties.sessionID,
            directory: resolvedDirectory,
            agent,
          });
          payloads.push({
            event: 'TaskCompleted',
            sessionId: source.properties.sessionID,
            directory: resolvedDirectory,
            task: agent,
          });
        }
        return payloads;
      }
      case 'permission.asked':
      case 'permission.v2.asked':
        return [{
          event: 'PermissionRequest',
          sessionId: source.properties.sessionID,
          directory,
          request: source.properties,
        }];
      case 'permission.replied':
      case 'permission.v2.replied':
        if (source.properties.reply !== 'reject') return [];
        return [{
          event: 'PermissionDenied',
          sessionId: source.properties.sessionID,
          directory,
          request: {
            requestID: source.properties.requestID,
            reply: source.properties.reply,
          },
        }];
      case 'session.next.compaction.started':
        return [{
          event: 'BeforeCompact',
          sessionId: source.properties.sessionID,
          directory,
          compaction: {
            messageID: source.properties.messageID,
            reason: source.properties.reason,
            timestamp: source.properties.timestamp,
          },
        }];
      default:
        return [];
    }
  };

  return { map };
};
