import React from 'react';
import type { Message, Part, ReasoningPart, TextPart, ToolPart } from '@opencode-ai/sdk/v2';

import type { MessageStreamPhase } from '@/stores/types/sessionTypes';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectorySync, useSessionMessages, useSessionPermissions, useSessionQuestions, useSessionStatus } from '@/sync/sync-context';
import { isFullySyntheticMessage } from '@/lib/messages/synthetic';
import { useI18n, type I18nKey } from '@/lib/i18n';
import { getToolDisplayName as getToolLabel } from '@/lib/toolHelpers';
import { OTHER_TOOL_STATUS_KEY, TOOL_STATUS_KEYS, getToolStatusKey } from '@/lib/toolStatus';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useCurrentSessionActivity } from './useSessionActivity';

type AssistantActivity = 'idle' | 'streaming' | 'tooling' | 'cooldown' | 'permission';

interface WorkingSummary {
    activity: AssistantActivity;
    hasWorkingContext: boolean;
    hasActiveTools: boolean;
    isWorking: boolean;
    isStreaming: boolean;
    isCooldown: boolean;
    lifecyclePhase: MessageStreamPhase | null;
    statusText: string | null;
    isGenericStatus: boolean;
    isWaitingForPermission: boolean;
    canAbort: boolean;
    compactionDeadline: number | null;
    activePartType?: 'text' | 'tool' | 'reasoning' | 'editing';
    activeToolName?: string;
    wasAborted: boolean;
    abortActive: boolean;
    lastCompletionId: string | null;
    isComplete: boolean;
    retryInfo: { attempt?: number; next?: number } | null;
}

interface FormingSummary {
    isActive: boolean;
    characterCount: number;
}

export interface AssistantStatusSnapshot {
    activeModel: ActiveAssistantModel | null;
    forming: FormingSummary;
    working: WorkingSummary;
}

interface ActiveAssistantModel {
    providerId: string;
    modelId: string;
}

interface ActiveAssistantContext {
    assistantId: string | null;
    model: ActiveAssistantModel | null;
}

const DEFAULT_WORKING: WorkingSummary = {
    activity: 'idle',
    hasWorkingContext: false,
    hasActiveTools: false,
    isWorking: false,
    isStreaming: false,
    isCooldown: false,
    lifecyclePhase: null,
    statusText: null,
    isGenericStatus: true,
    isWaitingForPermission: false,
    canAbort: false,
    compactionDeadline: null,
    activePartType: undefined,
    activeToolName: undefined,
    wasAborted: false,
    abortActive: false,
    lastCompletionId: null,
    isComplete: false,
    retryInfo: null,
};

const EMPTY_PARTS: Part[] = [];
const STATUS_SIGNATURE_SEPARATOR = '\u0000';
const EDITING_TOOLS = new Set(['edit', 'write', 'multiedit', 'apply_patch']);
// Status phrases stay i18n keys until the hook returns, so the signature that
// decides when to re-render is a plain string, and Work mode can word them
// plainly through its own dictionary. Tool phrases live in `@/lib/toolStatus`.
const EDITING_STATUS_KEY: I18nKey = 'chat.statusRow.status.tool.edit';
const THINKING_STATUS_KEY: I18nKey = 'chat.statusRow.status.thinking';
const COMPOSING_STATUS_KEY: I18nKey = 'chat.statusRow.status.composing';
const PERMISSION_STATUS_KEY: I18nKey = 'chat.statusRow.status.permission';
const WORKING_STATUS_KEYS: readonly I18nKey[] = [
    'chat.statusRow.status.working.working',
    'chat.statusRow.status.working.processing',
    'chat.statusRow.status.working.preparing',
    'chat.statusRow.status.working.warmingUp',
    'chat.statusRow.status.working.gearsTurning',
    'chat.statusRow.status.working.computing',
    'chat.statusRow.status.working.calculating',
    'chat.statusRow.status.working.analyzing',
    'chat.statusRow.status.working.wheelsSpinning',
    'chat.statusRow.status.working.calibrating',
    'chat.statusRow.status.working.synthesizing',
    'chat.statusRow.status.working.connectingDots',
    'chat.statusRow.status.working.inspectingLogic',
    'chat.statusRow.status.working.weighingOptions',
];
const DEFAULT_WORKING_STATUS_KEY: I18nKey = 'chat.statusRow.status.working.working';
const STATUS_KEYS = new Set<string>([
    ...TOOL_STATUS_KEYS.values(),
    ...WORKING_STATUS_KEYS,
    OTHER_TOOL_STATUS_KEY,
    THINKING_STATUS_KEY,
    COMPOSING_STATUS_KEY,
]);
const isStatusKey = (value: string): value is I18nKey => STATUS_KEYS.has(value);

