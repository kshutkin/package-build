import { cliFlagsDefaults, toFormattedJson } from 'pkgbld/options';

import type { BuildConfiguration, PkgbldPlugin } from 'pkgbld';

export type Plugin = PkgbldPlugin;
export const defaults = cliFlagsDefaults;
export const formatted = toFormattedJson({ ready: true });
export const resolverConditions = (configuration: BuildConfiguration): readonly string[] => configuration.resolution.conditions;
export const configureResolution: PkgbldPlugin['configure'] = ({ draft }) => {
    draft.resolution.imports = true;
    draft.resolution.conditions.push('node');
};
