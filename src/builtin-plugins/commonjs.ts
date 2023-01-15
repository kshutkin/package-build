import { Priotiry, Provider } from '../types';

export default async function(provide: Provider) {
    const { default: pluginCommonjs } = await import('@rollup/plugin-commonjs');

    provide(() => pluginCommonjs(), Priotiry.commonjs);
}
