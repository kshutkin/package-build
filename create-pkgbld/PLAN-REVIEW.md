# Extension System Plan Review and Proposals

This document is a companion review of `PLAN.md`. It summarizes strengths, highlights design risks and ambiguities, and proposes concrete changes to make implementation safer and more predictable.

Its purpose is not to replace the plan, but to help sharpen scope, improve architectural decisions, and reduce avoidable rework during implementation.

---

## Executive Summary

The proposed extension system is a strong direction for `create-pkgbld`. The most promising aspects are:

- a clean separation between registry, extension packages, and engine
- a pragmatic hybrid declarative/programmatic extension contract
- a virtual file tree that enables dry-runs, diffs, and batched writes
- a phased rollout that sensibly starts with non-interactive flows

The main areas that should be tightened before implementation are:

1. explicitly define the supported project scope
2. define package resolution semantics precisely
3. specify merge, overwrite, and conflict policies
4. improve detection and idempotency expectations
5. move basic safety mechanisms earlier in implementation
6. clarify non-interactive behavior and prompt resolution
7. document commit semantics and workspace assumptions

---

## Overall Assessment

The plan is good and worth pursuing. It is structured, practical, and does not over-engineer the first version.

The design already gets several important things right:

- it does not force all extensions into a purely declarative model
- it preserves the current scaffolding flow rather than replacing it abruptly
- it introduces a tree abstraction before layering in more advanced UI behavior
- it recognizes extension authoring as a first-class use case

The main issue is not the direction. The main issue is that several operational details are still implicit, and those details will determine whether the system feels reliable in real projects.

---

## Strengths of the Current Plan

### 1. Clear architectural layering

The plan separates concerns into:

- registry discovery
- extension implementation packages
- core engine orchestration
- virtual file tree mediation

This is a strong foundation. It creates clean boundaries and reduces the chance that UI, file operations, and extension logic become entangled.

### 2. Hybrid extension model

The combination of declarative and programmatic APIs is appropriate.

Declarative setup is ideal for:

- adding dependencies
- adding scripts
- creating simple config files

Programmatic setup is necessary for:

- conditional logic
- reading existing files before making changes
- generating content dynamically
- handling complex removal or migration logic

This avoids the common mistake of overfitting everything into a schema that eventually becomes too rigid.

### 3. Virtual file tree as the execution boundary

The tree abstraction is one of the strongest parts of the design.

It enables:

- dry-run mode
- unified commit
- batched writes
- diff generation
- future conflict detection
- safer composition across multiple extensions

This is the right abstraction to introduce before building higher-level flows.

### 4. Realistic phased implementation

The implementation phases are mostly sensible. Starting with core infrastructure and non-interactive commands before integrating with the TUI is the right order.

This reduces surface area while the core model is still stabilizing.

---

## Key Concerns and Proposals

## 1. Product scope is not fully resolved

The plan describes `create-pkgbld` as transforming from a pkgbld scaffolding CLI into a general-purpose feature management system that can modify any project.

That framing is directionally useful, but it mixes multiple product models:

- project scaffolder
- extension manager
- feature manager for existing projects

These are related, but they are not identical.

### Why this matters

Scaffolding and mutation have different expectations around:

- defaults
- prompts
- idempotency
- safety
- conflict handling
- assumptions about existing files
- removal semantics

A scaffolder can assume it is creating structure. A feature manager must assume it is entering a messy, user-owned project with preexisting decisions.

### Proposal

Make the product boundary explicit in the plan.

Recommended framing:

- `create-pkgbld` becomes a feature management system for package-based JavaScript/TypeScript projects
- the current pkgbld scaffolding flow remains as a built-in experience on top of the same core engine where appropriate

This gives the implementation a clearer center of gravity and reduces ambiguity about where existing scaffold behavior fits.

---

## 2. “Any project” is too broad

The plan currently implies a very broad target, but the actual API assumptions are narrower.

The proposed system assumes:

- a `package.json`
- dependency management through npm-compatible package names
- scripts
- config files in typical JS/TS project formats

That is not “any project.” It is a specific and reasonable class of projects.

### Why this matters

If the scope is too broad in the planning language, it becomes harder to make good decisions about:

