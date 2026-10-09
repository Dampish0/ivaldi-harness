import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sidebarProjects } from './sidebar-projects.ts';
import type { Session } from './schema.ts';

const chat = (id: string, directory: string, archived?: number): Session => ({ id, title: id, directory, time: { created: 1, updated: 2, archived } });

test('registered names and order include projects that have no chats', () => {
  const second = chat('second-chat', '/work/second');
  const first = chat('first-chat', '/work/first');
  const result = sidebarProjects([second, first], [
    { id: 'empty', path: '/work/empty', label: 'Research' },
    { id: 'first', path: '/work/first', label: 'Design system' },
    { id: 'second', path: '/work/second' },
  ]);
  assert.deepEqual(result.map(group => group.title), ['Research', 'Design system', 'second']);
  assert.deepEqual(result.map(group => group.chats), [[], [first], [second]]);
  assert.equal(result[0].directory, '/work/empty');
});

test('unregistered directories and archived chats remain available without guessing parent projects', () => {
  const nested = chat('nested', '/work/project/subfolder');
  const other = chat('other', '/other/project', 10);
  const result = sidebarProjects([nested, other], [{ id: 'registered', path: '/work/project' }]);
  assert.deepEqual(result.map(group => group.key), ['/work/project', '/work/project/subfolder', '/other/project']);
  assert.strictEqual(result[1].chats[0], nested);
  assert.strictEqual(result[2].chats[0], other);
});

test('path separators and trailing slashes do not duplicate a registered folder or alter its request path', () => {
  const current = chat('windows', 'C:/work/project');
  const result = sidebarProjects([current], [{ id: 'project', path: 'C:\\work\\project\\', label: 'Windows project' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].key, 'C:/work/project');
  assert.equal(result[0].directory, 'C:\\work\\project\\');
  assert.deepEqual(result[0].chats, [current]);
});

test('a refreshed registry can rename and reorder rows without changing their chats', () => {
  const sessions = [chat('a', '/a'), chat('b', '/b')];
  const before = sidebarProjects(sessions, [{ id: 'a', path: '/a', label: 'Before' }, { id: 'b', path: '/b' }]);
  const after = sidebarProjects(sessions, [{ id: 'b', path: '/b' }, { id: 'a', path: '/a', label: 'After' }]);
  assert.deepEqual(after.map(group => group.title), ['b', 'After']);
  assert.strictEqual(after[1].chats[0], sessions[0]);
  assert.equal(before[0].title, 'Before');
});

test('registry removal leaves that directory accessible through its existing chats', () => {
  const session = chat('kept', '/work/project');
  const result = sidebarProjects([session], []);
  assert.deepEqual(result, [{ key: '/work/project', directory: '/work/project', title: 'project', chats: [session] }]);
});

test('managed chats stay outside project grouping and duplicate paths keep the first registry entry', () => {
  const managed = chat('managed', 'C:/Users/qa/.config/ivaldi/chats/chat-1');
  const result = sidebarProjects([managed, chat('root', '/')], [{ id: 'one', path: '/', label: 'Root project' }, { id: 'two', path: '/' }]);
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Root project');
  assert.deepEqual(result[0].chats.map(session => session.id), ['root']);
});
