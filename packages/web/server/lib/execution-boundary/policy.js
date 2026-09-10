import { z } from 'zod';

export const EXECUTION_SUBJECTS = Object.freeze([
  'agent',
  'hook',
  'scheduled',
  'background-agent',
  'agent-service',
  'user-terminal',
  'infrastructure',
]);

const EXECUTION_NETWORK_MODES = Object.freeze(['denied', 'allowlist', 'unrestricted']);

const executionSubjectSchema = z.enum(EXECUTION_SUBJECTS);
const executionNetworkModeSchema = z.enum(EXECUTION_NETWORK_MODES);
const optionalRootSchema = z.string().trim().min(1).nullable().optional();
const executionPolicyInputSchema = z.object({
  subject: executionSubjectSchema.optional(),
  required: z.boolean().optional(),
  readWriteRoots: z.array(z.string()).optional(),
  readOnlyRoots: z.array(z.string()).optional(),
  network: z.object({
    mode: executionNetworkModeSchema.optional(),
    hosts: z.array(z.string()).optional(),
    localhost: z.enum(['allow', 'deny']).optional(),
    privateNetwork: z.enum(['allow', 'deny']).optional(),
  }).strict().optional(),
  identity: z.object({
    sessionId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    worktree: optionalRootSchema,
    organizationId: z.string().nullable().optional(),
  }).strict().optional(),
}).strict();

const normalizeHosts = (values) => Array.from(new Set(
  values
    .filter((value) => value.trim())
    .map((value) => value.trim().toLowerCase()),
)).sort();

export const createExecutionBoundaryPolicyRuntime = ({ path, crypto, platform = process.platform }) => {
  const isWindows = platform === 'win32';

  const normalizeResolvedRoot = (value) => {
    const normalized = isWindows ? path.win32.normalize(value) : path.normalize(value);
    const parsed = isWindows ? path.win32.parse(normalized) : path.parse(normalized);
    const root = parsed.root;
    const withoutTrailingSeparator = normalized.length > root.length
      ? normalized.replace(/[\\/]+$/, '')
      : normalized;
    return isWindows ? withoutTrailingSeparator.toLowerCase() : withoutTrailingSeparator;
  };

  const normalizeRoot = (value) => {
    const parsed = optionalRootSchema.safeParse(value);
    if (!parsed.success || !parsed.data) return null;
    const trimmed = parsed.data;
    const resolved = isWindows
      ? path.win32.resolve(trimmed.replaceAll('/', '\\'))
      : path.resolve(trimmed);
    return normalizeResolvedRoot(resolved);
  };

  const normalizeRoots = (values) => Array.from(new Set(
    values
      .map((value) => normalizeRoot(value))
      .filter(Boolean),
  )).sort((a, b) => a.localeCompare(b));

  const normalizePolicy = (input = {}) => {
    const source = executionPolicyInputSchema.parse(input);
    const subject = source.subject ?? 'agent';
    const networkMode = source.network?.mode ?? 'denied';
    const normalized = {
      version: 1,
      subject,
      required: source.required === true,
      readWriteRoots: normalizeRoots(source.readWriteRoots ?? []),
      readOnlyRoots: normalizeRoots(source.readOnlyRoots ?? []),
      network: {
        mode: networkMode,
        hosts: networkMode === 'allowlist' ? normalizeHosts(source.network?.hosts ?? []) : [],
        localhost: source.network?.localhost === 'allow' ? 'allow' : 'deny',
        privateNetwork: source.network?.privateNetwork === 'allow' ? 'allow' : 'deny',
      },
      identity: {
        sessionId: source.identity?.sessionId ?? null,
        projectId: source.identity?.projectId ?? null,
        worktree: normalizeRoot(source.identity?.worktree),
        organizationId: source.identity?.organizationId ?? null,
      },
    };
    const serialized = JSON.stringify(normalized);
    return {
      ...normalized,
      hash: crypto.createHash('sha256').update(serialized).digest('hex'),
    };
  };

  const forProjectDirectory = ({ directory, subject = 'agent', required = false, sessionId = null } = {}) => {
    const resolvedDirectory = normalizeRoot(directory);
    return normalizePolicy({
      subject,
      required,
      readWriteRoots: resolvedDirectory ? [resolvedDirectory] : [],
      readOnlyRoots: [],
      network: { mode: 'unrestricted', localhost: 'allow', privateNetwork: 'allow' },
      identity: { sessionId, worktree: resolvedDirectory },
    });
  };

  return { normalizePolicy, forProjectDirectory, normalizeRoot };
};
