import { Priotiry, Provider } from '../types';

export default async function(provider: Provider) {
    const pluginResolve = await provider.import('@rollup/plugin-node-resolve');

    provider.provide(() => pluginResolve(), Priotiry.resolve);
}
