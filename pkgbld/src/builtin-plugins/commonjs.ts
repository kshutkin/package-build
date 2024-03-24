import { Priority } from '../priorities';
import { Provider } from '../types';

export default async function(provider: Provider) {
    const pluginCommonjs = await provider.import('@rollup/plugin-commonjs');

    provider.provide(() => pluginCommonjs(), Priority.commonjs);
}
