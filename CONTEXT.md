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

**Build plugin**:
An npm package discovered by its PKG BLD plugin name and loaded by `pkgbld` during a build.

**Extension**:
An npm package containing setup and removal behavior for `create-pkgbld`.

**Project lock**:
The committed record of integrations that the project acknowledges as successfully applied.

## Relationships

- A **Package inventory** describes zero or more **Build plugins** and **Extensions**.
- A **Package operation** derives its behavior from one inventory entry and one **Package target**.
- A successful **Package operation** updates the **Project lock** together with its project changes.

## Example dialogue

> **Dev:** "The build plugin is installed but unmanaged. What package operation does a managed package target prepare?"
> **Domain expert:** "Adoption: keep the dependency and record its exact version in the project lock."

## Flagged ambiguities

- "Intent" previously meant both the user's desired state and the implementation step; **Package target** names the desired state, while setup, restoration, adoption, and removal are derived effects.
