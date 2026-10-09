import React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";

import { cn } from '@/lib/utils';
import { isIMECompositionEvent } from '@/lib/ime';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from '@/components/ui';
import type { QuestionRequest } from '@/types/question';
import { useUIStore } from '@/stores/useUIStore';
import { useProductModeStore } from '@/stores/useProductModeStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import * as sessionActions from '@/sync/session-actions';
import { useI18n } from '@/lib/i18n';
import { serializeQuestionAsJson, serializeQuestionAsMarkdown } from './questionSerializers';
import { QUESTION_CUSTOM_TEXTAREA_MIN_HEIGHT, getQuestionCustomTextareaHeight } from './questionTextareaSizing';
import { ChatRequestCard } from './ChatRequestCard';

interface QuestionCardProps {
  question: QuestionRequest;
}

type TabKey = string;
const SUMMARY_TAB = 'summary';
const RECOMMENDED_PATTERN = /\s*\(recommended\)\s*/i;

const OPTION_ROW_CLASS = 'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60';
const OPTION_ROW_IDLE_CLASS = 'border-border/60 text-foreground hover:bg-interactive-hover';
const OPTION_ROW_SELECTED_CLASS = 'border-[color-mix(in_srgb,var(--primary-base)_45%,var(--interactive-border))] bg-interactive-selection text-interactive-selection-foreground';

// Decorative radio or checkbox mark. The whole option row is the control.
const OptionIndicator: React.FC<{ multiple: boolean; selected: boolean }> = ({ multiple, selected }) => (
  <span
    aria-hidden="true"
    className={cn(
      'mt-0.5 flex size-4 shrink-0 items-center justify-center border transition-colors',
      multiple ? 'rounded-sm' : 'rounded-full',
      selected
        ? 'border-[var(--primary-base)] bg-[var(--primary-base)] text-[var(--primary-foreground)]'
        : 'border-[var(--interactive-border)] bg-[var(--surface-background)]',
    )}
  >
    {selected ? (multiple ? <Icon name="check" className="size-3" /> : <span className="size-1.5 rounded-full bg-current" />) : null}
  </span>
);

interface CustomAnswerTextareaProps {
  value: string;
  placeholder: string;
  disabled: boolean;
  onValueChange: (value: string) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const CustomAnswerTextarea = React.memo(function CustomAnswerTextarea({
  value,
  placeholder,
  disabled,
  onValueChange,
  onKeyDown,
}: CustomAnswerTextareaProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [localValue, setLocalValue] = React.useState(value);
  const [height, setHeight] = React.useState(QUESTION_CUSTOM_TEXTAREA_MIN_HEIGHT);
  const [isScrollable, setIsScrollable] = React.useState(false);

  React.useEffect(() => {
    setLocalValue(value);
  }, [value]);

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const nextHeight = getQuestionCustomTextareaHeight({
      scrollHeight: textarea.scrollHeight,
      currentHeight: height,
    });
    const nextScrollable = textarea.scrollHeight > (nextHeight ?? height);
    if (isScrollable !== nextScrollable) {
      setIsScrollable(nextScrollable);
    }
    if (nextHeight !== null) {
      setHeight(nextHeight);
    }
  }, [height, isScrollable, localValue]);

  return (
    <textarea
      ref={textareaRef}
      value={localValue}
      onChange={(event) => {
        const nextValue = event.target.value;
        setLocalValue(nextValue);
        onValueChange(nextValue);
      }}
      placeholder={placeholder}
      disabled={disabled}
      rows={2}
      onKeyDown={onKeyDown}
      style={{ height }}
      className={cn(
        'w-full resize-none rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-background)] px-3 py-2 typography-ui-label text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-[var(--interactive-border-focus)]',
        isScrollable ? 'overflow-y-auto' : 'overflow-hidden'
      )}
      autoFocus
    />
  );
});

