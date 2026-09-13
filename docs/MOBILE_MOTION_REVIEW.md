# Mobile motion review

12 September 2026. This follows publication of Android preview 2 at commit
`561c0fbef5154c123aa4d377f1539b33a3dbc498`. The broader interface findings are in
[Mobile UX redesign](MOBILE_UX_REDESIGN.md).

## Why the movement still feels wrong

Settings slides in as an empty page. `MobileFullscreenSurface` deliberately
waits for the entry transition before mounting its children, then fades the
content for another 200 milliseconds. The user sees the container arrive and
waits again for the page. The same component disappears immediately on close
because its caller conditionally removes it. Opening and closing therefore
describe two different spatial relationships.

The model picker has the opposite treatment. Its entire overlay fades,
including the text, while the panel travels only 16 pixels. That makes a large
bottom sheet appear to materialize over the chat. Its backdrop and content
should move independently so the sheet remains an opaque, readable object.

Drawers use the same easing on entry and exit. Their decelerating exit leaves
a slow tail while the user is already returning to the conversation. Panels
also schedule two animation frames before reversing an interrupted close,
even though that panel is already painted and can reverse immediately.

Reduced motion is implemented in the newer panel hook but not in the older
fullscreen page implementation. A device preference should govern the whole
navigation sequence.

Cold captures also exposed a delay before animation. The header's menu button
waited 279 to 312 milliseconds between pointer release and click. Mobile buttons
did not consistently opt out of the browser's double-tap delay. The shared
mobile button rules now use `touch-action: manipulation`. This applies to
controls, while conversation text keeps its normal gestures.

## Measurement and acceptance

Measurements use the installed production UI on a Samsung Galaxy S24 Ultra,
384 by 832 CSS pixels, and 384 by 500 with the keyboard. No model request is
sent. Three repeated Settings open/close pairs and three model picker pairs
use the same existing connection and selected model before and after changes.

`scripts/profile-mobile-motion.mjs` extends the repository's CDP and trace
helpers for an attached Android WebView. It checks foreground visibility,
hit-tests the actual trigger, requires live animation frames and trace tasks,
and records geometry and control counts without conversation text or network
payloads. The geometry probe itself adds rendering work. Its frame gaps are
comparative observations under that probe, not a claim about uninstrumented
GPU throughput. A delayed click is recorded separately from the animation.

The local captures are under the ignored `artifacts/mobile-motion` directory.
Early exploratory captures named `before-*` preceded the trigger hit-test
check and are excluded from the comparison. Only `baseline-*` and `after-*`
captures belong to the initial comparison. `no-preload-cold-*` records the
additional cold-start comparison after the motion changes. `after-final-*`
records the installed final build.

The target is visible content during page entry, a real exit transition,
immediate reversal on rapid reopen, and one coherent timing policy. Entry
should settle within 320 milliseconds after the click and exit within 240.
Median frame gaps should remain at the device's active cadence, and p95 gaps
should remain within two 60 Hz frames. Native Back, modal focus, keyboard
restoration, scroll locking, and reduced motion require separate correctness
checks. Transitions may animate only transform and opacity.

The work cost is one user transition times the mounted controls in its panel,
plus the existing chat and navigation underneath. No polling, session ordering,
model-selection policy, or shared cache is being changed. The baseline does
not justify a cache or a rewrite of session rendering.

## Results on the installed phone

Three repetitions per measured path. Times for mounting controls start at
pointer release. Settling times start at click and use a half-CSS-pixel
position tolerance. Mounting controls measures the empty-page delay; it does
not mean the sliding page is already entirely on screen.

| Observation | Before | Final build |
| --- | --- | --- |
| Cold header menu, pointer release to click | 279 to 312 ms | 2 to 3 ms |
| Warm Settings, controls mounted | 254 to 255 ms | 14 to 30 ms |
| Cold Settings opened from the sidebar, controls mounted | 328 to 330 ms after the initial motion fix | 29 to 46 ms |
| Settings close | Removed before the next recorded frame | Reverse slide retained for 196 to 203 ms |
| Cold drawer entry, settling after click | Separate delay before entry | 262 ms |
| Cold Settings entry, settling after click | Empty container followed by another fade | 304 to 306 ms |
| Model sheet entry, settling after click | Parent fade and 16-pixel movement | Opaque bottom slide, 274 to 296 ms |

The final Settings and model captures have p95 frame gaps between 8.4 and
16.8 milliseconds. Cold drawer captures still contain individual gaps of
58 to 67 milliseconds. Similar gaps existed before the Settings preload and
touch changes. This pass improves input latency and the movement itself; it
does not establish a general GPU or frame-rate improvement.

One attempted fix did not help. Warming the Settings import alone still left
315 to 330 milliseconds before controls mounted. React's fresh lazy boundary
could still commit an empty fallback, and the installed React renderer has a
300-millisecond fallback throttle. The retained implementation resolves the
Settings component while the sidebar is open and renders that component
directly when available. It does not mount Settings data effects in the
background. The normal lazy recovery path remains available if preparation
has not completed or fails. Direct entry routes that skip the sidebar were
not part of the cold-start timing comparison.

## Correctness and release status

The final production UI was packaged as a debug APK and installed over the
phone's existing debug app without clearing data. Its saved connection,
Selawik font, Work mode, and selected model remain available. The desktop
server was restarted after it stopped, and the saved connection reconnected.

Physical-device checks passed for Android Back from Settings to history,
rapid Settings close and reopen with one active dialog, model opening from
the keyboard, and Back restoring the editor, keyboard, and a synthetic draft.
The synthetic draft was removed through the editor. The app was left on an
empty Work composer with the keyboard closed and no active overlay or
horizontal overflow. Keyboard checks wait for Android's IME to settle; this
report makes no keyboard-latency claim.

