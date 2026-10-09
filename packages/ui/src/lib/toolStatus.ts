import type { I18nKey } from '@/lib/i18n';

/**
 * What a tool is doing, as a short phrase that reads after "{model} is", such
 * as "reading file". The status line and the Work mode steps row share it so a
 * step is described the same way in both places.
 */
export const TOOL_STATUS_KEYS: ReadonlyMap<string, I18nKey> = new Map<string, I18nKey>([
    ['read', 'chat.statusRow.status.tool.read'],
    ['write', 'chat.statusRow.status.tool.write'],
    ['edit', 'chat.statusRow.status.tool.edit'],
    ['multiedit', 'chat.statusRow.status.tool.multiedit'],
    ['apply_patch', 'chat.statusRow.status.tool.applyPatch'],
    ['bash', 'chat.statusRow.status.tool.bash'],
    ['grep', 'chat.statusRow.status.tool.grep'],
    ['glob', 'chat.statusRow.status.tool.glob'],
    ['list', 'chat.statusRow.status.tool.list'],
    ['task', 'chat.statusRow.status.tool.task'],
    ['webfetch', 'chat.statusRow.status.tool.webfetch'],
    ['websearch', 'chat.statusRow.status.tool.websearch'],
    ['codesearch', 'chat.statusRow.status.tool.codesearch'],
    ['todowrite', 'chat.statusRow.status.tool.todowrite'],
    ['todoread', 'chat.statusRow.status.tool.todoread'],
    ['skill', 'chat.statusRow.status.tool.skill'],
    ['question', 'chat.statusRow.status.tool.question'],
    ['plan_enter', 'chat.statusRow.status.tool.planEnter'],
    ['plan_exit', 'chat.statusRow.status.tool.planExit'],
    ['openchamber_web', 'chat.statusRow.status.tool.browser'],
    ['openchamber_memory', 'chat.statusRow.status.tool.memory'],
]);

/** A tool with no phrase of its own; `{tool}` is its display name, never its id. */
export const OTHER_TOOL_STATUS_KEY: I18nKey = 'chat.statusRow.status.tool.other';

export const getToolStatusKey = (toolName: string): I18nKey => {
    return TOOL_STATUS_KEYS.get(toolName) ?? OTHER_TOOL_STATUS_KEY;
};