export const QuestionCard: React.FC<QuestionCardProps> = ({ question }) => {
  const { t } = useI18n();
  const respondToQuestion = sessionActions.respondToQuestion;
  const rejectQuestion = sessionActions.rejectQuestion;
  const isMobile = useUIStore((state) => state.isMobile);
  const isWorkMode = useProductModeStore((state) => state.mode === 'work');
  const sessions = useSessions();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const isFromSubagent = React.useMemo(() => {
    if (!currentSessionId || question.sessionID === currentSessionId) return false;
    const sourceSession = sessions.find((session) => session.id === question.sessionID);
    return Boolean(sourceSession?.parentID && sourceSession.parentID === currentSessionId);
  }, [question.sessionID, currentSessionId, sessions]);
  const [activeTab, setActiveTab] = React.useState<TabKey>('0');
  const [isResponding, setIsResponding] = React.useState(false);
  const [hasResponded, setHasResponded] = React.useState(false);

  const [selectedOptions, setSelectedOptions] = React.useState<Record<number, string[]>>({});
  const [customMode, setCustomMode] = React.useState<Record<number, boolean>>({});
  const customTextRef = React.useRef<Record<number, string>>({});
  const [customTextFilled, setCustomTextFilled] = React.useState<Record<number, boolean>>({});

  const questions = React.useMemo(() => question.questions ?? [], [question.questions]);
  const isSummaryTab = activeTab === SUMMARY_TAB;
  const activeIndex = isSummaryTab ? -1 : Math.max(0, Math.min(questions.length - 1, Number(activeTab) || 0));
  const activeQuestion = isSummaryTab ? null : questions[activeIndex];
  const activeHeader = React.useMemo(() => {
    if (isSummaryTab) return null;
    const header = activeQuestion?.header?.trim();
    return header && header.length > 0 ? header : null;
  }, [activeQuestion?.header, isSummaryTab]);

  React.useEffect(() => {
    setActiveTab('0');
    setSelectedOptions({});
    setCustomMode({});
    customTextRef.current = {};
    setCustomTextFilled({});
    setHasResponded(false);
  }, [question.id]);

  const tabs = React.useMemo(() => {
    const questionTabs = questions.map((q, index) => ({
      value: String(index),
      label: q.header?.trim() || `Q${index + 1}`,
    }));
    // Add summary tab when multiple questions
    if (questions.length > 1) {
      questionTabs.push({ value: SUMMARY_TAB, label: t('chat.questionCard.summaryTab') });
    }
    return questionTabs;
  }, [questions, t]);

  // Helper to get answer display for a question index
  const getAnswerDisplay = React.useCallback((index: number): string => {
    const isCustom = Boolean(customMode[index]);
    if (isCustom) {
      const value = (customTextRef.current[index] ?? '').trim();
      return value || t('chat.questionCard.noAnswer');
    }
    const answers = selectedOptions[index] ?? [];
    return answers.length > 0 ? answers.join(', ') : t('chat.questionCard.noAnswer');
  }, [customMode, selectedOptions, t]);

  const isMultiple = Boolean(activeQuestion?.multiple);
  const selectedForActive = selectedOptions[activeIndex] ?? [];
  const isCustomActive = Boolean(customMode[activeIndex]);

  const unansweredIndexes = React.useMemo(() => {
    const pending: number[] = [];
    for (let index = 0; index < questions.length; index += 1) {
      const isCustom = Boolean(customMode[index]);
      if (isCustom) {
        if (!customTextFilled[index]) pending.push(index);
        continue;
      }

      const answers = selectedOptions[index] ?? [];
      if (answers.length === 0) {
        pending.push(index);
      }
    }
    return pending;
  }, [customMode, customTextFilled, questions.length, selectedOptions]);

  const requiredSatisfied = React.useMemo(() => {
    if (questions.length === 0) return false;
    return unansweredIndexes.length === 0;
  }, [questions.length, unansweredIndexes.length]);

  const handleNextUnanswered = React.useCallback(() => {
    if (questions.length === 0 || unansweredIndexes.length === 0) return;

    const start = isSummaryTab ? -1 : activeIndex;
    for (let offset = 1; offset <= questions.length; offset += 1) {
      const candidate = (start + offset + questions.length) % questions.length;
      if (unansweredIndexes.includes(candidate)) {
        setActiveTab(String(candidate));
        return;
      }
    }

    setActiveTab(String(unansweredIndexes[0]));
  }, [activeIndex, isSummaryTab, questions.length, unansweredIndexes]);

  const buildAnswersPayload = React.useCallback((): string[][] => {
    const answers: string[][] = [];

    for (let index = 0; index < questions.length; index += 1) {
      const isCustom = Boolean(customMode[index]);
      if (isCustom) {
        const value = (customTextRef.current[index] ?? '').trim();
        answers.push(value ? [value] : []);
        continue;
      }

      answers.push(selectedOptions[index] ?? []);
    }

    return answers;
  }, [customMode, questions.length, selectedOptions]);

  const handleToggleOption = React.useCallback(
    (label: string) => {
      if (!activeQuestion) return;

      setCustomMode((prev) => ({ ...prev, [activeIndex]: false }));
      setCustomTextFilled((prev) => (prev[activeIndex] ? { ...prev, [activeIndex]: false } : prev));

      setSelectedOptions((prev) => {
        const current = prev[activeIndex] ?? [];
        if (isMultiple) {
          const exists = current.includes(label);
          const next = exists ? current.filter((item) => item !== label) : [...current, label];
          return { ...prev, [activeIndex]: next };
        }
        return { ...prev, [activeIndex]: [label] };
      });
    },
    [activeIndex, activeQuestion, isMultiple]
  );

  const handleSelectCustom = React.useCallback(() => {
    setCustomMode((prev) => ({ ...prev, [activeIndex]: true }));
    setSelectedOptions((prev) => ({ ...prev, [activeIndex]: [] }));
    const hasValue = (customTextRef.current[activeIndex] ?? '').trim().length > 0;
    setCustomTextFilled((prev) => (prev[activeIndex] === hasValue ? prev : { ...prev, [activeIndex]: hasValue }));
  }, [activeIndex]);

  const handleCustomValueChange = React.useCallback((value: string) => {
    customTextRef.current[activeIndex] = value;
    const hasValue = value.trim().length > 0;
    setCustomTextFilled((prev) => (prev[activeIndex] === hasValue ? prev : { ...prev, [activeIndex]: hasValue }));
  }, [activeIndex]);

  const handleConfirm = React.useCallback(async () => {
    if (!requiredSatisfied) return;

    setIsResponding(true);
    try {
      const answers = buildAnswersPayload();
      await respondToQuestion(question.sessionID, question.id, answers);
      setHasResponded(true);
    } catch (error) {
      if (sessionActions.isQuestionRequestNotFoundError(error)) {
        toast.info(t('chat.questionCard.noLongerPending'));
        setHasResponded(true);
      } else {
        toast.error(t('chat.questionCard.submitFailed'), {
          description: t('chat.questionCard.tryAgain'),
        });
      }
    } finally {
      setIsResponding(false);
    }
  }, [buildAnswersPayload, question.id, question.sessionID, requiredSatisfied, respondToQuestion, t]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isIMECompositionEvent(e)) return;

      if (e.key === 'Enter' && !e.shiftKey && (!isMobile || e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (requiredSatisfied) {
          handleConfirm();
        } else {
          handleNextUnanswered();
        }
      }
    },
    [handleConfirm, handleNextUnanswered, isMobile, requiredSatisfied]
  );

  const handleDismiss = React.useCallback(async () => {
    setIsResponding(true);
    try {
      await rejectQuestion(question.sessionID, question.id);
      setHasResponded(true);
    } catch (error) {
      if (sessionActions.isQuestionRequestNotFoundError(error)) {
        toast.info(t('chat.questionCard.noLongerPending'));
        setHasResponded(true);
      } else {
        toast.error(t('chat.questionCard.dismissFailed'), {
          description: t('chat.questionCard.tryAgain'),
        });
      }
    } finally {
      setIsResponding(false);
    }
  }, [question.id, question.sessionID, rejectQuestion, t]);

  const handleCopyMarkdown = React.useCallback(async () => {
    const text = serializeQuestionAsMarkdown(question);
    const result = await copyTextToClipboard(text);
    if (result.ok) {
      toast.success(t('chat.questionCard.copiedMarkdown'));
      return;
    }
    toast.error(t('chat.questionCard.copyFailed'));
  }, [question, t]);

  const handleCopyJson = React.useCallback(async () => {
    const text = serializeQuestionAsJson(question);
    const result = await copyTextToClipboard(text);
    if (result.ok) {
      toast.success(t('chat.questionCard.copiedJson'));
      return;
    }
    toast.error(t('chat.questionCard.copyFailed'));
  }, [question, t]);

  if (hasResponded || questions.length === 0) {
    return null;
  }

  const copyActions = isWorkMode ? null : (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleCopyMarkdown}
        title={t('chat.questionCard.copyMarkdown')}
        aria-label={t('chat.questionCard.copyMarkdown')}
        className="text-muted-foreground"
      >
        <Icon name="file-text" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={handleCopyJson}
        title={t('chat.questionCard.copyJson')}
        aria-label={t('chat.questionCard.copyJson')}
        className="text-muted-foreground"
      >
        <Icon name="code-box" />
      </Button>
    </>
  );

  return (
    <ChatRequestCard
      icon="question"
      tone="info"
      title={t('chat.questionCard.inputNeeded')}
      meta={tabs.length > 1 || !activeHeader ? null : <span className="truncate">{activeHeader}</span>}
      aside={isFromSubagent || copyActions ? (
        <>
          {isFromSubagent ? (
            <span className="typography-micro mr-1 text-muted-foreground">{t('chat.questionCard.fromSubagent')}</span>
          ) : null}
          {copyActions}
        </>
      ) : null}
      footer={(
        <>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={requiredSatisfied ? handleConfirm : handleNextUnanswered}
            disabled={isResponding}
            className="w-full sm:w-auto"
          >
            {requiredSatisfied ? <Icon name="check" className="size-3.5" /> : <Icon name="arrow-right-s" className="size-3.5" />}
            {requiredSatisfied ? t('chat.questionCard.submit') : t('chat.questionCard.next')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={isResponding}
            className="w-full text-muted-foreground sm:w-auto"
          >
            {t('chat.questionCard.dismiss')}
          </Button>
          {isResponding ? (
            <div className="flex justify-center text-muted-foreground sm:ml-auto">
              <Icon name="loader-4" className="size-3.5 animate-spin" />
            </div>
          ) : null}
        </>
      )}
    >
      {tabs.length > 1 ? (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const isSummary = tab.value === SUMMARY_TAB;
            const tabIndex = isSummary ? -1 : Number(tab.value);
            const isAnswered = !isSummary && Number.isFinite(tabIndex) && !unansweredIndexes.includes(tabIndex);
            return (
              <Button
                key={tab.value}
                type="button"
                variant="chip"
                size="xs"
                aria-pressed={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
              >
                {isSummary ? <Icon name="list-check-3" /> : null}
                {isAnswered ? <Icon name="check" /> : null}
                {tab.label}
              </Button>
            );
          })}
        </div>
      ) : null}

      {isSummaryTab ? (
        <div className="space-y-1.5">
          {questions.map((q, index) => {
            const answer = getAnswerDisplay(index);
            const hasAnswer = answer !== t('chat.questionCard.noAnswer');
            return (
              <button
                key={index}
                type="button"
                onClick={() => setActiveTab(String(index))}
                className="w-full rounded-lg border border-border/60 px-3 py-2 text-left transition-colors hover:bg-interactive-hover"
              >
                <div className="typography-meta text-muted-foreground">{q.header || t('chat.questionCard.questionFallback', { index: index + 1 })}</div>
                <div className={cn('typography-ui-label', hasAnswer ? 'text-foreground' : 'italic text-muted-foreground')}>
                  {answer}
                </div>
              </button>
            );
          })}
        </div>
      ) : activeQuestion ? (
        <>
          <p className="typography-ui-header font-medium text-foreground">{activeQuestion.question}</p>
          {isMultiple ? (
            <p className="typography-meta mt-0.5 text-muted-foreground">{t('chat.questionCard.selectMultiple')}</p>
          ) : null}

          <div
            role={isMultiple ? 'group' : 'radiogroup'}
            aria-label={activeQuestion.question}
            className="mt-3 space-y-1.5"
          >
            {activeQuestion.options.map((option, index) => {
              const selected = selectedForActive.includes(option.label);
              const recommended = RECOMMENDED_PATTERN.test(option.label);
              const label = recommended ? option.label.replace(RECOMMENDED_PATTERN, ' ').trim() || option.label : option.label;

              return (
                <button
                  key={`${index}:${option.label}`}
                  type="button"
                  role={isMultiple ? 'checkbox' : 'radio'}
                  aria-checked={selected}
                  onClick={() => handleToggleOption(option.label)}
                  disabled={isResponding}
                  className={cn(OPTION_ROW_CLASS, selected ? OPTION_ROW_SELECTED_CLASS : OPTION_ROW_IDLE_CLASS)}
                >
                  <OptionIndicator multiple={isMultiple} selected={selected} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={cn('typography-ui-label break-words', selected ? 'font-medium' : null)}>{label}</span>
                      {recommended ? (
                        <span className="rounded-full border border-border/60 px-1.5 typography-micro text-muted-foreground">
                          {t('chat.questionCard.recommended')}
                        </span>
                      ) : null}
                    </span>
                    {option.description ? (
                      <span className="typography-meta mt-0.5 block break-words text-muted-foreground">{option.description}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              role={isMultiple ? 'checkbox' : 'radio'}
              aria-checked={isCustomActive}
              onClick={handleSelectCustom}
              disabled={isResponding}
              className={cn(OPTION_ROW_CLASS, isCustomActive ? OPTION_ROW_SELECTED_CLASS : OPTION_ROW_IDLE_CLASS)}
            >
              <OptionIndicator multiple={isMultiple} selected={isCustomActive} />
              <span className={cn('typography-ui-label', isCustomActive ? 'font-medium' : 'text-muted-foreground')}>
                {t('chat.questionCard.other')}
              </span>
            </button>

            {isCustomActive ? (
              <CustomAnswerTextarea
                value={customTextRef.current[activeIndex] ?? ''}
                onValueChange={handleCustomValueChange}
                placeholder={t('chat.questionCard.yourAnswer')}
                disabled={isResponding}
                onKeyDown={handleKeyDown}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </ChatRequestCard>
  );
};
