import { z } from 'zod';

export const LIFECYCLE_HOOK_EVENTS = [
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
];
export const LIFECYCLE_HOOK_BLOCKING_EVENTS = ['UserPromptSubmit'];
export const LIFECYCLE_HOOK_FAILURE_MODES = ['warn', 'block'];

const blockingEvents = new Set(LIFECYCLE_HOOK_BLOCKING_EVENTS);

const MAX_HOOKS = 32;
const MAX_ID_LENGTH = 120;
const MAX_COMMAND_PARTS = 32;
const MAX_COMMAND_PART_LENGTH = 4096;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_TIMEOUT_MS = 10_000;
const HOOK_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

const commandPartSchema = z.string()
  .max(MAX_COMMAND_PART_LENGTH)
  .refine((value) => !value.includes('\0'), 'Command arguments cannot contain NUL bytes');

const lifecycleHookSchema = z.object({
  id: z.string().trim().min(1).max(MAX_ID_LENGTH).regex(HOOK_ID_PATTERN),
  event: z.enum(LIFECYCLE_HOOK_EVENTS),
  command: z.array(commandPartSchema)
    .min(1)
    .max(MAX_COMMAND_PARTS)
    .refine((command) => command[0].trim().length > 0, 'Hook executable is required')
    .transform((command) => [command[0].trim(), ...command.slice(1)]),
  enabled: z.boolean().default(true),
  timeoutMs: z.number().int().safe().min(MIN_TIMEOUT_MS).max(MAX_TIMEOUT_MS).default(DEFAULT_TIMEOUT_MS),
  failureMode: z.enum(LIFECYCLE_HOOK_FAILURE_MODES).default('warn'),
}).superRefine((hook, context) => {
  if (hook.failureMode !== 'block' || blockingEvents.has(hook.event)) return;
  context.addIssue({
    code: 'custom',
    path: ['failureMode'],
    message: 'Block failure mode is not supported for this lifecycle event',
  });
});

export const lifecycleHookEventPayloadSchema = z.object({
  event: z.enum(LIFECYCLE_HOOK_EVENTS),
  sessionId: z.string().optional(),
  directory: z.string().nullable().optional(),
  message: z.unknown().optional(),
  session: z.unknown().optional(),
  tool: z.unknown().optional(),
  request: z.unknown().optional(),
  agent: z.unknown().optional(),
  task: z.unknown().optional(),
  worktree: z.unknown().optional(),
  compaction: z.unknown().optional(),
  notification: z.unknown().optional(),
});

const FIELD_ERROR_CODES = {
  id: 'INVALID_ID',
  event: 'INVALID_EVENT',
  command: 'INVALID_COMMAND',
  enabled: 'INVALID_ENABLED',
  timeoutMs: 'INVALID_TIMEOUT',
  failureMode: 'INVALID_FAILURE_MODE',
};

const FIELD_ERROR_MESSAGES = {
  id: 'Hook ID must use only letters, numbers, dot, underscore, or dash',
  event: 'Unsupported lifecycle hook event',
  command: 'Hook command must be a safe argv array',
  enabled: 'Hook enabled must be a boolean',
  timeoutMs: `Hook timeout must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} ms`,
  failureMode: 'Hook failure mode must be warn, or block on an event that supports blocking',
};

const validationIssueFromZod = (error) => {
  const issue = error.issues[0];
  const field = issue?.path?.[0];
  if (field && Object.hasOwn(FIELD_ERROR_CODES, field)) {
    return {
      code: FIELD_ERROR_CODES[field],
      error: FIELD_ERROR_MESSAGES[field],
    };
  }
  return { code: 'INVALID_HOOK', error: 'Hook must be an object' };
};

const normalizeLifecycleHook = (candidate, ids = new Set()) => {
  const parsed = lifecycleHookSchema.safeParse(candidate);
  if (!parsed.success) return { hook: null, ...validationIssueFromZod(parsed.error) };
  const hook = parsed.data;

  if (ids.has(hook.id)) {
    return { hook: null, code: 'DUPLICATE_ID', error: `Hook ID "${hook.id}" is duplicated` };
  }
  ids.add(hook.id);
  return {
    hook,
    code: null,
    error: null,
  };
};

export const sanitizeLifecycleHooks = (value) => {
  if (!Array.isArray(value)) return null;

  const hooks = [];
  const ids = new Set();
  for (const candidate of value.slice(0, MAX_HOOKS)) {
    const { hook } = normalizeLifecycleHook(candidate, ids);
    if (hook) hooks.push(hook);
  }

  return hooks;
};

export const validateLifecycleHooks = (value) => {
  if (!Array.isArray(value)) {
    return {
      ok: false,
      hooks: [],
      issues: [{ index: null, code: 'INVALID_HOOKS', error: 'Lifecycle hooks must be an array' }],
    };
  }
  if (value.length > MAX_HOOKS) {
    return {
      ok: false,
      hooks: [],
      issues: [{ index: null, code: 'TOO_MANY_HOOKS', error: `A maximum of ${MAX_HOOKS} lifecycle hooks is supported` }],
    };
  }

  const hooks = [];
  const issues = [];
  const ids = new Set();
  value.forEach((candidate, index) => {
    const result = normalizeLifecycleHook(candidate, ids);
    if (result.hook) {
      hooks.push(result.hook);
      return;
    }
    issues.push({ index, code: result.code, error: result.error });
  });
  return { ok: issues.length === 0, hooks, issues };
};

export const hasEnabledLifecycleHooks = (value) => {
  const hooks = sanitizeLifecycleHooks(value);
  return Array.isArray(hooks) && hooks.some((hook) => hook.enabled);
};

export const hasEnabledLifecycleHooksForEvent = (value, event) => {
  const hooks = sanitizeLifecycleHooks(value);
  return Array.isArray(hooks) && hooks.some((hook) => hook.enabled && hook.event === event);
};
