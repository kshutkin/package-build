import semver from 'semver';

import { runRemove, runSetup } from './engine.js';
import { buildPackageInventory } from './inventory.js';
import { resolveInstalledPackage } from './package-resolution.js';
import { resolvePublishedVersion } from './package-version.js';
import { assertPluginCompatible } from './plugin-compatibility.js';
import { resolveExtension } from './registry.js';
import { Tree } from './tree.js';
import { runExtensionUpdate } from './update-engine.js';

/** @typedef {'managed' | 'updated' | 'absent'} PackageTarget */
/** @typedef {'setup' | 'restore' | 'adopt' | 'update' | 'remove' | 'none'} PackageEffect */
/** @typedef {'setup' | 'update' | 'remove' | 'adopt'} PackageIntent */
/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   tags: readonly string[],
 *   kind: 'plugin' | 'extension',
 *   state: import('./inventory.js').PackageState,
 *   error: string | null
 * }} PackageView
 */
/**
 * @typedef {{
 *   package: PackageView,
 *   target: PackageTarget,
 *   effect: PackageEffect,
 *   versionChange: { from: string, to: string } | null,
 *   requiresInstall: boolean,
 *   questions: readonly import('./types.js').Option[],
 *   stage(project: import('./project-changes.js').ProjectChanges, answers?: import('./types.js').OptionsValue): Promise<{
 *     package: PackageView,
 *     effect: PackageEffect
 *   }>
 * }} PreparedPackageOperation
 */
/** @typedef {import('./inventory.js').PackageItem & { previousExtension?: import('./registry.js').Extension | null }} PreparedPackageItem */

export class PackageOperationError extends Error {
    /** @param {'PACKAGE_NOT_FOUND' | 'PACKAGE_UNAVAILABLE' | 'VERSION_UNRESOLVED' | 'UPDATE_UNAVAILABLE' | 'PLUGIN_INCOMPATIBLE'} code @param {string} message */
    constructor(code, message) {
        super(message);
        this.name = 'PackageOperationError';
        this.code = code;
    }
}

/**
 * Open package operations for one project snapshot.
 *
 * @param {{ projectRoot: string, registry: import('./registry.js').ExtensionEntry[], resolveVersion?: (packageName: string, selector: string) => Promise<string> }} params
 */
export async function openPackageOperations({ projectRoot, registry, resolveVersion = resolvePublishedVersion }) {
    const { items, warnings } = await buildPackageInventory(registry, projectRoot);
    const inventory = Object.freeze(items.map(toPackageView));

    return Object.freeze({
        inventory,
        warnings: Object.freeze([...warnings]),

        /**
         * Prepare a package operation without staging project changes.
         *
         * @param {{ package: string, target: PackageTarget }} request
         * @returns {Promise<PreparedPackageOperation>}
         */
        async prepare(request) {
            const item = items.find(candidate => candidate.entry.name === request.package || candidate.packageName === request.package);
            if (!item) throw new PackageOperationError('PACKAGE_NOT_FOUND', `PKG BLD package "${request.package}" not found`);

            const view = /** @type {PackageView} */ (inventory.find(candidate => candidate.id === item.packageName));
            let effect = deriveEffect(item, request.target);
            if (effect === 'none') {
                return createPreparedOperation({ effect, item, questions: [], target: request.target, view });
            }

            /** @type {import('./registry.js').Extension | null} */
            let extension = item.ext;
            let resolvedVersion = item.resolvedVersion;
            let versionChange = null;
            let previousExtension = null;
            if (effect === 'adopt') {
                resolvedVersion ??= resolveInstalledPackage(item.packageName, projectRoot)?.version ?? null;
                if (!resolvedVersion) {
                    throw new PackageOperationError(
                        'VERSION_UNRESOLVED',
                        `Cannot adopt "${item.packageName}": install project dependencies first so its exact version can be resolved`
                    );
                }
                if (item.kind === 'plugin')
                    assertCompatible(item.packageName, resolveInstalledPackage(item.packageName, projectRoot)?.manifest, projectRoot);
            } else if (effect === 'update') {
                if (!item.entry.official || !item.lockedVersion || !item.entry.version || !item.hasExtensionContract) {
                    throw new PackageOperationError(
                        'UPDATE_UNAVAILABLE',
                        `Cannot update "${item.packageName}": managed official extension metadata is required`
                    );
                }
                let targetVersion;
                try {
                    targetVersion = await resolveVersion(item.packageName, item.entry.version);
                } catch (/** @type {any} */ cause) {
                    throw new PackageOperationError(
                        'VERSION_UNRESOLVED',
                        `Cannot update "${item.packageName}": ${cause.message ?? String(cause)}`
                    );
                }
                if (!semver.valid(targetVersion)) {
                    throw new PackageOperationError(
                        'VERSION_UNRESOLVED',
                        `Cannot update "${item.packageName}": target version is not exact`
                    );
                }
                if (semver.lt(targetVersion, item.lockedVersion)) {
                    throw new PackageOperationError(
                        'UPDATE_UNAVAILABLE',
                        `Cannot update "${item.packageName}": registry candidate ${targetVersion} is older than locked version ${item.lockedVersion}; downgrades are unsupported`
                    );
                }
                if (targetVersion === item.lockedVersion) {
                    effect = 'none';
                    versionChange = { from: item.lockedVersion, to: targetVersion };
                    return createPreparedOperation({ effect, item, questions: [], target: request.target, versionChange, view });
                }
                try {
                    previousExtension = await resolveExtension(
                        { ...item.entry, version: item.lockedVersion, official: true },
                        projectRoot,
                        { install: true, exactVersion: item.lockedVersion, resolveVersion }
                    );
                    extension = await resolveExtension({ ...item.entry, version: targetVersion, official: true }, projectRoot, {
                        install: true,
                        exactVersion: targetVersion,
                        resolveVersion,
                    });
                } catch (/** @type {any} */ cause) {
                    throw new PackageOperationError(
                        'UPDATE_UNAVAILABLE',
                        `Cannot update "${item.packageName}": ${cause.message ?? String(cause)}`
                    );
                }
                if (item.kind === 'plugin') assertCompatible(item.packageName, extension.__packageManifest, projectRoot);
                resolvedVersion = targetVersion;
                versionChange = { from: item.lockedVersion, to: targetVersion };
            } else if (requiresExtension(item, effect)) {
                extension = await ensurePackageExtension(item, projectRoot, resolveVersion);
                resolvedVersion = extension.__packageVersion ?? resolvedVersion;
                if (item.kind === 'plugin') assertCompatible(item.packageName, extension.__packageManifest, projectRoot);
            }

            const questions =
                (effect === 'setup' || effect === 'restore' || effect === 'update') && typeof extension?.prompts === 'function'
                    ? (extension.prompts(
                          new Tree(projectRoot),
                          effect === 'update' ? { operation: 'update', ...versionChange } : { operation: effect }
                      ) ?? [])
                    : [];

            return createPreparedOperation({
                effect,
                item: { ...item, ext: extension, previousExtension, resolvedVersion },
                questions,
                target: request.target,
                versionChange,
                view,
            });
        },
    });
}

