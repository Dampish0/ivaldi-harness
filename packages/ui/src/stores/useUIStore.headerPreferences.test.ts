import { afterEach, describe, expect, test } from 'bun:test';
import { useUIStore } from './useUIStore';

afterEach(() => {
  useUIStore.setState({ showCurrentInstanceInHeader: false });
});

describe('useUIStore header preferences', () => {
  test('keeps the current-instance header control off by default', () => {
    expect(useUIStore.getState().showCurrentInstanceInHeader).toBe(false);
  });

  test('persists an explicit current-instance header preference', () => {
    useUIStore.getState().setShowCurrentInstanceInHeader(true);

    const partialize = useUIStore.persist.getOptions().partialize;
    const persisted = partialize
      ? partialize(useUIStore.getState())
      : useUIStore.getState();

    expect(useUIStore.getState().showCurrentInstanceInHeader).toBe(true);
    expect(JSON.stringify(persisted).includes('"showCurrentInstanceInHeader":true')).toBe(true);
  });
});
