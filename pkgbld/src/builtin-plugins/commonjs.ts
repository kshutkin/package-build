import { Priotiry, Provider } from '../types';

export default async function(provider: Provider) {
    const pluginCommonjs = await provider.import('@rollup/plugin-commonjs');

    provider.provide(() => pluginCommonjs(), Priotiry.commonjs);
}
