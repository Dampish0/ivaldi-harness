import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Radio } from '@/components/ui/radio';
import { Button } from '@/components/ui/button';
import { Icon } from "@/components/icon/Icon";

import { cn } from '@/lib/utils';
import { isIMECompositionEvent } from '@/lib/ime';
import { copyTextToClipboard } from '@/lib/clipboard';
import { toast } from '@/components/ui';
import type { QuestionRequest } from '@/types/question';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import * as sessionActions from '@/sync/session-actions';
import { useI18n } from '@/lib/i18n';
import { serializeQuestionAsJson, serializeQuestionAsMarkdown } from './questionSerializers';
import { QUESTION_CUSTOM_TEXTAREA_MIN_HEIGHT, getQuestionCustomTextareaHeight } from './questionTextareaSizing';

interface QuestionCardProps {
  question: QuestionRequest;
}

type TabKey = string;
const SUMMARY_TAB = 'summary';

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
        'w-full resize-none rounded border border-[var(--interactive-border)] bg-transparent px-2 py-1 typography-meta text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-[var(--interactive-border-focus)]',
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

  return (
    <div className="group w-full pt-0 pb-2">
      <div className="chat-column">
        <div className="-mt-1 border-l-2 border-[var(--interactive-border-focus)] py-1 pl-3">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <Icon name="question" className="size-3.5 shrink-0 text-[var(--status-info)]" />
            <span className="typography-meta font-medium text-foreground">{t('chat.questionCard.inputNeeded')}</span>
            {activeHeader ? (
              <span className="typography-micro min-w-0 truncate text-muted-foreground">{activeHeader}</span>
            ) : null}
            {isFromSubagent ? (
              <span className="typography-micro ml-auto shrink-0 text-muted-foreground">
                {t('chat.questionCard.fromSubagent')}
              </span>
            ) : null}
            <div className={cn('flex shrink-0 items-center gap-0.5', isFromSubagent ? null : 'ml-auto')}>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyMarkdown}
                  title={t('chat.questionCard.copyMarkdown')}
                  aria-label={t('chat.questionCard.copyMarkdown')}
                  className="size-6 p-0 text-muted-foreground"
                >
                  <Icon name="file-text" className="h-3 w-3" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={handleCopyJson}
                  title={t('chat.questionCard.copyJson')}
                  aria-label={t('chat.questionCard.copyJson')}
                  className="size-6 p-0 text-muted-foreground"
                >
                  <Icon name="code-box" className="h-3 w-3" />
                </Button>
            </div>
          </div>

          <div className="pr-1">
            {/* Minimal inline tabs for multiple questions */}
            {tabs.length > 1 ? (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.value;
                  const isSummary = tab.value === SUMMARY_TAB;
                  const tabIndex = isSummary ? -1 : Number(tab.value);
                  const isAnswered = !isSummary && Number.isFinite(tabIndex) && !unansweredIndexes.includes(tabIndex);
                  return (
                    <button
                      key={tab.value}
                      type="button"
                      onClick={() => setActiveTab(tab.value)}
                      className={cn(
                        'px-2 py-0.5 typography-meta font-medium rounded transition-colors flex items-center gap-1',
                        isActive
                          ? 'bg-interactive-selection text-interactive-selection-foreground'
                          : isSummary
                            ? 'text-muted-foreground hover:text-foreground hover:bg-interactive-hover/20'
                            : isAnswered
                              ? 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-interactive-hover/20'
                              : 'text-foreground/85 hover:text-foreground hover:bg-interactive-hover/20'
                      )}
                    >
                      {isSummary ? <Icon name="list-check-3" className="h-3 w-3" /> : null}
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {/* Summary view */}
            {isSummaryTab ? (
              <div className="space-y-2">
                {questions.map((q, index) => {
                  const answer = getAnswerDisplay(index);
                  const hasAnswer = answer !== t('chat.questionCard.noAnswer');
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setActiveTab(String(index))}
                      className="w-full text-left rounded px-1.5 py-1 hover:bg-interactive-hover/20 transition-colors"
                    >
                      <div className="typography-micro text-muted-foreground">{q.header || t('chat.questionCard.questionFallback', { index: index + 1 })}</div>
                      <div className={cn(
                        'typography-meta',
                        hasAnswer ? 'text-foreground' : 'text-muted-foreground/50 italic'
                      )}>
                        {answer}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : activeQuestion ? (
              <>
                <div className="typography-meta font-medium text-foreground mb-1.5">{activeQuestion.question}</div>

                {isMultiple ? (
                  <div className="typography-micro text-muted-foreground mb-1.5">{t('chat.questionCard.selectMultiple')}</div>
                ) : null}

                <div className="space-y-0.5">
                  {activeQuestion.options.map((option, index) => {
                    const selected = selectedForActive.includes(option.label);
                    const recommended = /\(recommended\)/i.test(option.label);

                    return (
                      <button
                        key={`${index}:${option.label}`}
                        type="button"
                        onClick={() => handleToggleOption(option.label)}
                        disabled={isResponding}
                        className={cn(
                          'w-full px-1.5 py-1 text-left rounded transition-colors',
                          'hover:bg-interactive-hover/30',
                          selected ? 'bg-interactive-selection text-interactive-selection-foreground' : null,
                          isResponding ? 'opacity-60 cursor-not-allowed' : null
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5 shrink-0">
                            {isMultiple ? (
                              <Checkbox
                                checked={selected}
                                onChange={() => handleToggleOption(option.label)}
                                disabled={isResponding}
                              />
                            ) : (
                              <Radio
                                checked={selected}
                                onChange={() => handleToggleOption(option.label)}
                                disabled={isResponding}
                              />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className={cn(
                                'typography-meta break-all',
                                selected ? 'font-medium text-interactive-selection-foreground' : 'text-foreground/80'
                              )}>
                                {option.label}
                              </span>
                              {recommended ? (
                                <span className={cn(
                                  'typography-micro',
                                  selected ? 'text-interactive-selection-foreground/70' : 'text-muted-foreground',
                                )}>{t('chat.questionCard.recommended')}</span>
                              ) : null}
                            </div>
                            {option.description ? (
                              <div className="typography-micro text-muted-foreground break-words">{option.description}</div>
                            ) : null}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Custom answer option */}
                  <button
                    type="button"
                    onClick={handleSelectCustom}
                    disabled={isResponding}
                    className={cn(
                      'w-full px-1.5 py-1 text-left rounded transition-colors',
                      'hover:bg-interactive-hover/30',
                      isCustomActive ? 'bg-interactive-selection text-interactive-selection-foreground' : null,
                      isResponding ? 'opacity-60 cursor-not-allowed' : null
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Icon name="edit" className={cn(
                        'h-3.5 w-3.5',
                        isCustomActive ? 'text-interactive-selection-foreground' : 'text-muted-foreground/50'
                      )} />
                      <span className={cn(
                        'typography-meta',
                        isCustomActive ? 'font-medium text-interactive-selection-foreground' : 'text-muted-foreground'
                      )}>
                        {t('chat.questionCard.other')}
                      </span>
                    </div>
                  </button>

                  {isCustomActive ? (
                    <div className="pl-6 pr-1 pt-0.5">
                      <CustomAnswerTextarea
                        value={customTextRef.current[activeIndex] ?? ''}
                        onValueChange={handleCustomValueChange}
                        placeholder={t('chat.questionCard.yourAnswer')}
                        disabled={isResponding}
                        onKeyDown={handleKeyDown}
                      />
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={requiredSatisfied ? handleConfirm : handleNextUnanswered}
              disabled={isResponding}
            >
              {requiredSatisfied ? <Icon name="check" className="h-3 w-3" /> : <Icon name="arrow-right-s" className="h-3 w-3" />}
              {requiredSatisfied ? t('chat.questionCard.submit') : t('chat.questionCard.next')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              disabled={isResponding}
              className="text-muted-foreground hover:text-[var(--status-error)]"
            >
              <Icon name="close" className="h-3 w-3" />
              {t('chat.questionCard.dismiss')}
            </Button>

            {isResponding ? (
              <div className="ml-auto text-muted-foreground">
                <Icon name="loader-4" className="size-3.5 animate-spin" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
