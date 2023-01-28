import { Priotiry, Provider } from '../types';

export default async function(provide: Provider) {
    const { default: pluginTypescript } = await import('rollup-plugin-typescript2');

    provide(() => pluginTypescript(), Priotiry.transpile);
}