- required files
- target root detection
- dependency operations
- install hooks
- workspaces and package boundaries

### Proposal

Narrow the stated scope to something like:

> a general-purpose feature management system for `package.json`-based JavaScript/TypeScript projects

or:

> a feature management system for Node.js projects with a package root

This is a strength, not a limitation. Clear scope makes the design more coherent.

### Suggested addition to the plan

Add a section like:

## Supported Project Assumptions

Version 1 assumes the target project:

- has a `package.json` at the target root
- uses a Node.js-compatible package manager
- is a JavaScript/TypeScript project or adjacent tooling project
- is operated on as a single target root in v1

Workspace-aware targeting can be added later.

---

## 3. Extension package resolution needs to be specified precisely

The current plan says packages can be dynamically imported if they are installed in the project, globally, or resolvable from `create-pkgbld`'s own dependencies.

This is the biggest source of likely runtime confusion.

### Risks

- global resolution is vague and inconsistent across environments
- module resolution relative to a CLI package can be difficult to reason about
- monorepo layouts may behave unexpectedly
- ESM and CommonJS interop may produce subtle loading issues

### Proposal

Define a strict resolution order and avoid global package assumptions.

Recommended resolution strategy:

1. resolve relative to the target project root
2. if not found, resolve relative to `create-pkgbld`
3. fail with a clear error if the package cannot be resolved
4. do not rely on global installation resolution

### Also define module shape expectations

Document how the loader handles:

- ESM named exports
- default exports
- CommonJS `module.exports`
- invalid export shapes

### Suggested addition to the plan

## Extension Resolution Semantics

When loading an extension package:

1. attempt resolution relative to the target project root
2. if resolution fails, attempt resolution relative to `create-pkgbld`
3. reject global lookup as part of the supported contract
4. normalize ESM/CJS export shapes into a validated extension object
5. fail early with a clear diagnostic if the module does not satisfy the extension contract

This will make extension loading much more predictable.

---

## 4. Defaulting `detect()` to `false` is too weak

The current plan says that if `detect()` is absent, the engine should always consider the extension not installed.

That is simple, but the user experience will be poor.

### Problems this creates

- `list` may report false negatives
- `add` may try to install an already-installed extension
- the TUI may show incorrect status indicators
- remove behavior may be confusing if the engine never detects presence accurately

### Proposal A: add heuristic detection for declarative extensions

For declarative extensions, the engine can infer likely installation status by checking whether the declared artifacts are present, such as:

- dependencies
- devDependencies
- scripts
- files

The heuristic does not need to be perfect to be useful.

### Proposal B: require `detect()` for built-in registry entries

Even if third-party extensions may omit detection, built-in and first-party extensions should implement it explicitly.

### Recommended policy

- first-party extensions should always define `detect()`
- declarative extensions without `detect()` can use engine-provided heuristic detection
- only fall back to `false` if neither explicit nor heuristic detection is available

This gives much better behavior with minimal extra complexity.

---

## 5. Merge semantics for `package.json` need stronger rules

The plan currently covers the existence of merge behavior, but not the precise policies.

That is not a small detail. It is central to whether the tool feels safe.

### Ambiguities that should be resolved

- what happens if a dependency already exists with a different version?
- what happens if a script already exists with different content?
- what happens when `packageJson` is used for complex structured fields?
- how are arrays handled?
- when are user-owned values overwritten?
- when is a warning emitted instead of silently replacing data?

### Proposal

Define merge behavior explicitly by field type.

#### Dependencies and devDependencies

Recommended behavior:

- add missing entries
- if the same package exists with the same version, no-op
- if the package exists with a different version, record a conflict or warn explicitly
- do not silently replace without surfacing it

#### Scripts

Recommended behavior:

- add missing scripts
- if an existing script has the same value, no-op
- if an existing script has a different value, mark conflict unless overwrite is explicitly allowed

#### Top-level `packageJson`

Recommended behavior:

- limit declarative `packageJson` to simple top-level keys
- discourage or disallow complex fields such as:
  - `exports`
  - `files`
  - `typesVersions`
  - nested tool configuration objects with structural merge needs
- require programmatic setup for complex structural edits

### Proposal for the plan

Add a dedicated section:

## Merge Semantics

The engine applies field-specific merge policies rather than generic deep merge behavior.

