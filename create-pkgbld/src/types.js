/** @typedef {import('options').PackageJson} PackageJson */

/**
 * @typedef {(
 *   | {
 *       title: string;
 *       field: string;
 *       type?: undefined | 'toggle' | 'list';
 *     }
 *   | {
 *       title: string;
 *       field: string;
 *       type: 'multiselect';
 *       list: string[];
 *     }
 *   | {
 *       title: string;
 *       field: string;
 *       type: 'select';
 *       list: string[];
 *     }
 * ) & (
 *   | {
 *       initialValue?: string;
 *     }
 *   | {
 *       items: Option[];
 *       mutateInnerObject: boolean;
 *       render?: (option: Option, value: OptionsValue) => string;
 *     }
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
 *   [key: string]: undefined | null | number | boolean | string | OptionsValue;
 * }} OptionsValue
 */

export {};
