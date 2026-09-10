import { z } from 'zod';

import type { ProductMode } from '@/lib/productMode';

export const PERMISSION_MODES = ['manual', 'auto', 'full-access'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const permissionModeSchema = z.enum(PERMISSION_MODES);

const permissionModeCapabilitiesSchema = z.object({
  supportedModes: z.array(permissionModeSchema),
  reason: z.string().optional(),
}).strict();

export type PermissionModeCapabilities = z.infer<typeof permissionModeCapabilitiesSchema>;

export const permissionPolicySnapshotSchema = z.object({
  modes: z.record(z.string(), permissionModeSchema),
  sessions: z.record(z.string(), z.boolean()),
  revision: z.number().int().nonnegative().optional(),
  capabilities: permissionModeCapabilitiesSchema,
}).strict();

export type PermissionPolicySnapshot = z.infer<typeof permissionPolicySnapshotSchema>;

export const permissionPolicyBroadcastEventSchema = z.object({
  type: z.literal('openchamber:permission-auto-accept.updated'),
  properties: z.object({
    sessions: z.record(z.string(), z.boolean()),
    modes: z.record(z.string(), permissionModeSchema).optional(),
    revision: z.number().int().nonnegative().optional(),
  }).strict(),
}).passthrough();

export const DEFAULT_PERMISSION_MODE_CAPABILITIES: PermissionModeCapabilities = {
  supportedModes: ['manual', 'full-access'],
};

export const permissionModeFromLegacyAutoAccept = (enabled: boolean): PermissionMode => (
  enabled ? 'full-access' : 'manual'
);

export const isPermissionModeSupported = (
  mode: PermissionMode,
  capabilities: PermissionModeCapabilities,
): boolean => capabilities.supportedModes.includes(mode);

export const getDefaultPermissionMode = (productMode: ProductMode): PermissionMode => (
  productMode === 'work' ? 'full-access' : 'manual'
);
