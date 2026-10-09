import React from 'react';
import type { PermissionRequest, PermissionResponse } from '@/types/permission';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import * as sessionActions from '@/sync/session-actions';
import { WorkerHighlightedCode } from '@/components/code/WorkerHighlightedCode';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";
import { DiffPreview, WritePreview } from './DiffPreview';
import { useI18n } from '@/lib/i18n';
import { getVisiblePermissionPatterns } from './permissionCardPatterns';
import { ChatRequestCard } from './ChatRequestCard';
import { getToolDisplayName as getToolRowName } from '@/lib/toolHelpers';
import { useProductModeStore } from '@/stores/useProductModeStore';

const PERMISSION_BASH_CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '0.5rem',
  fontSize: 'var(--text-meta)',
  lineHeight: '1.25rem',
  background: 'color-mix(in srgb, var(--surface-muted) 60%, transparent)',
  borderRadius: 'var(--radius-md)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflowWrap: 'break-word',
  overflow: 'visible',
};

const PERMISSION_BASH_CODE_TAG_PROPS = {
  style: {
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  } as React.CSSProperties,
};

const PERMISSION_JSON_CUSTOM_STYLE: React.CSSProperties = {
  margin: 0,
  padding: '0.5rem',
  fontSize: 'var(--text-meta)',
  lineHeight: '1.25rem',
  background: 'color-mix(in srgb, var(--surface-muted) 60%, transparent)',
  borderRadius: 'var(--radius-md)',
};

interface PermissionCardProps {
  permission: PermissionRequest;
  onResponse?: (response: 'once' | 'always' | 'reject') => void;
}

const getToolIcon = (toolName: string) => {
  const iconClass = "h-3 w-3";
  const tool = toolName.toLowerCase();

  if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
    return <Icon name="pencil-ai" className={iconClass} />;
  }

  if (tool === 'write' || tool === 'create' || tool === 'file_write') {
    return <Icon name="file-edit" className={iconClass} />;
  }

  if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal' || tool === 'shell_command') {
    return <Icon name="terminal-box" className={iconClass} />;
  }

  if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
    return <Icon name="global" className={iconClass} />;
  }

  if (tool === 'linear' || tool.startsWith('linear_')) {
    return <Icon name="linear" className={iconClass} />;
  }

  if (tool === 'cloudflare' || tool.startsWith('cloudflare_') || tool === 'claudflare' || tool.startsWith('claudflare_')) {
    return <Icon name="cloudflare" className={iconClass} />;
  }

  return <Icon name="tools" className={iconClass} />;
};

const getCanonicalToolName = (toolName: string): string => {
  const tool = toolName.toLowerCase();

  if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
    return 'edit';
  }
  if (tool === 'write' || tool === 'create' || tool === 'file_write') {
    return 'write';
  }
  if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal' || tool === 'shell_command') {
    return 'bash';
  }
  if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
    return 'webfetch';
  }

  return toolName;
};

// Same names as the tool row above the card, so "bash" reads as "Shell Command",
// or the plain work-mode name.
const getToolDisplayName = (toolName: string, workMode: boolean): string => getToolRowName(getCanonicalToolName(toolName), workMode);

