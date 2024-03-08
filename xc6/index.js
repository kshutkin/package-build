const argv = process.argv.slice(2);

const command = argv[0];

switch (command) {
    case 'rm':
        if (argv.length < 2) {
            console.log('Usage: rm <path>');
            process.exit(-1);
        }
        const rm = await import('./rm.js');
        await rm.default(argv[1]);
        break;
    default:
        console.log('Command not recognized.');
        process.exit(-1);
}

process.exit(0);