- dependencies and devDependencies are merged by package name
- scripts are merged by script key
- simple top-level package fields may be shallowly assigned
- complex or nested package fields should be modified programmatically
- conflicting changes are surfaced explicitly rather than overwritten silently

This will prevent a lot of accidental damage.

---

## 6. File creation needs an overwrite policy

The `files` mapping in declarative setup is useful, but currently underspecified.

The key missing question is: what happens if the target file already exists?

### Possible behaviors

- overwrite
- skip
- error
- merge
- append

Without a defined default, extension authors and users will have different expectations.

### Proposal

Define a simple initial policy for v1.

Recommended default:

- if the target file does not exist, create it
- if the target file exists and the extension did not create it earlier in the same run, treat that as a conflict or fail with a clear message

This is safer than silent overwrite.

### Future expansion

Later versions may support per-file modes such as:

- `create`
- `overwrite`
- `skip`
- `merge`
- `append`

But v1 does not need all of them.

### Suggested addition

## File Operation Policy

For declarative file creation in v1:

- creating a new file is allowed
- writing to an existing file without explicit overwrite support is treated as a conflict
- complex file mutation should use programmatic setup

This encourages safer extension behavior.

---

## 7. Commit semantics are incomplete

The plan explains how the tree records changes, but not enough about how those changes are committed to disk.

### Important missing details

- are parent directories created automatically?
- what order are operations applied in?
- how are rename and delete interactions handled?
- what happens if one write fails after earlier writes succeeded?
- are writes deterministic in formatting and ordering?
- is the commit intended to be transactional, best-effort, or fail-fast?

### Proposal

Document commit expectations explicitly.

Recommended baseline behavior:

- create parent directories automatically
- normalize write order for deterministic output
- validate as much as possible before mutating disk
- apply operations in a defined sequence
- fail with clear reporting if commit cannot complete
- do not promise full rollback in v1, but avoid partial mutation where possible

### Suggested commit order

A reasonable order might be:

1. validate pending changes and detect conflicts
2. create directories
3. apply file writes and updates
4. apply renames where safe
5. apply deletes last, or in a carefully defined order depending on rename semantics

The exact order can vary, but it should be specified and tested.

### Suggested addition

## Commit Semantics

The engine commits validated tree changes in a deterministic order. Parent directories are created automatically. The engine attempts to detect conflicts and invalid operations before mutating disk. Version 1 does not guarantee full rollback, but it avoids best-effort silent failure and reports partial commit failures clearly.

---

## 8. Conflict detection should not wait until “Polish”

Conflict detection is currently listed in Phase 5. That is too late.

Conflict detection is not a cosmetic enhancement. It is core correctness and user safety.

### Examples of conflicts that matter immediately

- two extensions write the same file
- two extensions set the same script to different values
- two extensions require different dependency versions
- setup and remove operations target the same path in one run
- declarative and programmatic operations modify the same package fields inconsistently

### Proposal

Move basic conflict detection into Phase 1 or Phase 2.

Minimum viable conflict detection should include:

- duplicate writes to the same path
- write versus delete collision on the same path
- dependency version mismatch
- script value mismatch
- unsupported overwrite of existing target files

Fancy visual presentation can remain later. Detection itself should arrive early.

### Suggested phase change

Move “basic conflict detection” into Phase 1 core infrastructure.

---

## 9. Non-interactive mode needs deterministic prompt rules

The plan says that `--yes` mode skips prompts and uses defaults or existing config.

That is a good starting point, but the exact resolution behavior needs to be defined.

### Questions that should be answered

- what if a prompt has no default?
- what if a prompt requires user input to be meaningful?
- how are values derived from existing config?
- what happens when required data is missing?
- can values be supplied on the command line in the future?

### Proposal

Define deterministic behavior now.

Recommended v1 policy:

- in `--yes` mode, each prompt must resolve to a value without user interaction
- resolution order:
  1. existing project-derived value if the extension defines one
  2. prompt `initialValue`
  3. fail with a clear error if no value can be resolved
- do not silently continue with missing required values

### Future-friendly extension

Consider reserving a future mechanism for explicit option passing, such as:

- `--option key=value`
- config file input
- environment-backed non-interactive values