export const PermissionCard: React.FC<PermissionCardProps> = ({
  permission,
  onResponse
}) => {
  const { t } = useI18n();
  const [isResponding, setIsResponding] = React.useState(false);
  const [hasResponded, setHasResponded] = React.useState(false);
  const respondToPermission = sessionActions.respondToPermission;
  const sessions = useSessions();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const isWorkMode = useProductModeStore((state) => state.mode === 'work');
  const isFromSubagent = React.useMemo(() => {
    if (!currentSessionId || permission.sessionID === currentSessionId) return false;
    const sourceSession = sessions.find((session) => session.id === permission.sessionID);
    return Boolean(sourceSession?.parentID && sourceSession.parentID === currentSessionId);
  }, [permission.sessionID, currentSessionId, sessions]);

  const handleResponse = async (response: PermissionResponse) => {
    setIsResponding(true);

    try {
      await respondToPermission(permission.sessionID, permission.id, response);
      setHasResponded(true);
      onResponse?.(response);
    } catch (error) {
      console.error('[PermissionCard] Failed to respond to permission:', error);
    } finally {
      setIsResponding(false);
    }
  };

  if (hasResponded) {
    return null;
  }

  const toolName = permission.permission || 'unknown';
  const tool = toolName.toLowerCase();
  const isBashTool = tool === 'bash' || tool === 'shell' || tool === 'shell_command';

  const getMeta = (key: string, fallback: string = ''): string => {
    const val = permission.metadata[key];
    return typeof val === 'string' ? val : (typeof val === 'number' ? String(val) : fallback);
  };
  const getMetaNum = (key: string): number | undefined => {
    const val = permission.metadata[key];
    return typeof val === 'number' ? val : undefined;
  };
  const getMetaBool = (key: string): boolean => {
    const val = permission.metadata[key];
    return Boolean(val);
  };
  const displayToolName = getToolDisplayName(toolName, isWorkMode);
  const bashCommand = isBashTool
    ? getMeta('command') || getMeta('cmd') || getMeta('script')
    : '';
  const visiblePatterns = getVisiblePermissionPatterns(permission.patterns, bashCommand);

  const renderToolContent = () => {

    if (isBashTool) {
      const description = getMeta('description');
      const workingDir = getMeta('cwd') || getMeta('working_directory') || getMeta('directory') || getMeta('path');
      const timeout = getMetaNum('timeout');
 
      return (
        <>
          {description && (
            <div className="typography-meta text-muted-foreground mb-2">{description}</div>
          )}
          {workingDir && (
            <div className="typography-meta text-muted-foreground mb-2">
              <span className="font-semibold">{t('chat.permissionCard.workingDirectory')}</span> <code className="px-1 py-0.5 bg-muted/30 rounded">{workingDir}</code>
            </div>
          )}
          {timeout && (
            <div className="typography-meta text-muted-foreground mb-2">
              <span className="font-semibold">{t('chat.permissionCard.timeout')}</span> {timeout}ms
            </div>
          )}
          {}
          {bashCommand && (
            <div>
              <WorkerHighlightedCode
                language="bash"
                code={bashCommand}
                style={PERMISSION_BASH_CUSTOM_STYLE}
                codeStyle={PERMISSION_BASH_CODE_TAG_PROPS.style}
                wrap
              />
            </div>
          )}
        </>
      );
    }

    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
      const filePath = getMeta('path') || getMeta('file_path') || getMeta('filename') || getMeta('filePath');
      const changes = getMeta('changes') || getMeta('diff');
      const replaceAll = getMetaBool('replace_all') || getMetaBool('replaceAll');

      return (
        <>
          {replaceAll ? (
            <div className="mb-2 flex items-center gap-1.5 typography-meta text-[var(--status-warning)]">
              <Icon name="error-warning" className="size-3.5" />
              <span>{t('chat.permissionCard.replaceAllOccurrences')}</span>
            </div>
          ) : null}
          {changes && (
            <ScrollableOverlay outerClassName="max-h-[60vh]" className="tool-output-surface p-1 rounded-xl border border-border/20 bg-transparent">
              <DiffPreview diff={changes} filePath={filePath} />
            </ScrollableOverlay>
          )}
        </>
      );
    }

    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
      const filePath = getMeta('path') || getMeta('file_path') || getMeta('filename') || getMeta('filePath');
      const content = getMeta('content') || getMeta('text') || getMeta('data');

      if (content) {
        return (
          <ScrollableOverlay outerClassName="max-h-[60vh]" className="tool-output-surface p-1 rounded-xl border border-border/20 bg-transparent">
            <WritePreview content={content} filePath={filePath} />
          </ScrollableOverlay>
        );
      }

      return null;
    }

    if (tool === 'webfetch' || tool === 'fetch' || tool === 'curl' || tool === 'wget') {
      const url = getMeta('url') || getMeta('uri') || getMeta('endpoint');
      const method = getMeta('method') || 'GET';
      const headers = permission.metadata.headers && typeof permission.metadata.headers === 'object' ? (permission.metadata.headers as Record<string, unknown>) : undefined;
      const body = getMeta('body') || getMeta('data') || getMeta('payload');
      const timeout = getMetaNum('timeout');
      const format = getMeta('format') || getMeta('responseType');

      return (
        <>
          {url && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.request')}</div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-[var(--surface-muted)] px-1.5 py-0.5 typography-meta font-semibold text-foreground">
                  {method}
                </span>
                <code className="typography-meta px-2 py-1 bg-muted/30 rounded-md flex-1 break-all">
                  {url}
                </code>
              </div>
            </div>
          )}
          {headers && Object.keys(headers).length > 0 && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.headers')}</div>
              <ScrollableOverlay outerClassName="max-h-24" className="p-0">
                <WorkerHighlightedCode
                  language="json"
                  code={JSON.stringify(headers, null, 2)}
                  style={PERMISSION_JSON_CUSTOM_STYLE}
                  wrap
                />
              </ScrollableOverlay>
            </div>
          )}
          {body && (
            <div className="mb-2">
              <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.body')}</div>
              <ScrollableOverlay outerClassName="max-h-32" className="p-0">
                <WorkerHighlightedCode
                  language={typeof body === 'object' ? 'json' : 'text'}
                  code={typeof body === 'object' ? JSON.stringify(body, null, 2) : String(body)}
                  style={PERMISSION_JSON_CUSTOM_STYLE}
                  wrap
                />
              </ScrollableOverlay>
            </div>
          )}
          {(timeout || format) && (
            <div className="typography-meta flex flex-wrap items-center gap-x-2 text-muted-foreground">
              {timeout ? <span>{t('chat.permissionCard.timeout')} {timeout}ms</span> : null}
              {format ? <code className="font-mono text-foreground/70">{format}</code> : null}
            </div>
          )}
        </>
      );
    }

    const genericContent = getMeta('command') || getMeta('content') || getMeta('action') || getMeta('operation');
    const description = getMeta('description');

    return (
      <>
        {description && (
          <div className="typography-meta text-muted-foreground mb-2">{description}</div>
        )}
        {genericContent && (
          <div className="mb-2">
            <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.action')}</div>
            <ScrollableOverlay outerClassName="max-h-32" className="p-0">
              <pre className="typography-meta font-mono px-2 py-1 bg-muted/30 rounded-md whitespace-pre-wrap break-all">
                {String(genericContent)}
              </pre>
            </ScrollableOverlay>
          </div>
        )}
        {}
        {Object.keys(permission.metadata).length > 0 && !genericContent && !description && (
          <div>
            <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.details')}</div>
            <ScrollableOverlay outerClassName="max-h-32" className="p-0">
              <pre className="typography-meta font-mono px-2 py-1 bg-muted/30 rounded-md whitespace-pre-wrap break-all">
                {JSON.stringify(permission.metadata, null, 2)}
              </pre>
            </ScrollableOverlay>
          </div>
        )}
      </>
    );
  };

  return (
    <ChatRequestCard
      icon="shield-keyhole"
      tone="warning"
      title={t('sessions.sidebar.session.status.permissionRequired')}
      meta={(
        <>
          {getToolIcon(toolName)}
          <span className="truncate">{displayToolName}</span>
        </>
      )}
      aside={isFromSubagent ? (
        <span className="typography-micro text-muted-foreground">{t('chat.questionCard.fromSubagent')}</span>
      ) : null}
      footer={(
        <>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={() => handleResponse('once')}
            disabled={isResponding}
            className="w-full sm:w-auto"
          >
            <Icon name="check" className="size-3.5" />
            {t('chat.permissionRequest.actions.once')}
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleResponse('always')}
            disabled={isResponding}
            className="w-full sm:w-auto"
          >
            <Icon name="time" className="size-3.5" />
            <span className="max-w-[220px] truncate">
              {t('chat.permissionRequest.actions.always')}
              {permission.always.length > 0 ? ` · ${permission.always.slice(0, 2).join(', ')}` : ''}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => handleResponse('reject')}
            disabled={isResponding}
            className="w-full text-muted-foreground hover:text-[var(--status-error)] sm:w-auto"
          >
            <Icon name="close" className="size-3.5" />
            {t('chat.permissionRequest.actions.reject')}
          </Button>

          {isResponding && (
            <div className="flex w-full justify-center py-1 text-muted-foreground sm:ml-auto sm:w-auto sm:py-0">
              <Icon name="loader-4" className="size-3.5 animate-spin" />
            </div>
          )}
        </>
      )}
    >
      {visiblePatterns.length > 0 && (
        <div className="mb-2">
          <div className="typography-meta text-muted-foreground mb-1">{t('chat.permissionCard.patterns')}</div>
          <code className="typography-meta px-2 py-1 bg-muted/30 rounded-md block break-all">
            {visiblePatterns.join(", ")}
          </code>
        </div>
      )}

      {renderToolContent()}
    </ChatRequestCard>
  );
};