Reduced-motion captures show no transform travel for Settings and the model
sheet. A reduced-motion model close has no retained visible frames. Automated
cases also cover immediate reduced-motion fullscreen dismissal, focus and
scroll-lock restoration, exit cleanup, and preserving an input during rapid
reopening. Twenty focused tests passed across the modal, Back-routing, and
composer-shell files, using filtered runs where Bun's Windows runner crashed.

UI TypeScript checking, focused ESLint, focused Oxlint, Vite production builds,
Capacitor sync, and Gradle debug builds passed. Node was used to run the same
installed tools when Bun's launcher crashed in USER32. The dead-code report
was produced and inspected, with the existing two unused files, 222 exports,
163 exported types, and one duplicate export. Its Bun wrapper exited
abnormally, so this is not a clean command-exit result. No dependencies,
network protocols, or stored-data formats were changed.

Android preview 2 on GitHub remains the signed pre-animation baseline. These
animation changes are installed locally on the connected phone and are not
included in that published APK. iOS, tablets, swipe-following gestures,
large-history scrolling, and a full set of cold direct-entry routes remain
outside this pass's runtime evidence.

## Follow-up audit: text, navigation focus, and composer

The previous pass did not cover the everyday composer transition or opening
history with the keyboard down. On the attached Galaxy S24 Ultra, opening
Chats focused the search input and reduced the viewport from 832 to 500 CSS
pixels. The shared modal hook chose the first focusable control without
considering whether it opened the keyboard. Navigation needs focus inside the
panel, while editing needs an explicit tap or keyboard navigation.

Typography has several competing owners. The resting prompt is 14px while the
editor is 16px. Chat branding is 19px, conversation titles are 17px, generic
page headers use a 14px label, and sheets use 18px. Some sizes are literal
pixels and bypass the text-size preference. Standalone CSS also overrides
semantic text classes with fixed sizes. The native font is confirmed as
Selawik at the expected 16px root size and 100 percent zoom. Replacing that
font again would leave the inconsistent hierarchy in place.

The global 48px minimum also enlarges visible primary circles and compact
settings controls. Touch targets, visible icon sizes, and text sizes need
separate choices. Primary navigation should retain generous targets. A
compact composer should have a 36px visible primary circle inside a 48px hit
area, and reading text should remain 16px in both composer states.

Three unchanged production-UI captures of composer expansion show immediate
mounting with no composer animation. Frame-gap p95 is 16.7ms in all three,
with no traced tasks above 50ms. This is missing visual continuity, not an
established rendering bottleneck. The change budget is immediate focus,
transform and opacity only, no retained duplicate editor, and a frame-gap p95
below 20ms on the same phone. Preserve drafts and Android Back behavior.

The intended hierarchy is 17px semibold navigation and sheet titles, 16px
reading and input text, 15px control labels, and 13px supporting text at the
default text setting. All scale from the same saved preference. Composer
expansion, collapse, footer entry, and primary-action icon changes should use
short, finite transitions. Reduced motion should remove them.

### Follow-up results

The installed follow-up build keeps Selawik. The WebView font inspector reports
Selawik-Regular glyphs, rather than a fallback. Mobile titles, reading text,
controls, and supporting text now use the documented hierarchy. The interface
font-size control is available in mobile Appearance and Settings search.
Standalone fixed-size overrides have been removed. Large input text can grow
its field height, and navigation rows retain their 48px targets without
forcing that size on every setting.

The actual Appearance stepper was exercised at 150 and 200 percent. The main
header measured 25.5px and 34px, and composer text and history search measured
24px and 32px. The viewport and root scroll width both remained 384px. Reset
returned the saved setting to its original 100 percent. These checks establish
shared scaling and page bounds, not every translated label's layout.

Three consecutive history opens left the viewport at 832px with no editable
field focused. An explicit search tap focused its input and opened the keyboard
at 500px. Back closed search and history. The focused regression tests also
cover editable-first and input-only panels, Tab wrapping, nested dialogs,
focus restoration, and scroll-lock cleanup.

The three composer expansion captures now contain 14 to 17 animated frames.
Their frame-gap p95 values are 16.8ms, 16.7ms, and 16.7ms, compared with 16.7ms
for each unchanged capture. No captured task exceeded 50ms. The animation adds
visual continuity within the 20ms frame-gap budget; it is not a speedup. A
separate reduced-motion capture has no transform or opacity animation.

Device checks observed all four composer animation names, covering expansion,
collapse, footer controls, and primary action icons. Typing a synthetic draft,
opening and dismissing the model picker, hiding the keyboard, and reopening
the composer preserved that draft. The expanded state had one editor; the
collapsed state retained the text preview with no editor. The test draft was
removed without sending a message.

Twenty-nine tests passed across modal focus, mobile Back, composer-shell, and
Settings search. UI type checking, focused ESLint, Vite production builds,
Capacitor sync, and Gradle debug builds passed. Focused Oxlint passed the
changed focus, header, picker, composer presentation, and search files. Its
broader scan reported 56 existing findings in the large app, history, Settings
view, and visual-settings files. Those findings are outside the changed lines;
they were inspected and left alone. No dependency or stored-data format changed.

The APK is updated in place on the attached Android phone. This follow-up is
local and has not replaced the signed APK on GitHub. iOS, tablet hardware,
translated layouts, OS-wide text magnification, dictation recording, and live
streaming behavior were not runtime-tested in this follow-up.
The final layout pass also lets title buttons grow with their content and
scales history row minimums with the text preference. Reading and rename rows
share the same minimum. Model names and provider labels use relative line
heights so their glyphs remain inside the text line at larger sizes.
