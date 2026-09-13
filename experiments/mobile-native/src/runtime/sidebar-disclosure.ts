import type { Session } from './schema.ts';

type SelectedChat = { id: string; directory: string; archived: boolean };
type SidebarDisclosure = { selection: SelectedChat | null; openFolders: ReadonlySet<string> };
type SidebarDisclosureAction =
  | { type: 'select'; activeId: string | null; session: Session | undefined; managed: boolean }
  | { type: 'toggle'; folder: string };

export function initialSidebarDisclosure(): SidebarDisclosure { return { selection: null, openFolders: new Set() }; }

export function sidebarDisclosure(state: SidebarDisclosure, action: SidebarDisclosureAction): SidebarDisclosure {
  if (action.type === 'toggle') {
    const openFolders = new Set(state.openFolders);
    if (openFolders.has(action.folder)) openFolders.delete(action.folder); else openFolders.add(action.folder);
    return { ...state, openFolders };
  }
  if (action.activeId === null) return state.selection === null ? state : { ...state, selection: null };
  const session = action.session;
  // A saved ID can arrive before its session. Keep disclosure until its owner is known.
  if (session?.id !== action.activeId) return state;
  const selection = { id: session.id, directory: session.directory, archived: Boolean(session.time.archived) };
  if (state.selection?.id === selection.id && state.selection.directory === selection.directory && state.selection.archived === selection.archived) return state;

  const folders: string[] = [];
  if (action.managed) {
    if (selection.archived) folders.push('chat-archive');
  } else {
    folders.push(`project:${selection.directory}`);
    if (selection.archived) folders.push(`project-archive:${selection.directory}`);
  }
  return { selection, openFolders: folders.every(folder => state.openFolders.has(folder)) ? state.openFolders : new Set([...state.openFolders, ...folders]) };
}
