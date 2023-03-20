import { Priotiry, Provider } from '../types';

export default async function(provider: Provider) {
    const pluginClean = await provider.import('@rollup-extras/plugin-clean');

    const pluginInstance = pluginClean();

    provider.provide(pluginFactory, Priotiry.cleanup, { outputPlugin: true });

    let firstPluginInstance = true;

    function pluginFactory() {
        const result = firstPluginInstance ? pluginInstance : pluginInstance.api.addInstance();
        firstPluginInstance = false;
        return result;
    }
}
