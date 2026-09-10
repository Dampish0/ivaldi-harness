import { describe, expect, it, vi } from 'vitest';

import { createNotificationEmitterRuntime } from './emitter-runtime.js';

const createRuntime = (overrides = {}) => createNotificationEmitterRuntime({
  process: { stdout: { write: vi.fn() } },
  getDesktopNotifyEnabled: () => true,
  desktopNotifyPrefix: '[desktop-notify]',
  getUiNotificationClients: () => new Set(),
  getBroadcastGlobalUiEvent: () => null,
  ...overrides,
});

describe('notification emitter runtime', () => {
  it('reports desktop delivery through the injected native callback', () => {
    const onDesktopNotification = vi.fn();
    const runtime = createRuntime({ onDesktopNotification });
    const payload = { title: 'Ready', body: 'Done' };

    expect(runtime.emitDesktopNotification(payload)).toBe(true);
    expect(onDesktopNotification).toHaveBeenCalledWith(payload);
  });

  it('reports stdout desktop delivery for legacy shells', () => {
    const write = vi.fn();
    const runtime = createRuntime({ process: { stdout: { write } } });

    expect(runtime.emitDesktopNotification({ title: 'Ready' })).toBe(true);
    expect(write).toHaveBeenCalledWith('[desktop-notify]{"title":"Ready"}\n');
  });

  it('marks UI broadcasts that were already delivered natively', () => {
    const broadcastGlobalUiEvent = vi.fn();
    const runtime = createRuntime({ getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent });

    runtime.broadcastUiNotification({ title: 'Ready' }, { desktopNotificationDelivered: true });

    expect(broadcastGlobalUiEvent).toHaveBeenCalledWith({
      type: 'openchamber:notification',
      properties: {
        title: 'Ready',
        desktopNotificationDelivered: true,
        desktopStdoutActive: true,
      },
    });
  });

  it('notifies the lifecycle observer once even when no UI client is connected', () => {
    const onNotification = vi.fn();
    const runtime = createRuntime({ onNotification });
    const payload = { title: 'Ready', sessionId: 'ses_1', directory: '/repo/app' };

    runtime.broadcastUiNotification(payload);

    expect(onNotification).toHaveBeenCalledTimes(1);
    expect(onNotification).toHaveBeenCalledWith(payload);
  });

  it('keeps notification delivery working when the lifecycle observer throws', () => {
    const broadcastGlobalUiEvent = vi.fn();
    const runtime = createRuntime({
      onNotification: () => { throw new Error('hook observer failed'); },
      getBroadcastGlobalUiEvent: () => broadcastGlobalUiEvent,
    });

    runtime.broadcastUiNotification({ title: 'Ready' });

    expect(broadcastGlobalUiEvent).toHaveBeenCalledTimes(1);
  });
});
