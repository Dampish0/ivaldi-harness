import { z } from 'zod';

export const PERMISSION_MODES = Object.freeze([
  'manual',
  'auto',
  'full-access',
]);

export const permissionModeSchema = z.enum(PERMISSION_MODES);
const permissionModeMapInputSchema = z.record(z.string(), z.json());
const permissionPolicyInputSchema = z.object({
  modes: permissionModeMapInputSchema.optional(),
  sessions: z.record(z.string(), z.json()).optional(),
  revision: z.json().optional(),
}).passthrough();

export const permissionModeFromLegacyAutoAccept = (enabled) => (
  enabled === true ? 'full-access' : 'manual'
);

export const legacyAutoAcceptFromPermissionMode = (mode) => mode === 'full-access';

const normalizePermissionModeMap = (source) => {
  const modes = {};
  const parsed = permissionModeMapInputSchema.safeParse(source);
  if (!parsed.success) return modes;
  for (const [sessionId, rawMode] of Object.entries(parsed.data)) {
    const mode = permissionModeSchema.safeParse(rawMode);
    if (sessionId && mode.success) modes[sessionId] = mode.data;
  }
  return modes;
};

export const normalizePermissionPolicy = (value) => {
  const parsed = permissionPolicyInputSchema.safeParse(value);
  const source = parsed.success ? parsed.data : {};
  const modes = normalizePermissionModeMap(source.modes);
  const legacySessions = Object.entries(source.sessions ?? {});

  for (const [sessionId, rawEnabled] of legacySessions) {
    const enabled = z.boolean().safeParse(rawEnabled);
    if (!sessionId || Object.hasOwn(modes, sessionId) || !enabled.success) continue;
    modes[sessionId] = permissionModeFromLegacyAutoAccept(enabled.data);
  }

  const sessions = Object.fromEntries(
    Object.entries(modes).map(([sessionId, mode]) => [sessionId, legacyAutoAcceptFromPermissionMode(mode)]),
  );
  const revisionResult = z.number().int().nonnegative().safeParse(source.revision);
  const revision = revisionResult.success ? revisionResult.data : 0;
  return { modes, sessions, revision };
};
