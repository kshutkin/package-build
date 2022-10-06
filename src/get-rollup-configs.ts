import { RollupOptions } from 'rollup';
import { getCliOptions } from './get-cli-options';
import { getBuildPlugins, getOutputPlugins } from './get-plugins';
import { getHelpers, umdFilter } from './helpers';

export function getRollupConfigs(inputs: string[], config: ReturnType<typeof getCliOptions>, helpers: ReturnType<typeof getHelpers>) {
    const configs: RollupOptions[] = [];

    if (config.formats.includes('es')) {
        configs.push({
            input: inputs,
    
            output: {
                format: 'es',
                dir: config.dir,
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name].mjs',
                plugins: getOutputPlugins('es', config),
                sourcemap: config.sourcemapTargets.includes('es')
            },
    
            plugins: getBuildPlugins('es', config)
        });
    }

    if (config.formats.includes('cjs')) {
        configs.push({
            input: inputs,
    
            output: {
                format: 'cjs',
                dir: config.dir,
                entryFileNames: '[name].cjs',
                chunkFileNames: '[name].cjs',
                exports: 'auto',
                plugins: getOutputPlugins('cjs', config),
                sourcemap: config.sourcemapTargets.includes('cjs')
            },
    
            plugins: getBuildPlugins('cjs', config)
        });
    }

    const umdConfigs: RollupOptions[] = inputs.filter((input) => umdFilter(config, input)).map(currentInput => ({
        input: currentInput,
        output: {
            format: 'umd',
            dir: config.dir,
            entryFileNames: '[name].umd.js',
            name: helpers.getGlobalName(currentInput),
            globals: helpers.getExternalGlobalName,
            plugins: getOutputPlugins('umd', config),
            sourcemap: config.sourcemapTargets.includes('umd')
        },

        plugins: getBuildPlugins('umd', config, inputs, currentInput)
    }));

    if (umdConfigs && umdConfigs.length) {
        configs.push(...umdConfigs);
    }

    return configs;
}