#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv.shift() ?? 'help';

try {
    const cmdFn = await import(`./c6s/${cmd}.js`);
    await cmdFn[cmd](...argv);
} catch (e) {
    console.error(e.code === 'ERR_MODULE_NOT_FOUND' ? `Unknown command: ${cmd}` : e);
    process.exit(1);
}