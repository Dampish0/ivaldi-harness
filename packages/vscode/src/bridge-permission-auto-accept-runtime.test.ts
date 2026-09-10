import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  handlePermissionAutoAcceptBridgeMessage,
  type PermissionPolicySnapshot,
} from './bridge-permission-auto-accept-runtime';

const createContext = () => {
  const values = new Map<string, string>();
  return {
    globalState: {
      get: <T>(key: string): T | undefined => {
        const value = values.get(key);
        return value === undefined ? undefined : JSON.parse(value);
      },
      update: async (key: string, value: PermissionPolicySnapshot) => {
        values.set(key, JSON.stringify(value));
      },
    },
  };
};

describe('VS Code permission auto-accept policy bridge', () => {
  test('persists Auto through the mode policy endpoint while retaining the legacy boolean mirror', async () => {
    const context = createContext();
    const broadcasts: PermissionPolicySnapshot[] = [];
    const dependencies = { broadcast: async (snapshot: PermissionPolicySnapshot) => { broadcasts.push(snapshot); } };

    const updated = await handlePermissionAutoAcceptBridgeMessage({
      id: 'auto-1',
      type: 'api:permission-policy:set',
      payload: { sessionId: 'root', mode: 'auto' },
    }, context, dependencies);

    assert.equal(updated?.success, true);
    assert.deepEqual(updated?.data, {
      modes: { root: 'auto' },
      sessions: { root: false },
      revision: 1,
      capabilities: { supportedModes: ['manual', 'auto', 'full-access'] },
    });
    assert.deepEqual(broadcasts, [{ modes: { root: 'auto' }, sessions: { root: false }, revision: 1 }]);

    const legacy = await handlePermissionAutoAcceptBridgeMessage({
      id: 'auto-2',
      type: 'api:permission-auto-accept:get',
    }, context, dependencies);
    assert.deepEqual(legacy?.data, { sessions: { root: false }, revision: 1 });
  });

  test('persists policy and broadcasts the authoritative snapshot', async () => {
    const context = createContext();
    const broadcasts: PermissionPolicySnapshot[] = [];
    const dependencies = { broadcast: async (snapshot: PermissionPolicySnapshot) => { broadcasts.push(snapshot); } };
    const response = await handlePermissionAutoAcceptBridgeMessage({
      id: '1',
      type: 'api:permission-auto-accept:set',
      payload: { sessionId: 'root', enabled: true },
    }, context, dependencies);

    assert.equal(response?.success, true);
    assert.deepEqual(response?.data, { sessions: { root: true }, revision: 1 });
    assert.deepEqual(broadcasts, [{
      modes: { root: 'full-access' },
      sessions: { root: true },
      revision: 1,
    }]);

    const reloaded = await handlePermissionAutoAcceptBridgeMessage({
      id: '2',
      type: 'api:permission-auto-accept:get',
    }, context, dependencies);
    assert.deepEqual(reloaded?.data, { sessions: { root: true }, revision: 1 });
  });

  test('serializes concurrent writes without losing policy entries', async () => {
    const context = createContext();
    const dependencies = { broadcast: async () => undefined };
    const first = handlePermissionAutoAcceptBridgeMessage({
      id: '1',
      type: 'api:permission-auto-accept:set',
      payload: { sessionId: 'root', enabled: true },
    }, context, dependencies);
    const second = handlePermissionAutoAcceptBridgeMessage({
      id: '2',
      type: 'api:permission-auto-accept:set',
      payload: { sessionId: 'child', enabled: false },
    }, context, dependencies);

    await Promise.all([first, second]);
    const reloaded = await handlePermissionAutoAcceptBridgeMessage({
      id: '3',
      type: 'api:permission-auto-accept:get',
    }, context, dependencies);
    assert.deepEqual(reloaded?.data, { sessions: { root: true, child: false }, revision: 2 });
  });

  test('rejects malformed policy writes', async () => {
    const broadcasts: unknown[] = [];
    const response = await handlePermissionAutoAcceptBridgeMessage({
      id: '1',
      type: 'api:permission-auto-accept:set',
      payload: { sessionId: 'root', enabled: 'yes' },
    }, createContext(), { broadcast: async (snapshot) => { broadcasts.push(snapshot); } });

    assert.equal(response?.success, false);
    assert.deepEqual(broadcasts, []);
  });
});
