import { Priority } from '../priorities';
import type { CliOptions, Provider } from '../types';

export default async function(provider: Provider, config: CliOptions, inputs: string[]) {
    const typescriptInputs = inputs.filter(input => input.endsWith('.ts') || input.endsWith('.tsx'));
    if (typescriptInputs.length > 0) {
        const pluginTypescript = await provider.import('rollup-plugin-typescript2');

        provider.provide(() => pluginTypescript(), Priority.transpile, typescriptInputs.length === inputs.length ? undefined : { inputs: typescriptInputs });
    }
}