/** @param {import('./inventory.js').PackageItem} item @param {PackageTarget} target @returns {PackageEffect} */
function deriveEffect(item, target) {
    if (target === 'managed') {
        if (item.state === 'installed-managed') return 'none';
        if (item.state === 'installed-unmanaged') return 'adopt';
        if (item.state === 'applied') return 'restore';
        if (item.state === 'available') return 'setup';
        throw new PackageOperationError(
            'PACKAGE_UNAVAILABLE',
            `PKG BLD package "${item.entry.name}" is unavailable${item.error ? `: ${item.error}` : ''}`
        );
    }
    if (target === 'updated') {
        if (!item.managed) {
            throw new PackageOperationError('UPDATE_UNAVAILABLE', `Cannot update "${item.entry.name}": adopt or add it first`);
        }
        return 'update';
    }
    if (target === 'absent') return item.installed || item.managed ? 'remove' : 'none';
    throw new TypeError(`Unknown package target: ${target}`);
}

/** @param {import('./inventory.js').PackageItem} item @param {PackageEffect} effect */
function requiresExtension(item, effect) {
    if (!item.hasExtensionContract) return false;
    return effect === 'setup' || effect === 'restore' || effect === 'remove';
}

/**
 * @param {{
 *   effect: PackageEffect,
 *   item: PreparedPackageItem,
 *   questions: import('./types.js').Option[],
 *   target: PackageTarget,
 *   view: PackageView,
 *   versionChange?: { from: string, to: string } | null
 * }} params
 * @returns {PreparedPackageOperation}
 */
function createPreparedOperation({ effect, item, questions, target, view, versionChange = null }) {
    let staged = false;
    return Object.freeze({
        package: view,
        target,
        effect,
        versionChange: versionChange ? Object.freeze({ ...versionChange }) : null,
        requiresInstall: effect === 'update' && item.kind === 'plugin',
        questions: Object.freeze(
            questions.map(question => Object.freeze('list' in question ? { ...question, list: [...question.list] } : { ...question }))
        ),

        async stage(project, answers = {}) {
            if (staged) throw new Error(`Package operation for "${view.name}" has already been staged`);
            staged = true;
            if (effect === 'none') return { package: view, effect };

            const intent = /** @type {PackageIntent} */ (
                effect === 'adopt' ? 'adopt' : effect === 'remove' ? 'remove' : effect === 'update' ? 'update' : 'setup'
            );
            const preparedItem = { ...item, intent, options: answers };
            await project.stagePackageOperation(item.entry.name, ({ tree, projectLock, reportConflict }) =>
                applyPackageIntent(preparedItem, tree, projectLock, reportConflict)
            );
            return { package: view, effect };
        },
    });
}

