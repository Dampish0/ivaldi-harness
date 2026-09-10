/** Kills autocorrect/autocomplete on URL/token/password fields — mobile keyboards
    mangle those values otherwise. */
export const mobileInputKeyboardProps = {
  autoComplete: 'off',
  autoCorrect: 'off',
  spellCheck: false,
} as const;

export const mobileConnectionInputClass = 'h-11 w-full rounded-md border border-border/70 bg-surface-elevated px-3 text-[16px] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[var(--interactive-border)] focus:ring-2 focus:ring-[var(--interactive-focus-ring)]';