type ParsedStatusResult = {
    activePartType: 'text' | 'tool' | 'reasoning' | 'editing' | undefined;
    activeToolName: string | undefined;
    statusKey: I18nKey;
    isGenericStatus: boolean;
};


const hashString = (value: string): number => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) {
        hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
    }
    return Math.abs(hash);
};

const getStableWorkingStatusKey = (key: string): I18nKey => {
    return WORKING_STATUS_KEYS[hashString(key) % WORKING_STATUS_KEYS.length] ?? DEFAULT_WORKING_STATUS_KEY;
};

const createParsedStatus = (parts: Part[], genericKey: string): ParsedStatusResult => {
    let activePartType: ParsedStatusResult['activePartType'] = undefined;
    let activeToolName: string | undefined = undefined;

    if (!isFullySyntheticMessage(parts)) {
        for (let index = parts.length - 1; index >= 0; index -= 1) {
            const part = parts[index];
            if (!part) continue;

            switch (part.type) {
                case 'reasoning': {
                    const time = part.time ?? getPartTimeInfo(part);
                    const stillRunning = !time || typeof time.end === 'undefined';
                    if (stillRunning && !activePartType) {
                        activePartType = 'reasoning';
                    }
                    break;
                }
                case 'tool': {
                    const toolStatus = part.state?.status;
                    if ((toolStatus === 'running' || toolStatus === 'pending') && !activePartType) {
                        const toolName = getToolDisplayName(part);
                        if (EDITING_TOOLS.has(toolName)) {
                            activePartType = 'editing';
                            activeToolName = toolName;
                        } else {
                            activePartType = 'tool';
                            activeToolName = toolName;
                        }
                    }
                    break;
                }
                case 'text': {
                    const rawContent = getLegacyTextContent(part) ?? '';
                    if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
                        const time = getPartTimeInfo(part);
                        const streamingPart = !time || typeof time.end === 'undefined';
                        if (streamingPart && !activePartType) {
                            activePartType = 'text';
                        }
                    }
                    break;
                }
                default:
                    break;
            }
        }
    }

    const isGenericStatus = activePartType === undefined;
    const statusKey = ((): I18nKey => {
        if (activePartType === 'editing') return activeToolName === 'multiedit' ? getToolStatusKey(activeToolName) : EDITING_STATUS_KEY;
        if (activePartType === 'tool' && activeToolName) return getToolStatusKey(activeToolName);
        if (activePartType === 'reasoning') return THINKING_STATUS_KEY;
        if (activePartType === 'text') return COMPOSING_STATUS_KEY;
        return getStableWorkingStatusKey(genericKey);
    })();

    return { activePartType, activeToolName, statusKey, isGenericStatus };
};

const encodeParsedStatus = (status: ParsedStatusResult): string => {
    return [
        status.activePartType ?? '',
        status.activeToolName ?? '',
        status.statusKey,
        status.isGenericStatus ? '1' : '0',
    ].join(STATUS_SIGNATURE_SEPARATOR);
};

const decodeParsedStatus = (signature: string): ParsedStatusResult => {
    const [activePartType, activeToolName, statusKey = '', isGenericStatus] = signature.split(STATUS_SIGNATURE_SEPARATOR);
    return {
        activePartType: activePartType === 'text' || activePartType === 'tool' || activePartType === 'reasoning' || activePartType === 'editing'
            ? activePartType
            : undefined,
        activeToolName: activeToolName || undefined,
        statusKey: isStatusKey(statusKey) ? statusKey : DEFAULT_WORKING_STATUS_KEY,
        isGenericStatus: isGenericStatus === '1',
    };
};

