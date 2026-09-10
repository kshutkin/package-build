/** @typedef {import('pkgbld/options').PackageJson} PackageJson */

/**
 * @typedef {{
 *   title: string;
 *   field: string;
 *   initialValue?: string | string[] | boolean;
 * } & (
 *   | { type?: undefined | 'toggle' | 'list' | 'text' }
 *   | { type: 'multiselect' | 'select'; list: string[] }
 * )} Option
 */

/**
 * @typedef {{
 *   readme: string;
 *   pkg: PackageJson;
 *   mode: 'create' | 'update';
 * }} PkgInfo
 */

/**
 * @typedef {{
 *   [key: string]: undefined | null | number | boolean | string | string[] | OptionsValue;
 * }} OptionsValue
 */

export {};
