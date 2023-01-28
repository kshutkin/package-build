import { Priotiry, Provider } from '../types';

export default async function(provide: Provider) {
    const { default: pluginClean } = await import('@rollup-extras/plugin-clean');

    const pluginInstance = pluginClean();

    provide(pluginFactory, Priotiry.cleanup, { outputPlugin: true });

    let firstPluginInstance = true;

    function pluginFactory() {
        const result = firstPluginInstance ? pluginInstance : pluginInstance.api.addInstance();
        firstPluginInstance = false;
        return result;
    }
}
