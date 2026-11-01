import { isJsoncFile, parseJson, toFormattedJsonc } from 'pkgbld/json';
import { cliFlagsDefaults, toFormattedJson } from 'pkgbld/options';
import { getProjectTsConfig } from 'pkgbld/tsconfig';

import type { BuildConfiguration, PkgbldPlugin } from 'pkgbld';

export type Plugin = PkgbldPlugin;
export const defaults = cliFlagsDefaults;
export const formatted = toFormattedJson({ ready: true });
export const jsonc = toFormattedJsonc(parseJson('{"ready":true,}', true), '{"ready":false}');
export const acceptsJsonc: boolean = isJsoncFile('tsconfig.json');
export const configPath: string | undefined = getProjectTsConfig()?.path;
export const resolverConditions = (configuration: BuildConfiguration): readonly string[] => configuration.resolution.conditions;
export const configureResolution: PkgbldPlugin['configure'] = ({ draft }) => {
    draft.resolution.imports = true;
    draft.resolution.conditions.push('node');
};
