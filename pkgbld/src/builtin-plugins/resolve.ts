import { Priority } from '../priorities';
import type { Provider } from '../types';

export default async function(provider: Provider) {
    const pluginResolve = await provider.import('@rollup/plugin-node-resolve');

    provider.provide(() => pluginResolve(), Priority.resolve);
}
