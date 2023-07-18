import { Priority, Provider } from '../types';

export default async function(provider: Provider) {
    const pluginTypescript = await provider.import('rollup-plugin-typescript2');

    provider.provide(() => pluginTypescript(), Priority.transpile);
}
