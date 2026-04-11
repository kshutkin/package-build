# Recommendations for `create-pkgbld` Extension System Plan

After reviewing the `PLAN.md` for the Extension System, here are some structural, architectural, and edge-case recommendations to ensure the system is robust, developer-friendly, and maintainable.

## 1. Registry & Discovery
* **Namespace/Naming Collisions:** The plan states local registries win on `name` collisions. To prevent accidental collisions between third-party extensions and official ones, consider enforcing a naming convention (e.g., `pkgbld-ext-*`) or using the npm package name as the primary identifier rather than a separate `name` field.
* **Version Management:** The registry JSON (`extensions.json`) specifies a `package` name but no version. Consider how the CLI will resolve the package version (e.g., always `latest`, or specifying a version range in the registry) and how it handles globally vs. locally installed extensions.
* **Security & Execution:** Dynamically importing packages specified in a local `.pkgbld-extensions.json` introduces a security vector if a repository is cloned and initialized. Consider adding a prompt to trust local extensions the first time they are executed.

## 2. Virtual File Tree & Commit Phase
* **Package Manager Execution:** The declarative/programmatic setup adds dependencies to `package.json`, but the plan doesn't explicitly mention running `npm install` (or `pnpm`/`yarn`) after committing the tree. The core engine should detect the current package manager and optionally run the install step automatically.
* **Conflict Resolution:** If two extensions are applied simultaneously and modify the same file (e.g., appending different configs to `tsconfig.json`) or overwrite the same npm script, the Virtual File Tree needs a conflict resolution strategy. Consider warning the user or using an AST-based merger for common files (like JSON/YAML) rather than strict string overwrites.
* **Error Handling & Rollbacks:** If the commit phase fails halfway through (e.g., due to file permission issues), the project might be left in an inconsistent state. The engine should ideally validate write permissions before starting the commit or maintain a rollback log.

## 3. Extension API Contract
* **Declarative Safe-Merges:** The declarative `setup.scripts` mentions that "keys that already exist are overwritten." This can be destructive if a user has a custom `lint` script. Consider adding a prompt or a "safe merge" strategy (e.g., appending `&& biome check ./src`) rather than blindly overwriting.
* **Lifecycle Hooks:** Consider adding `postSetup(tree, options)` or `postRemove()` hooks for extensions that need to run commands *after* files are committed to disk (e.g., initializing a git submodule, or running a specific binary that requires the files to actually exist on disk).

## 4. CLI & TUI Interactivity
* **Preview / Dry-Run Mode:** The `--dry-run` flag is excellent. Ensure the TUI also has a way to preview changes before confirming "Done", similar to how `eslint --init` or `npm init` often prints "Here is what will be written... Is this OK?".
* **Partial Uninstalls:** When `remove` is called, an extension might try to remove a dependency (e.g., `@biomejs/biome`) that the user actually wants to keep for other purposes. The TUI/CLI could prompt "Do you also want to remove these dependencies?" rather than assuming safe deletion.

## 5. Implementation Phases
* **Phase 1 Addition:** Before building the full CLI subcommands in Phase 2, include a "validation phase" in Phase 1 that specifically tests the engine against edge cases (e.g., malformed `package.json`, missing directories).
* **Documentation (Phase 4/5):** Add a specific phase/task for creating an "Extension Authoring Guide" to clearly document the API, especially the `Tree` object methods, so community members can easily start building extensions.
