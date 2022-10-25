import '@niceties/draftlog-appender';
import { createLogger, LogLevel } from '@niceties/logger';
import { OutputOptions, rollup, RollupOptions } from 'rollup';
import { createSubpackages } from './create-subpackages';
import { getCliOptions } from './get-cli-options';
import { getPackage } from './get-pkg';
import { getRollupConfigs } from './get-rollup-configs';
import { formatInput, formatOutput, getHelpers, getTimeDiff, toArray } from './helpers';
import { processPackage } from './process-pkg';
import { writePackage } from './write-pkg';

async function execute() {
    try {
        const [pkgPath, pkg] = await getPackage();
        const config = getCliOptions();
        const inputs = processPackage(pkg, config);
        const helpers = getHelpers((pkg as {name: string}).name);
        const rollupConfigs = getRollupConfigs(inputs, config, helpers);

        for (const config of rollupConfigs) {
            const logger = createLogger();
            const time = Date.now();
            logger.start(`building ${formatInput(config.input as string[])} → ${formatOutput(config.output, 'dir')}, ${formatOutput(config.output, 'format')}`, LogLevel.info);
            const bundle = await rollup(config as unknown as RollupOptions);
            await Promise.all(toArray(config.output as unknown as OutputOptions).map(config => bundle.write(config)));
            await bundle.close();
            logger.finish(`finished ${formatInput(config.input as string[])} → ${formatOutput(config.output, 'dir')}, ${formatOutput(config.output, 'format')} in ${getTimeDiff(time)}`, LogLevel.info);
        }

        await writePackage(pkgPath, pkg);
        await createSubpackages(inputs, config);
    } catch(e) {
        createLogger().finish(`${e}}`, LogLevel.error);
        process.exit(-1);
    }
}

execute();