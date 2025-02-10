import { Priority } from '../priorities';
import type { Provider } from '../types';

export default async function(provider: Provider) {
    const pluginJson = await provider.import('@rollup/plugin-json');

    provider.provide(() => pluginJson(), Priority.preprocess);
}