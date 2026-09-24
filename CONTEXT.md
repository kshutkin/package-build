# PKG BLD Ecosystem

This context describes how `create-pkgbld` discovers and changes packages that participate in a PKG BLD project.

## Language

**Package inventory**:
The read-only view formed by merging the official registry, project lock, and project dependency declarations.

**Package target**:
The requested management state of a package: managed by `create-pkgbld` or absent from the project.
_Avoid_: Intent, action

**Package operation**:
A prepared transition from a package's inventory state to a package target.
_Avoid_: Extension action, plugin action

**Project changes**:
The accumulated project state and attributed claims produced by sequential package operations before commit.
_Avoid_: Independent changes, operation drafts

**Build plugin**:
An npm package discovered by its PKG BLD plugin name and loaded by `pkgbld` during a build.

**Build configuration**:
The finalized build choices resolved from defaults, package metadata, explicit CLI options, and Build plugin overrides before package.json is updated.
_Avoid_: Options, config

**Build entry**:
A named source module discovered for a package and used as a concrete build input.
_Avoid_: Input, entry point

**Cross-plugin coordination state**:
Mutable values shared by Build plugins for one build without becoming part of the Build configuration.
_Avoid_: Shared configuration, global plugin state

**Extension**:
An npm package containing setup and removal behavior for `create-pkgbld`.

**Project lock**:
The committed record of integrations that the project acknowledges as successfully applied.

## Relationships

- A **Package inventory** describes zero or more **Build plugins** and **Extensions**.
- A **Build configuration** is resolved in ascending authority from defaults, package metadata, explicit CLI options, and **Build plugins**.
- A **Build configuration** may select **Build entries** for format-specific output and transforms.
- **Cross-plugin coordination state** is owned by one build and shared across its **Build plugin** lifecycle phases without same-phase ordering guarantees.
- A **Package operation** derives its behavior from one inventory entry and one **Package target**.
- **Project changes** apply **Package operations** sequentially and retain each operation's claims for conflict review.
- A successful **Package operation** updates the **Project lock** together with its project changes.

## Example dialogue

> **Dev:** "The build plugin is installed but unmanaged. What package operation does a managed package target prepare?"
> **Domain expert:** "Adoption: keep the dependency and record its exact version in the project lock."

## Flagged ambiguities

- "Intent" previously meant both the user's desired state and the implementation step; **Package target** names the desired state, while setup, restoration, adoption, and removal are derived effects.
