#!/usr/bin/env node
const argv = process.argv.slice(2);
const cmd = argv[0] || 'help';

try {
    const cmdFn = await import(`./c6s/${cmd}.js`);
    const result = await cmdFn[cmd](argv[1], argv[2]);
    if (result) {
        console.error(result);
    }
    process.exit(0);
} catch (e) {
    console.error(e.code === 'ERR_MODULE_NOT_FOUND' ? `Unknown command: ${cmd}` : e);
}

process.exit(-1);