const isReasoningPart = (part: Part): part is ReasoningPart => part.type === 'reasoning';

const isTextPart = (part: Part): part is TextPart => part.type === 'text';

const getLegacyTextContent = (part: Part): string | undefined => {
    if (isTextPart(part)) {
        return part.text;
    }
    const candidate = part as Partial<{ text?: unknown; content?: unknown; value?: unknown }>;
    if (typeof candidate.text === 'string') {
        return candidate.text;
    }
    if (typeof candidate.content === 'string') {
        return candidate.content;
    }
    if (typeof candidate.value === 'string') {
        return candidate.value;
    }
    return undefined;
};

const getPartTimeInfo = (part: Part): { end?: number } | undefined => {
    if (isTextPart(part) || isReasoningPart(part)) {
        return part.time;
    }
    const candidate = part as Partial<{ time?: { end?: number } }>;
    return candidate.time;
};

const getToolDisplayName = (part: ToolPart): string => {
    if (part.tool) {
        return part.tool;
    }
    const candidate = part as ToolPart & Partial<{ name?: unknown }>;
    return typeof candidate.name === 'string' ? candidate.name : 'tool';
};

export const getActiveAssistantContext = (messages: Message[]): ActiveAssistantContext => {
    let assistantId: string | null = null;
    let parentId: string | null = null;

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'assistant') continue;

        const candidate = message as Message & { parentID?: unknown };
        assistantId = message.id;
        parentId = typeof candidate.parentID === 'string' && candidate.parentID.trim().length > 0
            ? candidate.parentID
            : null;
        break;
    }

    if (!assistantId || !parentId) {
        return { assistantId, model: null };
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'user' || message.id !== parentId) continue;

        const candidate = message as Message & {
            model?: { providerID?: unknown; modelID?: unknown };
        };
        const providerId = typeof candidate.model?.providerID === 'string'
            ? candidate.model.providerID.trim()
            : '';
        const modelId = typeof candidate.model?.modelID === 'string'
            ? candidate.model.modelID.trim()
            : '';

        return {
            assistantId,
            model: providerId && modelId ? { providerId, modelId } : null,
        };
    }

    return { assistantId, model: null };
};

