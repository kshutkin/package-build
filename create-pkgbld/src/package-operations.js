import { runRemove, runSetup } from './engine.js';
import { buildPackageInventory } from './inventory.js';
import { resolveInstalledPackage } from './package-resolution.js';
import { resolveExtension } from './registry.js';
import { Tree } from './tree.js';

/** @typedef {'managed' | 'absent'} PackageTarget */
/** @typedef {'setup' | 'restore' | 'adopt' | 'remove' | 'none'} PackageEffect */
/** @typedef {'setup' | 'remove' | 'adopt'} PackageIntent */
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
 *   questions: readonly import('./types.js').Option[],
 *   stage(project: import('./project-changes.js').ProjectChanges, answers?: import('./types.js').OptionsValue): Promise<{
 *     package: PackageView,
 *     effect: PackageEffect
 *   }>
 * }} PreparedPackageOperation
 */

export class PackageOperationError extends Error {
    /** @param {'PACKAGE_NOT_FOUND' | 'PACKAGE_UNAVAILABLE' | 'VERSION_UNRESOLVED'} code @param {string} message */
    constructor(code, message) {
        super(message);
        this.name = 'PackageOperationError';
        this.code = code;
    }
}

/**
 * Open package operations for one project snapshot.
 *
 * @param {{ projectRoot: string, registry: import('./registry.js').ExtensionEntry[] }} params
 */
export async function openPackageOperations({ projectRoot, registry }) {
    const items = await buildPackageInventory(registry, projectRoot);
    const inventory = Object.freeze(items.map(toPackageView));

    return Object.freeze({
        inventory,

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
            const effect = deriveEffect(item, request.target);
            if (effect === 'none') {
                return createPreparedOperation({ effect, item, questions: [], target: request.target, view });
            }

            /** @type {import('./registry.js').Extension | null} */
            let extension = item.ext;
            let resolvedVersion = item.resolvedVersion;
            if (effect === 'adopt') {
                resolvedVersion ??= resolveInstalledPackage(item.packageName, projectRoot)?.version ?? null;
                if (!resolvedVersion) {
                    throw new PackageOperationError(
                        'VERSION_UNRESOLVED',
                        `Cannot adopt "${item.packageName}": install project dependencies first so its exact version can be resolved`
                    );
                }
            } else if (requiresExtension(item, effect)) {
                extension = await ensurePackageExtension(item, projectRoot);
                resolvedVersion = extension.__packageVersion ?? resolvedVersion;
            }

            const questions =
                (effect === 'setup' || effect === 'restore') && typeof extension?.prompts === 'function'
                    ? (extension.prompts(new Tree(projectRoot)) ?? [])
                    : [];

            return createPreparedOperation({
                effect,
                item: { ...item, ext: extension, resolvedVersion },
                questions,
                target: request.target,
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
 *   item: import('./inventory.js').PackageItem,
 *   questions: import('./types.js').Option[],
 *   target: PackageTarget,
 *   view: PackageView
 * }} params
 * @returns {PreparedPackageOperation}
 */
function createPreparedOperation({ effect, item, questions, target, view }) {
    let staged = false;
    return Object.freeze({
        package: view,
        target,
        effect,
        questions: Object.freeze(
            questions.map(question => Object.freeze('list' in question ? { ...question, list: [...question.list] } : { ...question }))
        ),

        async stage(project, answers = {}) {
            if (staged) throw new Error(`Package operation for "${view.name}" has already been staged`);
            staged = true;
            if (effect === 'none') return { package: view, effect };

            const intent = /** @type {PackageIntent} */ (effect === 'adopt' ? 'adopt' : effect === 'remove' ? 'remove' : 'setup');
            const preparedItem = { ...item, intent, options: answers };
            await project.stagePackageOperation(item.entry.name, ({ tree, projectLock }) =>
                applyPackageIntent(preparedItem, tree, projectLock)
            );
            return { package: view, effect };
        },
    });
}

/**
 * Resolve extension behavior on demand. Locked entries always request their exact version.
 * @param {import('./inventory.js').PackageItem} item
 * @param {string} projectRoot
 */
async function ensurePackageExtension(item, projectRoot) {
    if (!item.hasExtensionContract) throw new Error(`Package "${item.packageName}" does not provide create-pkgbld extension behavior`);
    if (item.ext && (!item.lockedVersion || item.ext.__packageVersion === item.lockedVersion)) return item.ext;
    const entry = item.lockedVersion ? { ...item.entry, version: item.lockedVersion, official: true } : item.entry;
    const ext = await resolveExtension(entry, projectRoot, { install: true, exactVersion: item.lockedVersion ?? undefined });
    item.ext = ext;
    item.error = null;
    item.resolvedVersion = ext.__packageVersion ?? item.resolvedVersion;
    return ext;
}

/**
 * @param {import('./inventory.js').PackageItem & { intent: PackageIntent, options: import('./types.js').OptionsValue }} item
 * @param {import('./tree.js').Tree} tree
 * @param {{ set(packageName: string, version: string): void, remove(packageName: string): void }} projectLock
 */
async function applyPackageIntent(item, tree, projectLock) {
    if (item.intent === 'adopt') {
        const version = item.resolvedVersion;
        if (!version)
            throw new PackageOperationError('VERSION_UNRESOLVED', `Cannot adopt "${item.packageName}": exact version is unavailable`);
        projectLock.set(item.packageName, version);
        return;
    }

    if (item.intent === 'setup') {
        if (!item.hasExtensionContract && item.kind === 'plugin' && item.lockedVersion) {
            tree.addDependency(item.packageName, item.lockedVersion, 'devDependencies');
            projectLock.set(item.packageName, item.lockedVersion);
            return;
        }
        const ext = item.ext;
        if (!ext) throw new Error(`Package "${item.packageName}" extension was not prepared`);
        await runSetup(ext, tree, item.options);
        const version = ext.__packageVersion;
        if (!version) throw new Error(`Cannot lock "${item.packageName}": its exact package version could not be resolved`);
        projectLock.set(item.packageName, version);
        return;
    }

    if (item.ext) await runRemove(item.ext, tree, item.options);
    if (item.kind === 'plugin') removePluginDependencies(tree, item.packageName);
    projectLock.remove(item.packageName);
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
