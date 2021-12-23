import minimist from 'minimist';

const defaults = {
    formats: ['es', 'cjs'],
    umdTargets: [],
    compressTargets: ['umd'],
    sourcemapTargets: ['umd'],
    preprocess: [],
    dir: 'dist'
};

export function getCliOptions() {
    const parsedArgs = minimist(process.argv.slice(2));
    const umdTargets = parsedArgs.umd?.split(',').map((arg: string) => arg.trim()) ?? defaults.umdTargets;
    const compressTargets = parsedArgs.compress?.split(',').map((arg: string) => arg.trim()) ?? defaults.compressTargets;
    const sourcemapTargets = parsedArgs.sourcemaps?.split(',').map((arg: string) => arg.trim()) ?? defaults.sourcemapTargets;
    const formats = parsedArgs.formats?.split(',').map((arg: string) => arg.trim()) ?? defaults.formats;
    const preprocess = parsedArgs.preprocess?.split(',').map((arg: string) => arg.trim()) ?? defaults.preprocess;
    const dir = parsedArgs.dir ?? defaults.dir;

    return {
        umdTargets,
        compressTargets,
        sourcemapTargets,
        formats,
        preprocess,
        dir
    } as {
        umdTargets: string[],
        compressTargets: string[],
        sourcemapTargets: string[],
        formats: string[],
        preprocess: string[],
        dir: string
    };
}