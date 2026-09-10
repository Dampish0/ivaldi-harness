# Design direction contract

Use this reference only when the project blueprint includes a meaningful user-facing visual, interaction, spatial, or presentation design.

`DESIGN_DIRECTION.md` should make two competent implementers converge on the same project character without freezing every detail before implementation begins.

## Capture the design system

Cover the parts that affect implementation:

- product or project personality and visual principles
- reference products, games, tools, screenshots, physical systems, or design systems
- what to borrow from each reference and what to avoid
- information hierarchy and primary shell, scene, workspace, or presentation structure
- navigation or movement model
- page, screen, scene, panel, or composition patterns
- density and spacing rhythm
- radius, borders, shadows, depth, and elevation when relevant
- typography roles and hierarchy
- semantic color and theme direction
- reusable component, asset, or interaction patterns
- iconography direction when it matters
- responsive, mobile, viewport, or form-factor behavior
- accessibility requirements
- motion rules when animation carries state or hierarchy

## Define interaction states

Specify important states rather than only the ideal screenshot:

- default
- hover
- focus
- pressed
- selected
- disabled
- loading
- empty
- success
- warning
- error
- destructive confirmation

Describe how states communicate meaning through layout, text, iconography, motion, and semantic tokens. Avoid one-off colors or effects that have no system role.

## Make references concrete

When the user names an existing product or other reference, convert it into observable decisions.

For each important reference, record:

| Reference | Borrow | Avoid |
| --- | --- | --- |
| Product, game, tool, screenshot, or physical reference | Specific layout, density, navigation, composition, component, typography, interaction, or material behavior | Specific behavior or visual trait that does not fit this project |

For example, "ChatGPT/Codex style" is incomplete by itself. The design direction should state the intended sidebar density, content width, composer treatment, border strength, icon style, hover behavior, typography hierarchy, dark-mode behavior, and how much chrome should remain visible during focused work.

## Keep implementation freedom where it helps

Define invariants and reusable patterns. Leave ordinary spacing adjustments and local composition choices to implementation unless they materially change the project character.

The design document should not become a second component library or a list of arbitrary pixel values. Put exact tokens in the owning design-system or implementation source once implementation creates them.

## Completion criterion

The design direction is complete when it answers what the result should look and behave like in concrete terms, how the major structures and interactions are composed, how states behave, and which reference traits are intentionally included or excluded.