export function useAssistantStatus(): AssistantStatusSnapshot {
    const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
    const currentSessionDirectory = useSessionUIStore((state) => state.currentSessionDirectory);

    const rawSessionMessages = useSessionMessages(
        currentSessionId ?? '',
        currentSessionDirectory ?? undefined,
    );

    const activeAssistant = React.useMemo(
        () => getActiveAssistantContext(rawSessionMessages),
        [rawSessionMessages],
    );
    const lastAssistantId = activeAssistant.assistantId;

    const lastAssistantStatusSignature = useDirectorySync(
        React.useCallback((state) => {
            const genericKey = `${currentSessionId ?? ''}:${lastAssistantId ?? ''}`;
            const parts = lastAssistantId ? (state.part[lastAssistantId] ?? EMPTY_PARTS) : EMPTY_PARTS;
            return encodeParsedStatus(createParsedStatus(parts, genericKey));
        }, [currentSessionId, lastAssistantId]),
        currentSessionDirectory ?? undefined,
    );

    const sessionPermissionRequests = useSessionPermissions(currentSessionId ?? '', currentSessionDirectory ?? undefined);
    const sessionQuestionRequests = useSessionQuestions(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const sessionAbortRecord = useSessionUIStore(
        React.useCallback((state) => {
            if (!currentSessionId) {
                return null;
            }
            return state.sessionAbortFlags?.get(currentSessionId) ?? null;
        }, [currentSessionId])
    );

    const { phase: activityPhase, isWorking: isPhaseWorking } = useCurrentSessionActivity();

    const currentSessionStatus = useSessionStatus(currentSessionId ?? '', currentSessionDirectory ?? undefined);

    const sessionRetryAttempt = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; attempt?: number }).attempt
        : undefined;

    const sessionRetryNext = currentSessionStatus?.type === 'retry'
        ? (currentSessionStatus as { type: 'retry'; next?: number }).next
        : undefined;

    const parsedStatus = React.useMemo<ParsedStatusResult>(() => {
        return decodeParsedStatus(lastAssistantStatusSignature);
    }, [lastAssistantStatusSignature]);

    const { t } = useI18n();
    const isWorkMode = useProductModeStore((state) => state.mode === 'work');
    const statusText = React.useMemo(() => t(parsedStatus.statusKey, {
        tool: parsedStatus.activeToolName ? getToolLabel(parsedStatus.activeToolName, isWorkMode) : '',
    }), [isWorkMode, parsedStatus.activeToolName, parsedStatus.statusKey, t]);

    const abortState = React.useMemo(() => {
        const hasActiveAbort = Boolean(sessionAbortRecord && !sessionAbortRecord.acknowledged);
        return { wasAborted: hasActiveAbort, abortActive: hasActiveAbort };
    }, [sessionAbortRecord]);

    const baseWorking = React.useMemo<WorkingSummary>(() => {

        if (abortState.wasAborted) {
            return {
                ...DEFAULT_WORKING,
                wasAborted: true,
                abortActive: abortState.abortActive,
                activity: 'idle',
                hasWorkingContext: false,
                isWorking: false,
                isStreaming: false,
                isCooldown: false,
                statusText: null,
                canAbort: false,
                retryInfo: null,
            };
        }

        const isWorking = isPhaseWorking;
        const isStreaming = activityPhase === 'busy';
        const isCooldown = false;
        const isRetry = activityPhase === 'retry';

        let activity: AssistantActivity = 'idle';
        if (isWorking) {
            if (parsedStatus.activePartType === 'tool' || parsedStatus.activePartType === 'editing') {
                activity = 'tooling';
            } else {
                activity = isCooldown ? 'cooldown' : 'streaming';
            }
        }

        const retryInfo = isRetry
            ? { attempt: sessionRetryAttempt, next: sessionRetryNext }
            : null;

        return {
            activity,
            hasWorkingContext: isWorking,
            hasActiveTools: parsedStatus.activePartType === 'tool' || parsedStatus.activePartType === 'editing',
            isWorking,
            isStreaming,
            isCooldown,
            lifecyclePhase: isStreaming ? 'streaming' : isCooldown ? 'cooldown' : null,
            statusText: isWorking ? statusText : null,
            isGenericStatus: isWorking ? parsedStatus.isGenericStatus : true,
            isWaitingForPermission: false,
            canAbort: isWorking,
            compactionDeadline: null,
            activePartType: isWorking ? parsedStatus.activePartType : undefined,
            activeToolName: isWorking ? parsedStatus.activeToolName : undefined,
            wasAborted: false,
            abortActive: false,
            lastCompletionId: null,
            isComplete: false,
            retryInfo,
        };
    }, [activityPhase, isPhaseWorking, parsedStatus, statusText, abortState, sessionRetryAttempt, sessionRetryNext]);

    const forming = React.useMemo<FormingSummary>(() => {
        const isActive = isPhaseWorking && parsedStatus.activePartType === 'text';
        return { isActive, characterCount: 0 };
    }, [isPhaseWorking, parsedStatus.activePartType]);

    const working = React.useMemo<WorkingSummary>(() => {
        if (baseWorking.wasAborted || baseWorking.abortActive) {
            return baseWorking;
        }

        const hasPendingPermission = sessionPermissionRequests.length > 0;
        const hasPendingQuestion = sessionQuestionRequests.length > 0;

        if (!hasPendingPermission && !hasPendingQuestion) {
            return baseWorking;
        }

        if (hasPendingQuestion) {
            return {
                ...baseWorking,
                statusText: null,
                isWorking: false,
                hasWorkingContext: false,
                hasActiveTools: false,
                canAbort: false,
                activePartType: undefined,
                activeToolName: undefined,
                retryInfo: null,
            };
        }

        return {
            ...baseWorking,
            statusText: t(PERMISSION_STATUS_KEY),
            isWaitingForPermission: true,
            canAbort: false,
            retryInfo: null,
        };
    }, [baseWorking, sessionPermissionRequests, sessionQuestionRequests, t]);

    return {
        activeModel: activeAssistant.model,
        forming,
        working,
    };
}
