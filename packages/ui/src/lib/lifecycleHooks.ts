import { z } from 'zod';

import { runtimeFetch } from '@/lib/runtime-fetch';

const lifecycleHookEventSchema = z.enum([
  'UserPromptSubmit',
  'ChatStart',
  'BeforeToolCall',
  'AfterToolCall',
  'ToolCallFailed',
  'PermissionRequest',
  'PermissionDenied',
  'BeforeAgentSpawn',
  'AfterAgentReturn',
  'TaskCreated',
  'TaskCompleted',
  'WorktreeCreate',
  'WorktreeRemove',
  'BeforeCompact',
  'ChatEnd',
  'Notification',
]);

const lifecycleHookSchema = z.object({
  id: z.string(),
  event: lifecycleHookEventSchema,
  command: z.array(z.string()).min(1),
  enabled: z.boolean(),
  timeoutMs: z.number().int(),
  failureMode: z.enum(['warn', 'block']),
});

const lifecycleExecutionSchema = z.object({
  hookId: z.string(),
  event: lifecycleHookEventSchema,
  ok: z.boolean(),
  kind: z.string().optional(),
  error: z.string().optional(),
  code: z.number().nullable().optional(),
  signal: z.string().nullable().optional(),
  startedAt: z.number(),
  durationMs: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  stdoutTruncated: z.boolean(),
  stderrTruncated: z.boolean(),
  source: z.enum(['event', 'test']),
  sessionId: z.string().nullable(),
  directory: z.string().nullable(),
});

const lifecycleHooksSnapshotSchema = z.object({
  hooks: z.array(lifecycleHookSchema),
  recentExecutions: z.array(lifecycleExecutionSchema),
  supportedEvents: z.array(lifecycleHookEventSchema),
  blockingEvents: z.array(lifecycleHookEventSchema).default(['UserPromptSubmit']),
  failureModes: z.array(z.enum(['warn', 'block'])),
});

const lifecycleHooksSaveResponseSchema = z.object({
  success: z.literal(true),
  hooks: z.array(lifecycleHookSchema),
});

const lifecycleHookTestResponseSchema = z.object({
  success: z.literal(true),
  result: lifecycleExecutionSchema.omit({ source: true, sessionId: true, directory: true }).extend({
    source: z.enum(['event', 'test']).optional(),
    sessionId: z.string().nullable().optional(),
    directory: z.string().nullable().optional(),
  }),
});

const errorResponseSchema = z.object({
  error: z.string().optional(),
});

export type LifecycleHook = z.infer<typeof lifecycleHookSchema>;
export type LifecycleHookEvent = z.infer<typeof lifecycleHookEventSchema>;
export type LifecycleExecution = z.infer<typeof lifecycleExecutionSchema>;
type LifecycleHooksSnapshot = z.infer<typeof lifecycleHooksSnapshotSchema>;

const readFailureMessage = async (response: Response, fallback: string): Promise<string> => {
  const payload = errorResponseSchema.safeParse(await response.json().catch(() => null));
  return payload.success && payload.data.error ? payload.data.error : fallback;
};

export const fetchLifecycleHooks = async (): Promise<LifecycleHooksSnapshot> => {
  const response = await runtimeFetch('/api/lifecycle-hooks');
  if (!response.ok) {
    throw new Error(await readFailureMessage(response, 'Failed to load lifecycle hooks'));
  }
  return lifecycleHooksSnapshotSchema.parse(await response.json());
};

export const saveLifecycleHooks = async (hooks: LifecycleHook[]): Promise<LifecycleHook[]> => {
  const response = await runtimeFetch('/api/lifecycle-hooks', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hooks }),
  });
  if (!response.ok) {
    throw new Error(await readFailureMessage(response, 'Failed to save lifecycle hooks'));
  }
  return lifecycleHooksSaveResponseSchema.parse(await response.json()).hooks;
};

export const testLifecycleHook = async (hook: LifecycleHook): Promise<LifecycleExecution> => {
  const response = await runtimeFetch('/api/lifecycle-hooks/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook }),
  });
  if (!response.ok) {
    throw new Error(await readFailureMessage(response, 'Failed to test lifecycle hook'));
  }
  const parsed = lifecycleHookTestResponseSchema.parse(await response.json()).result;
  return lifecycleExecutionSchema.parse({
    ...parsed,
    source: parsed.source ?? 'test',
    sessionId: parsed.sessionId ?? 'lifecycle-hook-test',
    directory: parsed.directory ?? null,
  });
};