This does not need to be implemented now, but the design should not block it.

---

## 10. Built-in flows versus extensions should be decided more clearly

The plan leaves open whether current built-in option groups like general setup and git setup should become extensions.

This question affects architecture, user experience, and migration complexity.

### Recommendation

For the first version, keep these as core flows:

- general project setup
- git setup

Potentially also keep pkgbld scaffolding as core until the extension system is stable enough to absorb it naturally.

### Why

- these flows are part of the current identity of the tool
- they may have different assumptions from optional feature extensions
- forcing them into the extension model too early may produce awkward abstractions

### Long-term position

Design the engine so these could be re-expressed as extensions later if it proves beneficial, but do not make that a prerequisite for v1.

---

## Additional Design Recommendations

## 1. Add extension validation at load time

An extension system becomes much easier to debug if malformed extensions fail immediately with clear messages.

### Proposal

Validate loaded extensions for:

- `manifest` presence
- `manifest.name`
- `manifest.description`
- valid `setup` and `remove` types
- valid `detect` type if present
- valid `prompts` type if present

### Benefits

- clearer authoring errors
- fewer runtime surprises
- easier support for third-party extension authors

This should be part of core infrastructure.

---

## 2. Make idempotency an explicit design goal

The plan strongly implies idempotent behavior, but it does not state it directly.

It should.

### Recommended principle

Where reasonable, extension operations should be idempotent.

That means:

- adding an already-installed extension should be a no-op or produce a clear, non-destructive result
- removing a missing extension should be a no-op or clear informational result
- repeated detection should produce stable status
- declarative operations should avoid duplicating content or introducing churn

### Suggested addition

## Idempotency Goals

The engine should prefer idempotent operations where possible. Reapplying setup or remove should not produce duplicate or unstable results. Extensions should detect and preserve equivalent existing state when feasible.

This sets the right expectation for the whole system.

---

## 3. Clarify workspace and monorepo assumptions now

Given the package workspace context around this tool, target-root ambiguity will likely appear quickly.

### Questions the plan should answer

- is the target always the current working directory?
- can a user target a workspace package explicitly?
- where does `.pkgbld-extensions.json` live in a monorepo?
- which `package.json` is modified when commands are run from the workspace root?

### Proposal

If full workspace support is out of scope for v1, say so clearly.

Recommended v1 rule:

- the engine operates on a single explicit target root
- that target root must contain the `package.json` being managed
- registry overrides are read from that target root only

This is enough to start safely.

### Suggested addition

## Workspace Assumptions

Version 1 operates on one target project root at a time. The managed `package.json` and any local registry override file are resolved relative to that root. Multi-package workspace orchestration is deferred.

---

## 4. Clarify what “remove” guarantees

Removal is often misunderstood.

An extension’s `remove()` may do one of several things:

- reverse only what the extension declares
- remove all traces of the feature
- preserve user modifications to related config
- aggressively clean up everything matching known patterns

Those are not equivalent.

### Proposal

Define the contract more carefully.

Recommended wording:

- `remove` performs the cleanup declared or implemented by the extension author
- it is not guaranteed to reconstruct the project’s exact prior state
- removal should prefer safe cleanup over destructive guessing

This is more realistic and protects both authors and users.

---

## 5. Separate conceptual categories of extensions

Even if all extensions share the same runtime interface, the plan may benefit from distinguishing categories conceptually.

### Suggested categories

- feature extensions
  - linters
  - formatters
  - test runners
  - pkgbld plugins

- scaffold/core flows
  - general setup
  - git setup
  - base pkgbld setup

### Why this helps

- reduces pressure to force all UX into one conceptual bucket
- helps future docs and registry organization
- improves TUI grouping and user mental model

This may be represented in metadata later, but even just documenting the distinction is helpful.

---

## Proposed Additions to `PLAN.md`

The following sections would improve the plan materially.

### 1. Supported Project Assumptions

Add a section clarifying:

- target projects are `package.json`-based JS/TS or Node projects
- v1 operates on a single target root
- workspace-wide orchestration is out of scope for now

### 2. Extension Resolution Semantics

Add a section defining:

- resolution order
- no global package reliance
- export normalization
- validation failures

### 3. Merge Semantics

Add a section defining:

