---
name: theme-system
description: Use when creating or modifying OpenChamber UI components, styling, colors, buttons, visual states, themes, or icons.
---

# Theme System

## Core Rules

- Use semantic OpenChamber theme tokens; never hardcode hex colors or generic Tailwind palette colors.
- Use shared UI primitives before introducing feature-local controls.
- Use the shared `Button`; do not create button wrappers such as `ButtonSmall` or `ButtonLarge`.
- Every dropdown-style value-picker trigger takes its chrome from `dropdownTriggerVariants` in `packages/ui/src/components/ui/dropdown-trigger.ts`; call sites add layout classes only. Deliberately chrome-less pickers in composers or headers are the exception.
- Use the sprite-based `Icon`; never import icons directly from `@remixicon/react`.
- Apply hover tokens only to interactive elements.
- Use status colors only for actual status/feedback.
- Use selection tokens for selected state and primary tokens for primary actions.

## Load References By Task

| Task | Required reference |
|---|---|
| Choosing colors/tokens or reviewing styled examples | `references/tokens-and-examples.md` |
| Adding, converting, storing, or generating icons | `references/icons.md` |
| Adding built-in or custom themes | `references/adding-themes.md` |

Load every matching reference before editing. User-facing or accessible text must load `locale-ui-patterns`. Settings composition is owned by `settings-ui-patterns`, which declares `theme-system` as its one-way companion.

## Token Decision

1. Code display -> `syntax.*`
2. Error/warning/success/info -> `status.*`
3. Primary CTA -> `primary.*`
4. Hover/pressed/focus -> `interactive.*`
5. Selected/active state -> `interactive.selection*`
6. Background/text/border layer -> `surface.*` and semantic utility classes

Prefer CSS variables/classes for component styling. Use `useThemeSystem()` only when an API requires resolved color values.

## Button Contract

Use `Button` from `packages/ui/src/components/ui/button.tsx`.

| Variant | Use |
|---|---|
| `default` | Primary local action |
| `outline` | Visible secondary action |
| `secondary` | Soft secondary action |
| `ghost` | Quiet row/toolbar action |
| `destructive` | Destructive action |
| `chip` | Compact selectable option with `aria-pressed` |
| `link` | Rare inline text action |

| Size | Use |
|---|---|
| `xs` | Dense row/list control |
| `sm` | Compact action |
| `default` | Standard action |
| `lg` | Prominent action |
| `icon` | Icon-only square action, 36px |
| `icon-sm` | Icon-only square next to `sm` buttons, 32px |
| `icon-xs` | Icon-only square in dense rows next to `xs` buttons, 24px |

Do not hardcode button height/padding when a size variant exists. Do not recreate selection/destructive styling with ad-hoc classes. Some toolbars still override `sm` or `xs` to `h-7`; do not copy that into new code.

## Shape And Type Scale

- Corners use the radius tokens: `rounded-sm` 4px for checkboxes and tags, `rounded-md` 7px for small controls, `sm` and `xs` buttons and code blocks, `rounded-lg` 9px for default buttons and option rows, `rounded-xl` 12px for cards, popovers and dialogs, `rounded-full` for pills and squircle buttons. Arbitrary values such as `rounded-[9px]` are reserved for icons and thumbnails under 16px.
- Shadows: menus and popovers use `oc-glass-floating`, small floating surfaces use `shadow-float`, and dialogs and cards stay flat.
- Text uses the semantic classes, smallest first: `typography-micro` 12px, `typography-meta` 13px, `typography-ui-label` 14px, `typography-ui-header` 15px. Change `SEMANTIC_TYPOGRAPHY` and the design-system.css defaults together.
- `Input` and `Textarea` use `typography-field`, which is 14px on desktop and the chat size on small screens. A size class passed by the caller still wins. Responsive variants such as `md:typography-ui-label` do nothing, because the typography classes are plain CSS and not Tailwind utilities.
- `text-destructive`, `text-status-error` and `text-[var(--status-error)]` resolve to the same color. Prefer `text-[var(--status-error)]` in new code.
- Chat cards that wait on the user, such as questions and permission prompts, use `ChatRequestCard`.

## Icon Contract

```tsx
import { Icon } from '@/components/icon/Icon';

<Icon name="check" className="size-4" />
```

Use `IconName` for icon values stored in arrays, objects, state, or config. `Icon` has no `size` prop. Run `bun run icons:generate` when introducing a sprite name, and never edit `sprite.ts` manually. Load `references/icons.md` for the complete workflow.

## Animation Contract

Animate only `transform` and `opacity`. Use `transform: rotate(...)`, not the individual `rotate` property. Non-composited properties recalculate style continuously; geometry also triggers layout, and wrappers, `will-change`, `contain`, or stepped timing do not remove that cost. Animate only while conveying live information.

For any other technique, load `performance-engineering` and `scripts/perf/DOCUMENTATION.md`, measure it with `bun run profile:animation`, and add a fixture variant when needed. This skill owns animation styling; `performance-engineering` owns performance evidence.

## Completion Criteria

- Animations are limited to `transform` and `opacity`, or their cost was measured and accepted.
- No hardcoded/palette colors were introduced.
- Buttons use shared variants and sizes.
- Icons use `Icon`/`IconName`, and generated sprite changes are intentional.
- Hover, selection, primary, and status semantics are distinct.
- Light/dark/high-contrast and long-text states remain legible.
- Every applicable contract and loaded task reference was verified with relevant type-check, visual/runtime validation, and generated-asset checks.
