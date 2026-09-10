---
name: project-blueprint
description: Project blueprint for substantial builds such as products, apps, games, AI systems, services, platforms, automations, infrastructure, technical workflows, major subsystems, and architecture-heavy rebuilds. Use when a project needs an implementation-ready PRD, architecture, compact agent context, operating guidance, optional design direction, and a physical project structure before or alongside execution. Skip small isolated changes.
author: Ivaldi
ivaldi_original: true
ivaldi_version: 1
---

# Project blueprint

Turn an ambitious project idea into a working foundation that another capable agent can enter and build without re-deriving the goals, structure, or architecture every session.

The blueprint is complete when the project contract, system design, compact agent context, operating rules, and physical project structure agree with each other and with the user's decisions.

## 1. Establish ground truth

Read the user's request and inspect the existing project workspace before choosing architecture.

- Treat explicit user decisions as fixed constraints unless the user changes them.
- Reuse existing conventions, working contracts, and authoritative documents in an established project.
- Distinguish project or product requirements from implementation choices.
- Resolve missing implementation details from project evidence and sensible defaults when the choice is reversible.
- Ask for clarification only when a missing answer would materially change the product or force incompatible architectures and cannot be resolved safely from context.
- Record consequential assumptions instead of silently turning them into requirements.
- Separate current scope from later ideas so future possibilities do not inflate the first architecture.

Completion criterion: every architecture-shaping decision is user-specified, repository-derived, or recorded as an explicit assumption.

## 2. Create the source-of-truth documents

For a new project, create these files at the project root unless an established workspace already has a clear documentation convention:

1. `PRD.md`
2. `ARCHITECTURE.md`
3. `ARCHITECTURE_ESSENTIALS.md`
4. `AGENTS.md`
5. `DESIGN_DIRECTION.md` when visual or interaction design materially affects the product

If an equivalent authoritative document already exists, improve it instead of creating a duplicate only to satisfy a filename.

Write the documents in full. Headings with generic filler, unexplained TODOs, and empty templates do not count as completion.

### PRD.md

`PRD.md` owns what is being built, for whom, and why. For non-product projects, treat PRD as the project requirements document rather than forcing product language. Keep implementation mechanics in `ARCHITECTURE.md`.

Cover the parts that apply:

- project or product summary and problem statement
- target users, actors, and roles
- goals and explicit non-goals
- supported platforms and operating environments
- primary user journeys, operator flows, or end-to-end workflows
- functional requirements grouped into coherent capability areas
- permissions and role behavior
- data the product must capture, display, import, export, or retain
- external systems and integrations from the user's point of view
- offline, realtime, notification, background, and collaboration behavior when relevant
- security, privacy, accessibility, reliability, and performance requirements
- edge cases that materially change the user, operator, or system experience
- acceptance criteria or observable completion conditions
- delivery phases when the full product is larger than one implementation slice
- assumptions and unresolved product decisions

Requirements should be specific enough that an implementation agent can determine whether a behavior belongs in scope. Avoid vague requirements such as "secure", "fast", "robust", or "easy to use" without naming the behavior or boundary that matters.

### ARCHITECTURE.md

`ARCHITECTURE.md` owns how the system satisfies the PRD.

Cover the parts that apply:

- architecture drivers and constraints
- chosen stack with brief decision rationale
- system context and runtime topology
- applications, services, packages, modules, pipelines, workflows, infrastructure, or other major component ownership
- dependency direction and boundaries that must not be crossed
- core domain model and data ownership
- storage choices, schemas, indexes, migrations, and retention
- API, event, queue, streaming, and inter-process contracts
- authentication, authorization, identity, secrets, and trust boundaries
- state ownership, caching, synchronization, and offline behavior
- background jobs, scheduling, concurrency, retries, and idempotency
- external integration boundaries and failure handling
- logging, metrics, tracing, audit, and operational visibility
- deployment topology, environments, configuration, and release model
- testing strategy and the boundaries each test level must protect
- security and recovery behavior for destructive or partial failures
- project layout with a tree and a short ownership note for important directories
- major tradeoffs, rejected alternatives when they explain a non-obvious choice, and deliberate extension points

Use a diagram when it removes ambiguity. A diagram is supporting evidence, not a substitute for naming owners and contracts.

### ARCHITECTURE_ESSENTIALS.md

`ARCHITECTURE_ESSENTIALS.md` is the compact context file an agent can afford to read at the start of ordinary work.

It is a compression of the current PRD and architecture, not a third place to make decisions. Keep it short enough to load routinely. A useful default ceiling is about 250 lines, and shorter is better when the project allows it.

Include only information that prevents expensive mistakes:

- one short project mission
- current implementation phase
- stack and runtime boundaries
- top-level project map
- component and data ownership
- dependency direction
- critical request, data, event, or synchronization flows
- authentication and security invariants
- contracts that many modules depend on
- important platform differences
- canonical build, test, lint, migration, and run commands when they are not obvious from one manifest
- non-negotiable implementation rules
- pointers to `PRD.md`, `ARCHITECTURE.md`, and `DESIGN_DIRECTION.md` for deeper branches

Leave history, lengthy rationale, exhaustive feature lists, and details discoverable from ordinary manifests or source code out of this file.

### AGENTS.md

`AGENTS.md` is the project operating contract for agents. Keep it concise and route deeper context through pointers instead of copying the PRD or architecture into it.

Define the parts that apply:

