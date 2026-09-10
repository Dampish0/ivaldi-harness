import { z } from 'zod';

import { EXECUTION_SUBJECTS } from './policy.js';
import { permissionModeSchema } from '../permission-auto-accept/modes.js';

const executionSubjectSchema = z.enum(EXECUTION_SUBJECTS);
const SUPPORTED_PROCESS_MODES = Object.freeze(['manual', 'auto', 'full-access']);
const launchRequestSchema = z.object({
  executable: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  options: z.object({}).passthrough().default({}),
  directory: z.string().nullable().optional(),
  workingDirectory: z.string().nullable().optional(),
  subject: executionSubjectSchema.default('agent'),
  mode: permissionModeSchema.default('manual'),
  sessionId: z.string().nullable().optional(),
}).strict();

export const createExecutionBoundaryRuntime = ({
  platform = process.platform,
  policyRuntime,
  spawnImpl = null,
  createCorrelationId = () => null,
}) => {
  const getStatus = () => ({
    platform,
    state: 'direct',
    backend: 'direct',
    processLaunch: Boolean(spawnImpl),
  });

  const getPermissionModeCapabilities = () => ({
    supportedModes: [...SUPPORTED_PROCESS_MODES],
  });

  const assertModeAvailable = (mode) => {
    const parsedMode = permissionModeSchema.safeParse(mode);
    if (!parsedMode.success) {
      const error = new Error(`Unknown permission mode: ${mode}`);
      error.code = 'EXECUTION_BOUNDARY_MODE_INVALID';
      throw error;
    }
    if (SUPPORTED_PROCESS_MODES.includes(parsedMode.data)) return;
    const error = new Error(`Permission mode ${parsedMode.data} is unavailable`);
    error.code = 'EXECUTION_BOUNDARY_UNAVAILABLE';
    throw error;
  };

  const resolveProjectPolicy = ({ directory, subject, mode, sessionId }) => {
    assertModeAvailable(mode);
    return policyRuntime.forProjectDirectory({
      directory,
      subject,
      required: false,
      sessionId,
    });
  };

  const launchProcess = (request = {}) => {
    const requestedMode = permissionModeSchema.safeParse(request?.mode ?? 'manual');
    if (!requestedMode.success) {
      const error = new Error(`Unknown permission mode: ${request?.mode}`);
      error.code = 'EXECUTION_BOUNDARY_MODE_INVALID';
      throw error;
    }
    const parsedRequest = launchRequestSchema.safeParse(request);
    if (!parsedRequest.success) {
      const error = new TypeError('Execution boundary launch request is invalid');
      error.code = 'EXECUTION_BOUNDARY_REQUEST_INVALID';
      error.cause = parsedRequest.error;
      throw error;
    }
    const {
      executable,
      args,
      options,
      directory = null,
      workingDirectory = null,
      subject,
      mode,
      sessionId = null,
    } = parsedRequest.data;

    const policy = resolveProjectPolicy({ directory, subject, mode, sessionId });
    if (!spawnImpl) {
      const error = new Error('Direct execution backend is unavailable');
      error.code = 'EXECUTION_BOUNDARY_UNAVAILABLE';
      throw error;
    }
    const correlationId = createCorrelationId?.() ?? null;
    const spawnOptions = { ...options };
    const effectiveWorkingDirectory = workingDirectory ?? directory;
    if (effectiveWorkingDirectory && !Object.hasOwn(spawnOptions, 'cwd')) {
      spawnOptions.cwd = effectiveWorkingDirectory;
    }
    const execution = {
      correlationId,
      subject: policy.subject,
      policyHash: policy.hash,
      mode,
    };
    return {
      child: spawnImpl(executable.trim(), [...args], spawnOptions),
      backend: 'direct',
      policy,
      execution,
    };
  };

  return {
    getStatus,
    getPermissionModeCapabilities,
    assertModeAvailable,
    resolveProjectPolicy,
    launchProcess,
  };
};
