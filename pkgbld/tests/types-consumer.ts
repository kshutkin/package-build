import { cliFlagsDefaults, toFormattedJson } from 'pkgbld/options';

import type { PkgbldPlugin } from 'pkgbld';

export type Plugin = PkgbldPlugin;
export const defaults = cliFlagsDefaults;
export const formatted = toFormattedJson({ ready: true });
