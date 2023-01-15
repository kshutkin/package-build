import type { getCliOptions } from './get-cli-options';
import { createProvider, plugins as pluginFactories } from './get-plugins-new';
// import type { getHelpers } from './helpers';

export async function getRollupConfigs(inputs: string[], config: ReturnType<typeof getCliOptions>/*, helpers: ReturnType<typeof getHelpers>*/) {
    const [provide, plugins] = createProvider();
    for (const factory of pluginFactories) {
        await factory(provide, config, inputs);
    }

    for(const plugin of plugins) {
        console.log(plugin.format, plugin.inputs, plugin.outputPlugin);
    }
}
