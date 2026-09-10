import path from 'node:path';
import crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import { createExecutionBoundaryPolicyRuntime } from './policy.js';
import { createExecutionBoundaryRuntime } from './runtime.js';

const policyRuntime = createExecutionBoundaryPolicyRuntime({ path, crypto, platform: 'win32' });

describe('process launch boundary runtime', () => {
  it('accepts the declared agent-service execution subject', () => {
    expect(policyRuntime.normalizePolicy({ subject: 'agent-service' })).toMatchObject({
      subject: 'agent-service',
    });
  });

  it('normalizes identical policies to a stable hash', () => {
    const first = policyRuntime.normalizePolicy({
      subject: 'agent',
      readWriteRoots: ['C:/repo', 'C:/repo'],
      network: { mode: 'allowlist', hosts: ['EXAMPLE.COM', 'example.com'] },
    });
    const second = policyRuntime.normalizePolicy({
      subject: 'agent',
      readWriteRoots: ['C:/repo'],
      network: { mode: 'allowlist', hosts: ['example.com'] },
    });
    expect(first.hash).toBe(second.hash);
  });

  it('normalizes equivalent Windows root spellings before hashing', () => {
    const first = policyRuntime.normalizePolicy({
      subject: 'agent',
      readWriteRoots: ['C:/Repo/Worktree/'],
      identity: { worktree: 'C:/Repo/Worktree' },
    });
    const second = policyRuntime.normalizePolicy({
      subject: 'agent',
      readWriteRoots: ['c:\\repo\\worktree'],
      identity: { worktree: 'c:\\REPO\\WORKTREE\\' },
    });

    expect(first).toMatchObject({
      readWriteRoots: ['c:\\repo\\worktree'],
      identity: { worktree: 'c:\\repo\\worktree' },
    });
    expect(first.hash).toBe(second.hash);
  });

  it('reports the direct host backend without hard-enforcement claims', () => {
    const runtime = createExecutionBoundaryRuntime({
      platform: 'win32',
      policyRuntime,
      spawnImpl: vi.fn(),
    });

    expect(runtime.getStatus()).toEqual({
      platform: 'win32',
      state: 'direct',
      backend: 'direct',
      processLaunch: true,
    });
    expect(runtime.getPermissionModeCapabilities()).toEqual({
      supportedModes: ['manual', 'auto', 'full-access'],
    });
  });

  it('treats Auto as an approval policy while retaining direct host process authority', () => {
    const runtime = createExecutionBoundaryRuntime({ platform: 'win32', policyRuntime, spawnImpl: vi.fn() });
    expect(() => runtime.assertModeAvailable('auto')).not.toThrow();
    expect(runtime.resolveProjectPolicy({
      directory: 'C:/repo',
      subject: 'agent',
      mode: 'auto',
      sessionId: 'ses_auto',
    })).toMatchObject({ required: false });
  });

  it('launches Ivaldi-owned processes directly with audit metadata', () => {
    const child = { pid: 42 };
    const spawnImpl = vi.fn(() => child);
    const runtime = createExecutionBoundaryRuntime({
      platform: 'win32',
      policyRuntime,
      spawnImpl,
      createCorrelationId: () => 'execution-1',
    });

    const launched = runtime.launchProcess({
      executable: 'node',
      args: ['hook.mjs'],
      options: { shell: false },
      directory: 'C:/repo',
      subject: 'hook',
      mode: 'full-access',
      sessionId: 'ses_test',
    });

    expect(spawnImpl).toHaveBeenCalledWith('node', ['hook.mjs'], { shell: false, cwd: 'C:/repo' });
    expect(launched.child).toBe(child);
    expect(launched.backend).toBe('direct');
    expect(launched.policy).toMatchObject({
      required: false,
      network: {
        mode: 'unrestricted',
        localhost: 'allow',
        privateNetwork: 'allow',
      },
    });
    expect(launched.execution).toMatchObject({
      correlationId: 'execution-1',
      subject: 'hook',
      mode: 'full-access',
      policyHash: launched.policy.hash,
    });
  });

  it('keeps project context separate from the child working directory', () => {
    const spawnImpl = vi.fn(() => ({ pid: 43 }));
    const runtime = createExecutionBoundaryRuntime({ platform: 'win32', policyRuntime, spawnImpl });

    const launched = runtime.launchProcess({
      executable: 'node',
      directory: 'C:/repo',
      workingDirectory: 'C:/repo/packages/web',
      mode: 'full-access',
      sessionId: 'ses_test',
    });

    expect(spawnImpl).toHaveBeenCalledWith('node', [], { cwd: 'C:/repo/packages/web' });
    expect(launched.policy.identity).toMatchObject({
      sessionId: 'ses_test',
      worktree: 'c:\\repo',
    });
  });

  it('preserves an explicit launch cwd', () => {
    const spawnImpl = vi.fn(() => ({ pid: 44 }));
    const runtime = createExecutionBoundaryRuntime({ platform: 'win32', policyRuntime, spawnImpl });

    runtime.launchProcess({
      executable: 'node',
      directory: 'C:/repo',
      workingDirectory: 'C:/repo/ignored',
      options: { cwd: 'C:/repo/explicit' },
      mode: 'full-access',
    });

    expect(spawnImpl).toHaveBeenCalledWith('node', [], { cwd: 'C:/repo/explicit' });
  });

  it('rejects unknown permission modes before launching anything', () => {
    const spawnImpl = vi.fn();
    const runtime = createExecutionBoundaryRuntime({ platform: 'win32', policyRuntime, spawnImpl });
    expect(() => runtime.launchProcess({ executable: 'node', mode: 'anything-goes' })).toThrow('Unknown permission mode');
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it('fails clearly when direct process launch is unavailable', () => {
    const runtime = createExecutionBoundaryRuntime({ platform: 'win32', policyRuntime });
    expect(() => runtime.launchProcess({ executable: 'node', mode: 'manual' })).toThrow('Direct execution backend is unavailable');
  });
});
