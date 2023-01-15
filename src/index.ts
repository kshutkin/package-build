import '@niceties/draftlog-appender';
import { createLogger, LogLevel } from '@niceties/logger';
// import { rollup, RollupOptions } from 'rollup';
// import { createSubpackages } from './create-subpackages';
import { getCliOptions } from './get-cli-options';
import { getPackage } from './get-pkg';
import { getRollupConfigs } from './get-rollup-configs-new';
// import { formatInput, formatOutput, getHelpers, toArray } from './helpers';
// import { mainLoggerText } from './messages';
import { processPackage } from './process-pkg';
// import { writePackage } from './write-pkg';
// import kleur from 'kleur';

async function execute() {
    //const time = Date.now();
    const blank = createLogger();
    blank.update(' ');
    const mainLogger = createLogger();
    mainLogger.update('preparing...');
    try {
        const [/*pkgPath*/, pkg] = await getPackage();
        const options = getCliOptions();
        const inputs = processPackage(pkg, options);
        //const helpers = getHelpers((pkg as { name: string }).name);
        //const rollupConfigs = 
        await getRollupConfigs(inputs, options/*, helpers*/);

        // const updater = mainLoggerText(options.sourceDir, options.dir, rollupConfigs.length, time);
        // mainLogger.start(updater());
       
        // await Promise.all(rollupConfigs.map(config => buildConfig(config, updater)));

        // await writePackage(pkgPath, pkg);
        // await createSubpackages(inputs, options);

        // mainLogger.finish(updater(true));
    } catch(e) {
        mainLogger.finish(`${e}}`, LogLevel.error);
        process.exit(-1);
    }

    // async function buildConfig(config: RollupOptions, updater: () => string) {
    //     const bundle = await rollup(config);
    //     await Promise.all(toArray(config.output).map(config => bundle.write(config)));
    //     await bundle.close();
    //     mainLogger(`${kleur.green('✓')} ${formatInput(config.input as string | string[])} [${formatOutput(config.output, 'format')}]`);
    //     mainLogger.update(updater());
    // }
}

execute();