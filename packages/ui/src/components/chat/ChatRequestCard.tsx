import React from 'react';
import { Icon } from '@/components/icon/Icon';
import type { IconName } from '@/components/icon/icons';
import { cn } from '@/lib/utils';

interface ChatRequestCardProps {
  icon: IconName;
  tone: 'info' | 'warning';
  title: React.ReactNode;
  /** Shown after the title, for example the tool name or the question topic. */
  meta?: React.ReactNode;
  /** Right side of the header, for example "From a helper" or copy buttons. */
  aside?: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Card for chat requests that wait on the user, such as questions and permission
 * prompts. It uses the composer's surface so these requests read as part of the chat.
 */
export const ChatRequestCard: React.FC<ChatRequestCardProps> = ({ icon, tone, title, meta, aside, footer, children }) => (
  <div className="group w-full pt-1 pb-3">
    <div className="chat-column">
      <section className="rounded-xl border border-border/60 bg-[var(--surface-elevated)] px-4 pt-3 pb-3.5">
        <header className="mb-3 flex min-h-6 min-w-0 items-center gap-2">
          <Icon
            name={icon}
            className={cn('size-4 shrink-0', tone === 'warning' ? 'text-[var(--status-warning)]' : 'text-[var(--status-info)]')}
          />
          <span className="typography-ui-label shrink-0 font-semibold text-foreground">{title}</span>
          {meta ? <span className="inline-flex min-w-0 items-center gap-1.5 typography-meta text-muted-foreground">{meta}</span> : null}
          {aside ? <div className="ml-auto flex shrink-0 items-center gap-1">{aside}</div> : null}
        </header>
        {children}
        <footer className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{footer}</footer>
      </section>
    </div>
  </div>
);