- dependency conflict handling
- script conflict handling
- limits of generic `packageJson` merging
- when to require programmatic setup

### 4. File Operation Policy

Add a section defining:

- create behavior
- overwrite behavior
- conflict behavior
- preference for programmatic setup on existing files

### 5. Commit Semantics

Add a section defining:

- validation-before-write
- deterministic operation ordering
- directory creation
- partial failure reporting

### 6. Idempotency Goals

Add a section making repeated operations safe and predictable where possible.

### 7. Workspace Assumptions

Add a section clarifying root targeting and scope boundaries for v1.

---

## Proposed Revisions to Implementation Phases

The current phase order is close, but safety-related items should come earlier.

## Proposed Phase 1: Core infrastructure

- implement `tree.js`
- implement `registry.js`
- implement `engine.js`
- implement extension validation
- implement basic conflict detection
- create initial registry entries
- add unit tests for tree, registry, engine, and conflict cases

## Proposed Phase 2: CLI subcommands

- add `add`, `remove`, `list`
- support `--yes`
- support deterministic prompt resolution
- support `--dry-run`
- show clear conflict and validation errors

## Proposed Phase 3: TUI integration

- extract TUI logic
- add Extensions section
- show installed/not installed state using robust detection
- allow unified commit from core flows and extensions

## Proposed Phase 4: First-party extensions

- biome
- swc
- dts-buddy
- decide whether pkgbld setup remains core or becomes extension-backed

## Proposed Phase 5: Polish

- schema improvements
- pretty diff rendering
- post-commit install hooks
- docs and authoring guide
- possible future option passing enhancements

This keeps operational correctness ahead of presentation improvements.

---

## Concrete Proposal Summary

If only a small number of changes are made before implementation, these should be the priority:

1. narrow the project scope from “any project” to `package.json`-based JS/TS projects
2. define extension resolution order and remove global resolution from the supported model
3. add explicit merge and overwrite semantics
4. require better detection behavior than a default `false`
5. move conflict detection earlier
6. make non-interactive prompt resolution deterministic
7. document commit semantics and workspace assumptions

These changes will make the design much easier to implement correctly.

---

## Recommended Decisions

If decisions need to be made quickly, the following are good defaults:

- keep general and git flows as core in v1
- require first-party extensions to implement `detect()`
- allow heuristic detection for declarative third-party extensions
- disallow silent overwrite of existing files in declarative setup
- treat script and dependency mismatches as conflicts, not silent merges
- operate on one target project root in v1
- avoid global extension package resolution
- validate every extension as it loads
- state idempotency as a design principle

---

## Final Assessment

The architecture in `PLAN.md` is strong. The core idea should move forward.

The main work left at the planning stage is not inventing a different design. It is tightening the contract around safety, scope, and deterministic behavior.

With those clarifications, the plan will be significantly more implementation-ready and should lead to a cleaner, more reliable extension system for `create-pkgbld`.

---
## Appendix: Short Proposal Checklist

Use this as a quick implementation-oriented checklist.

- [ ] Define supported project scope
- [ ] Define target root assumptions
- [ ] Define extension package resolution rules
- [ ] Define ESM/CJS loading behavior
- [ ] Validate extensions on load
- [ ] Define detection policy
- [ ] Define dependency merge behavior
- [ ] Define script merge behavior
- [ ] Define `packageJson` merge limits
- [ ] Define file overwrite policy
- [ ] Add basic conflict detection early
- [ ] Define non-interactive prompt resolution
- [ ] Define commit ordering and failure behavior
- [ ] State idempotency goals
- [ ] Clarify removal guarantees

---
## Appendix: Suggested One-Paragraph Amendment for `PLAN.md`

The extension system in `create-pkgbld` targets `package.json`-based JavaScript and TypeScript projects and operates on a single target root in v1. Extension packages are resolved first from the target project and then from `create-pkgbld`, validated on load, and executed through a virtual file tree. The engine applies explicit merge and conflict policies for dependencies, scripts, package metadata, and file writes, favors idempotent operations where possible, and detects conflicts before committing to disk. Non-interactive mode must resolve all prompt values deterministically or fail with a clear error. Workspace-wide orchestration, remote registries, and advanced file merge strategies are deferred.
