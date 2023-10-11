import { PackageJson } from './types';

const scriptsToKeep = new Set([
    'preinstall',
    'install',
    'postinstall',
    'prepublish',
    'preprepare',
    'prepare',
    'postprepare'
]);

export function prunePkg(pkg: PackageJson, options: { kind: 'prune', profile: string }) {
    if (options.kind !== 'prune') {
        throw new Error('prunePkg should only be called in prune mode');
    }
    
    if (options.profile !== 'library') {
        throw new Error('only library profile is supported');
    }

    delete pkg.devDependencies;

    for (const key of Object.keys(pkg.scripts as Record<string, string>)) {
        if (!scriptsToKeep.has(key)) {
            delete (pkg.scripts as Record<string, string>)[key];
        }
    }

    if (Object.keys(pkg.scripts as Record<string, string>).length === 0) {
        delete pkg.scripts;
    }
}