/**
 * Resolve extension behavior on demand. Locked entries always request their exact version.
 * @param {import('./inventory.js').PackageItem} item
 * @param {string} projectRoot
 * @param {(packageName: string, selector: string) => Promise<string>} resolveVersion
 */
async function ensurePackageExtension(item, projectRoot, resolveVersion) {
    if (!item.hasExtensionContract) throw new Error(`Package "${item.packageName}" does not provide create-pkgbld extension behavior`);
    if (item.ext && (!item.lockedVersion || item.ext.__packageVersion === item.lockedVersion)) return item.ext;
    const entry = item.lockedVersion ? { ...item.entry, version: item.lockedVersion, official: true } : item.entry;
    const ext = await resolveExtension(entry, projectRoot, {
        install: true,
        exactVersion: item.lockedVersion ?? undefined,
        resolveVersion,
    });
    item.ext = ext;
    item.error = null;
    item.resolvedVersion = ext.__packageVersion ?? item.resolvedVersion;
    return ext;
}

/**
 * @param {PreparedPackageItem & { intent: PackageIntent, options: import('./types.js').OptionsValue }} item
 * @param {import('./tree.js').Tree} tree
 * @param {{ set(packageName: string, version: string): void, remove(packageName: string): void }} projectLock
 * @param {(conflict: any) => void} reportConflict
 */
async function applyPackageIntent(item, tree, projectLock, reportConflict) {
    if (item.intent === 'adopt') {
        const version = item.resolvedVersion;
        if (!version)
            throw new PackageOperationError('VERSION_UNRESOLVED', `Cannot adopt "${item.packageName}": exact version is unavailable`);
        projectLock.set(item.packageName, version);
        return;
    }

    if (item.intent === 'setup') {
        const ext = item.ext;
        if (!ext) throw new Error(`Package "${item.packageName}" extension was not prepared`);
        await runSetup(ext, tree, item.options);
        const version = ext.__packageVersion;
        if (!version) throw new Error(`Cannot lock "${item.packageName}": its exact package version could not be resolved`);
        projectLock.set(item.packageName, version);
        return;
    }

    if (item.intent === 'update') {
        const previous = item.previousExtension;
        const target = item.ext;
        const fromVersion = item.lockedVersion;
        const toVersion = item.resolvedVersion;
        if (!previous || !target || !fromVersion || !toVersion) throw new Error(`Package "${item.packageName}" update was not prepared`);
        const exclude =
            item.kind === 'plugin'
                ? ['dependencies', 'devDependencies', 'peerDependencies'].map(field => `dependency:${field}:${item.packageName}`)
                : [];
        await runExtensionUpdate({
            previous,
            target,
            tree,
            fromVersion,
            toVersion,
            options: item.options,
            exclude,
            reportConflict,
        });
        if (item.kind === 'plugin') {
            removePluginDependencies(tree, item.packageName);
            tree.addDependency(item.packageName, toVersion, 'devDependencies');
        }
        projectLock.set(item.packageName, toVersion);
        return;
    }

    if (item.ext) await runRemove(item.ext, tree, item.options);
    if (item.kind === 'plugin') removePluginDependencies(tree, item.packageName);
    projectLock.remove(item.packageName);
}

/** @param {string} packageName @param {Record<string, any> | undefined} manifest @param {string} projectRoot */
function assertCompatible(packageName, manifest, projectRoot) {
    try {
        assertPluginCompatible(packageName, manifest, projectRoot);
    } catch (/** @type {any} */ error) {
        throw new PackageOperationError('PLUGIN_INCOMPATIBLE', error.message ?? String(error));
    }
}

/** @param {import('./tree.js').Tree} tree @param {string} packageName */
function removePluginDependencies(tree, packageName) {
    tree.updateJson('package.json', pkg => {
        for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
            if (!pkg[field] || !(packageName in pkg[field])) continue;
            delete pkg[field][packageName];
            if (Object.keys(pkg[field]).length === 0) delete pkg[field];
        }
        return pkg;
    });
}

/** @param {import('./inventory.js').PackageItem} item @returns {PackageView} */
function toPackageView(item) {
    return Object.freeze({
        id: item.packageName,
        name: item.entry.name,
        description: item.entry.description ?? '',
        tags: Object.freeze([...(item.entry.tags ?? [])]),
        kind: item.kind,
        state: item.state,
        error: item.error,
    });
}
