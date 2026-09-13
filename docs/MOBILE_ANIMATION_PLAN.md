# Mobile animation plan

12 September 2026. Proposal only. Implementation starts after your go-ahead.

The goal is the same restrained, conversation-first design as desktop Ivaldi and the Codex/ChatGPT reference: immediate touch response, readable content during movement, and clear relationships between screens.

The current composer swaps between separate collapsed and expanded layouts, then adds entry effects. Draft suggestions disappear instantly. Android resizes the WebView for the keyboard through a different path from the iOS choreography. These need coordinated transitions. Adding another fade will leave the layout jumps intact.

This plan follows the [existing motion review](MOBILE_MOTION_REVIEW.md) and current code inspection. Fresh phone recordings will establish the baseline before implementation.

| Interaction | Planned movement and behavior |
|---|---|
| Composer expansion, collapse, and keyboard | Make the pill become the expanded composer continuously. Coordinate its position with Android's actual keyboard resize. Preserve draft, caret, and active editor identity. Move the background and controls separately so text never stretches. Welcome content leaves and repositions within the same transition. |
| Typing, attachments, and context chips | Move surrounding content smoothly when another text line or attachment changes composer size. Keep the caret visible and typing immediate. Chips enter and leave their own space without making the whole composer replay its entrance. |
| Send, stop, and voice controls | Change icons within a stable button footprint. Transition voice controls into their available space and back. Give touch feedback immediately, while preserving the real recording, sending, and cancellation states. |
| Sidebar and history | Slide the drawer with a separate backdrop fade. Drag dismissal follows the finger and settles from its release position. Reopening reverses the movement already underway. Search focuses only after an explicit tap. Animate row removal without disturbing scroll position. |
| Project folders and nested groups | Animate every expand and collapse: rotate the chevron, reveal or retract the child rows, and move the rows below smoothly as space opens or closes. Keep text at its normal scale and preserve scroll position. Retain closing content until its exit finishes. Repeated taps reverse the current motion without snapping. Apply this to project folders, nested session groups, and expandable file-tree folders. |
| Model picker and other sheets | Use the same bottom-sheet behavior for model, attachment, thinking, mode, and instance choices. Keep sheet content opaque and readable. Coordinate nested picker changes and keyboard dismissal, including close, cancel, and Android Back. |
| New chat and conversation switching | Coordinate drawer dismissal, header change, and conversation replacement. Preserve the destination's scroll position. Give new chat a deliberate transition into the empty composer; avoid replaying entrance effects across historical messages. |
| Settings, files, and workspace | Use consistent forward/back movement for nested pages. Keep content present throughout entry and exit. Move tab selection indicators and change tab content without briefly showing an empty page. |
| Messages and disclosures | Introduce a newly sent message once. Keep streaming text readable and the user's scroll anchor stable. Expand reasoning, tool results, and message actions while moving neighboring content continuously. Existing text stays still as new tokens arrive. |
| Small feedback | Animate press/release feedback, toggle thumbs, checkmarks, selection indicators, dropdown opening and closing, Show more/less, inline editing transitions, and toast entry/exit. Loading motion runs only during actual waiting. Static headers, settled messages, and idle controls remain still. |

I will implement this in the following order:

1. **Inventory and baseline.** Walk both Work and Developer modes on the phone. Inspect every interactive control and record each visible state change, including small disclosures and nested controls. The table is a starting inventory, not the scope limit. Every user-triggered show/hide, expansion/collapse, and layout change needs a coordinated transition, subject to reduced-motion preferences. Record the installed build and representative before clips.
2. **Composer first.** Resolve layout, focus, and keyboard ownership before tuning motion. One owner controls each animated property. Review expansion, multiline typing, attachments, picker handoff, and collapse together before moving on.
3. **Navigation, then remaining interactions.** Consolidate shared sheet, drawer, and page behavior. Remove superseded effects as their replacements land. Finish messages, disclosures, and smaller controls against the inventory.

Use shared timing values, initially 100 to 160 ms for feedback and 220 to 300 ms for larger transitions. Openings decelerate; dismissals finish promptly. Tune these on the phone. Gestures track input directly, and interrupted animations continue from their visible position. Use transforms and opacity; measure any necessary geometry animation under the repository's performance rules. Keep React and Capacitor and use existing dependencies.

Completion requires before/after clips from the same phone and scenarios, reviewed at normal speed and frame by frame. Check combined sequences, rapid reversal, Android Back, keyboard already open, long drafts, larger text, reduced motion, and both modes. Test folder expansion and collapse with short, long, and nested lists, including repeated taps and folders near the viewport edge. Reject visible snaps, stretched text, blank frames, focus theft, lost drafts, and scroll jumps. Profile stalls separately and run relevant correctness checks.

Every inventoried path must finish as verified, intentionally static with a reason, or explicitly blocked. Blocked paths keep the work incomplete. Deliver the coverage record and identify the exact APK tested. Passing tests or frame-time measurements alone will not count as visual acceptance.
