import { Priotiry, Provider } from '../types';

export default async function(provide: Provider) {
    const { default: pluginResolve } = await import('@rollup/plugin-node-resolve');

    provide(() => pluginResolve(), Priotiry.resolve);
}