- required reading order
- which document owns product, architecture, design, and compact context
- package, module, component, or directory ownership rules
- where new behavior belongs
- project-specific implementation and change-discipline rules
- safety rules for secrets, destructive operations, migrations, generated files, and external systems
- required validation by type of change
- documentation update rules when contracts change
- project-specific tool, branch, commit, or deployment rules only when the user or repository requires them
- pointers to task-specific instructions or skills when they exist

A good default reading route is:

1. `AGENTS.md`
2. `ARCHITECTURE_ESSENTIALS.md`
3. task-specific package or module documentation
4. `PRD.md`, `ARCHITECTURE.md`, or `DESIGN_DIRECTION.md` only when the task touches those decisions

### DESIGN_DIRECTION.md

Create this file when the project has meaningful visual, interaction, spatial, presentation, or brand requirements. Skip it when design direction would not affect implementation unless the user asks for it.

Visual products: before writing `DESIGN_DIRECTION.md`, read `references/design-direction.md` and apply its design-document contract. Translate named references such as ChatGPT or Codex into observable layout and interaction decisions instead of leaving the reference itself as the specification.

Completion criterion: each document has one clear ownership role, the documents agree, and the compact files point to deeper sources instead of duplicating them.

## 3. Build the physical project structure

Once the architecture is decided, create the structure on disk. Do not stop after printing a proposed tree in Markdown.

- Make every directory declared as part of the current architecture exist.
- Create the manifests, workspace files, configuration files, entrypoints, public interfaces, schemas, test roots, scripts, assets, data roots, infrastructure definitions, and component boundaries required by the architecture.
- Create the files named in the current project map even when their first version is empty or only contains an honest responsibility stub.
- Keep placeholder code honest. A stub may define an interface, entrypoint, type, or ownership boundary. It must not pretend unfinished business logic works.
- Keep generated output out of the scaffold unless the normal toolchain generates it and the project expects it to be tracked.
- Use `.gitkeep` only when an intentionally empty directory must exist in version control. Prefer a short local README when a directory has non-obvious ownership or invariants worth documenting.
- Include test and fixture structure where the architecture depends on it, not as an afterthought.
- Include deployment, infrastructure, migration, or operations directories when they are part of the current system design.
- Create examples such as `.env.example` only when they communicate a real configuration contract, and never place secrets in them.
- In an existing project, preserve unrelated structure and adapt the target architecture to what already works unless the user explicitly requested a restructure.

Do not create hundreds of speculative leaf files for imagined future features. The physical skeleton should be complete for the architecture that is actually in scope.

Completion criterion: the project tree documented in `ARCHITECTURE.md` matches the relevant structure on disk, and every current top-level application, service, package, module, pipeline, workflow, or major component has a clear owner and purpose.

## 4. Run the consistency pass

Check the foundation as one system.

- Every user requirement belongs in the PRD or is recorded as out of scope.
- Every major PRD capability has an architectural owner.
- Every persistent data type has one owning store or service.
- Every external integration has an authentication and failure boundary.
- Every privileged operation has an authorization owner.
- Every important async flow names ordering, retry, cancellation, or idempotency behavior when applicable.
- File and directory names in the architecture match the project workspace.
- Volatile facts such as dependency versions stay in manifests unless an architectural compatibility constraint makes them worth documenting.
- `ARCHITECTURE_ESSENTIALS.md` contains no decision that is absent from the canonical PRD or architecture.
- `AGENTS.md` routes agents to sources of truth instead of becoming another copy of them.
- Design guidance and implementation structure agree on the actual client platforms.
- Assumptions are visible and do not masquerade as user decisions.

Fix contradictions before implementation builds on them.

Completion criterion: a new agent can answer what is being built, where each part belongs, which rules are fixed, and how to validate a change without reconstructing the project from chat history.

## 5. Continue into implementation when requested

This skill is the foundation phase, not a reason to stop coding.

If the user's request includes building or implementing the product, complete the blueprint first and then continue into the first sensible vertical slice. Do not ask for another approval merely because the documentation phase finished unless the user explicitly requested a review gate.

Use the PRD phases and architecture dependencies to choose implementation order. Prefer end-to-end slices that prove real contracts over broad collections of disconnected placeholders. Update the source-of-truth documents when implementation reveals a changed decision.

If the request is planning, architecture, or project setup only, stop after the blueprint and report the next implementation slice without starting it.

## Quality bar

- Boilerplate that does not constrain implementation is unfinished work.
- Architecture names owners, boundaries, and failure behavior, not only technologies.
- The PRD describes observable product behavior, not a feature wishlist with no completion conditions.
- The essentials file is compression, not a pasted copy of the architecture.
- `AGENTS.md` is routing and operating policy, not a second architecture document.
- The project structure is real, internally consistent, and safe to build on.
- Empty or minimal files communicate planned ownership without faking completed behavior.
- Optional design direction is specific enough that two competent implementers should converge on the same product character.

## Final completion criteria

Before calling the blueprint complete, verify all of the following:

- the four required source-of-truth files exist or have clearly identified equivalents
- `DESIGN_DIRECTION.md` exists when visual direction materially affects the product
- the files contain project-specific decisions rather than template filler
- assumptions and unresolved decisions are explicit
- the physical project structure matches the current architecture
- the compact context and agent instructions remain meaningfully smaller than the full product and architecture documents
- generated manifests or code stubs parse, compile, or validate at the narrowest relevant level
- any validation that could not be run is reported plainly

Report what was created or updated, the main assumptions, the structure that was created, validation performed, and the next implementation slice.
