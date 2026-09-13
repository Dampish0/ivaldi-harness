import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSettingsParent, reconcileSettingsMode, settingsSearchPath, type SettingsPage } from './settings-navigation.ts';

test('provider search has the same complete ancestry as Work and Developer navigation', () => {
  assert.equal(getSettingsParent('providers', 'work'), 'advanced');
  assert.equal(getSettingsParent('providers', 'developer'), 'home');
  assert.deepEqual(settingsSearchPath('providers', 'work'), ['home', 'advanced', 'providers']);
  assert.deepEqual(settingsSearchPath('provider-custom', 'work'), ['home', 'advanced', 'providers', 'provider-custom']);
  assert.deepEqual(settingsSearchPath('provider-custom', 'developer'), ['home', 'providers', 'provider-custom']);
});

test('searching a Chat control opens one Chat page and its Back returns Home', () => {
  for (const mode of ['work', 'developer'] as const) {
    assert.deepEqual(settingsSearchPath('chat', mode), ['home', 'chat']);
    assert.deepEqual(settingsSearchPath('chat', mode).slice(0, -1), ['home']);
  }
});

test('new-chat defaults stay outside Advanced in both modes', () => {
  for (const mode of ['work', 'developer'] as const) {
    for (const destination of ['default-model', 'default-agent', 'default-effort'] as const) {
      assert.deepEqual(settingsSearchPath(destination, mode), ['home', 'sessions', destination]);
    }
    assert.deepEqual(settingsSearchPath('mode', mode), ['home', 'general', 'mode']);
    assert.deepEqual(settingsSearchPath('text-size', mode), ['home', 'appearance', 'text-size']);
  }
});

test('the independent Settings project picker and connections remain rooted in Home', () => {
  for (const mode of ['work', 'developer'] as const) {
    assert.equal(getSettingsParent('settings-project', mode), 'home');
    assert.equal(getSettingsParent('connections', mode), 'home');
    assert.deepEqual(settingsSearchPath('settings-project', mode), ['home', 'settings-project']);
  }
});

test('changing mode preserves provider detail, authentication and editor Back paths', () => {
  const suffixes: SettingsPage[][] = [[], ['provider-detail'], ['provider-detail', 'provider-auth'], ['provider-custom'], ['provider-detail', 'provider-custom']];
  for (const suffix of suffixes) {
    const developer = Object.freeze<SettingsPage[]>(['home', 'providers', ...suffix]);
    const work = reconcileSettingsMode(developer, 'work');
    assert.deepEqual(work, ['home', 'advanced', 'providers', ...suffix]);
    assert.equal(work.at(-1), developer.at(-1));
    assert.deepEqual(reconcileSettingsMode(work, 'developer'), developer);
    assert.deepEqual(developer, ['home', 'providers', ...suffix]);
  }
});

test('mode reconciliation retains unchanged array identity and does not reset other pages', () => {
  const stacks: SettingsPage[][] = [['home'], ['home', 'general', 'mode'], ['home', 'settings-project'], ['home', 'sessions', 'default-agent']];
  for (const stack of stacks) {
    Object.freeze(stack);
    assert.strictEqual(reconcileSettingsMode(stack, 'work'), stack);
    assert.strictEqual(reconcileSettingsMode(stack, 'developer'), stack);
  }
  const work: SettingsPage[] = ['home', 'advanced', 'providers', 'provider-detail', 'provider-custom'];
  const developer: SettingsPage[] = ['home', 'providers', 'provider-detail', 'provider-auth'];
  assert.strictEqual(reconcileSettingsMode(work, 'work'), work);
  assert.strictEqual(reconcileSettingsMode(developer, 'developer'), developer);
  const switched = reconcileSettingsMode(developer, 'work');
  assert.strictEqual(reconcileSettingsMode(switched, 'work'), switched);
});

test('Advanced is reachable only in Work and switching away from it returns Home', () => {
  assert.deepEqual(settingsSearchPath('advanced', 'work'), ['home', 'advanced']);
  assert.deepEqual(settingsSearchPath('advanced', 'developer'), ['home']);
  const stack: SettingsPage[] = ['home', 'advanced'];
  assert.strictEqual(reconcileSettingsMode(stack, 'work'), stack);
  assert.deepEqual(reconcileSettingsMode(stack, 'developer'), ['home']);
  assert.deepEqual(reconcileSettingsMode([], 'work'), ['home']);
  assert.deepEqual(reconcileSettingsMode([], 'developer'), ['home']);
});
