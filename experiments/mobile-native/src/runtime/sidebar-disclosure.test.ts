import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialSidebarDisclosure, sidebarDisclosure } from './sidebar-disclosure.ts';
import type { Session } from './schema.ts';

const project: Session = { id: 'saved-chat', title: 'Saved chat', directory: '/work/project', time: { created: 1, updated: 2 } };

test('a restored selected chat reveals its project after its session arrives', () => {
  const initial = initialSidebarDisclosure();
  const waiting = sidebarDisclosure(initial, { type: 'select', managed: false, activeId: project.id, session: undefined });
  assert.strictEqual(waiting, initial);
  const loaded = sidebarDisclosure(waiting, { type: 'select', managed: false, activeId: project.id, session: project });
  assert.deepEqual([...loaded.openFolders], ['project:/work/project']);
});

test('unrelated session data cannot reveal a folder for an unresolved selected ID', () => {
  const initial = initialSidebarDisclosure();
  assert.strictEqual(sidebarDisclosure(initial, { type: 'select', managed: false, activeId: 'not-loaded', session: project }), initial);
});

test('manual collapse survives the same selection and refreshed session metadata', () => {
  const revealed = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const collapsed = sidebarDisclosure(revealed, { type: 'toggle', folder: 'project:/work/project' });
  const refreshed = { ...project, title: 'Renamed chat', time: { ...project.time, updated: 99 } };
  assert.strictEqual(sidebarDisclosure(collapsed, { type: 'select', managed: false, activeId: project.id, session: refreshed }), collapsed);
  assert.equal(collapsed.openFolders.has('project:/work/project'), false);
});

test('selecting a different chat reveals its folder without closing other manual choices', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const opened = sidebarDisclosure(first, { type: 'toggle', folder: 'project:/work/manual' });
  const another = { ...project, id: 'another-chat', directory: '/work/another' };
  const next = sidebarDisclosure(opened, { type: 'select', managed: false, activeId: another.id, session: another });
  assert.deepEqual([...next.openFolders], ['project:/work/project', 'project:/work/manual', 'project:/work/another']);
});

test('selecting another chat through search reopens its manually collapsed project once', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const collapsed = sidebarDisclosure(first, { type: 'toggle', folder: 'project:/work/project' });
  const another = { ...project, id: 'another-chat' };
  const selected = sidebarDisclosure(collapsed, { type: 'select', managed: false, activeId: another.id, session: another });
  assert.equal(selected.openFolders.has('project:/work/project'), true);
  const closedAgain = sidebarDisclosure(selected, { type: 'toggle', folder: 'project:/work/project' });
  assert.strictEqual(sidebarDisclosure(closedAgain, { type: 'select', managed: false, activeId: another.id, session: another }), closedAgain);
});

test('an authoritative directory change reveals the same chat in its new group', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const moved = { ...project, directory: '/work/moved' };
  const next = sidebarDisclosure(first, { type: 'select', managed: false, activeId: moved.id, session: moved });
  assert.equal(next.openFolders.has('project:/work/moved'), true);
});

test('archived project selection opens both ancestors but respects later manual collapse', () => {
  const archived = { ...project, time: { ...project.time, archived: 12 } };
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: archived.id, session: archived });
  assert.deepEqual([...first.openFolders], ['project:/work/project', 'project-archive:/work/project']);
  const collapsed = sidebarDisclosure(first, { type: 'toggle', folder: 'project-archive:/work/project' });
  assert.strictEqual(sidebarDisclosure(collapsed, { type: 'select', managed: false, activeId: archived.id, session: archived }), collapsed);
});

test('an archive membership change reveals the new location of the same selected chat', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const archived = { ...project, time: { ...project.time, archived: 12 } };
  const next = sidebarDisclosure(first, { type: 'select', managed: false, activeId: archived.id, session: archived });
  assert.equal(next.openFolders.has('project-archive:/work/project'), true);
});

test('managed archived chats reveal only the shared archive and zero means unarchived', () => {
  const managed = { ...project, directory: 'C:\\Users\\me\\.config\\ivaldi\\chats\\one', time: { ...project.time, archived: 0 } };
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: true, activeId: managed.id, session: managed });
  assert.equal(first.openFolders.size, 0);
  const archived = { ...managed, time: { ...managed.time, archived: 12 } };
  const next = sidebarDisclosure(first, { type: 'select', managed: true, activeId: archived.id, session: archived });
  assert.deepEqual([...next.openFolders], ['chat-archive']);
});

test('new chat preserves disclosure and returning to a conversation reveals its project', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const collapsed = sidebarDisclosure(first, { type: 'toggle', folder: 'project:/work/project' });
  const draft = sidebarDisclosure(collapsed, { type: 'select', managed: false, activeId: null, session: undefined });
  assert.strictEqual(draft.openFolders, collapsed.openFolders);
  const returned = sidebarDisclosure(draft, { type: 'select', managed: false, activeId: project.id, session: project });
  assert.equal(returned.openFolders.has('project:/work/project'), true);
});

test('a temporarily unavailable selection does not erase previous disclosure or repeat reveal', () => {
  const first = sidebarDisclosure(initialSidebarDisclosure(), { type: 'select', managed: false, activeId: project.id, session: project });
  const collapsed = sidebarDisclosure(first, { type: 'toggle', folder: 'project:/work/project' });
  const waiting = sidebarDisclosure(collapsed, { type: 'select', managed: false, activeId: project.id, session: undefined });
  assert.strictEqual(waiting, collapsed);
  assert.strictEqual(sidebarDisclosure(waiting, { type: 'select', managed: false, activeId: project.id, session: project }), collapsed);
});
