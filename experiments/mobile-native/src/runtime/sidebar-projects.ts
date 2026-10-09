import type { Session } from './schema.ts';
import type { SettingsProject } from './settings-projects.ts';
import { isManagedChat } from './conversations.ts';

/** Match host paths without changing the path used for requests or guessing ancestry. */
export function projectDirectoryKey(directory: string): string {
  return directory.replace(/\\/g, '/').replace(/\/+$/, '') || '/';
}

export function projectTitle(directory: string, label?: string): string {
  const key = projectDirectoryKey(directory);
  return label?.trim() || key.split('/').filter(Boolean).at(-1) || key;
}

interface SidebarProject {
  key: string;
  directory: string;
  title: string;
  chats: Session[];
}

/** Registry order and names come from the host. Unregistered chat folders remain accessible. */
export function sidebarProjects(sessions: readonly Session[], projects: readonly SettingsProject[]): SidebarProject[] {
  const groups = new Map<string, SidebarProject>();
  for (const project of projects) {
    const key = projectDirectoryKey(project.path);
    if (!groups.has(key)) groups.set(key, { key, directory: project.path, title: projectTitle(key, project.label), chats: [] });
  }
  for (const chat of sessions) {
    if (isManagedChat(chat.directory)) continue;
    const key = projectDirectoryKey(chat.directory);
    let group = groups.get(key);
    if (!group) {
      group = { key, directory: chat.directory, title: projectTitle(key), chats: [] };
      groups.set(key, group);
    }
    group.chats.push(chat);
  }
  return [...groups.values()];
}
