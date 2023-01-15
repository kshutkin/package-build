import minimist from 'minimist';

const defaults = {
    formats: ['es', 'cjs'],
    umdInputs: [],
    compressFormats: ['umd'],
    sourcemapFormats: ['umd'],
    preprocess: [],
    dir: 'dist',
    sourceDir: 'src'
};

export function getCliOptions() {
    const parsedArgs = minimist(process.argv.slice(2));
    const umdInputs = parsedArgs.umd?.split(',').map((arg: string) => arg.trim()) ?? defaults.umdInputs;
    const compressFormats = parsedArgs.compress?.split(',').map((arg: string) => arg.trim()) ?? defaults.compressFormats;
    const sourcemapFormats = parsedArgs.sourcemaps?.split(',').map((arg: string) => arg.trim()) ?? defaults.sourcemapFormats;
    const formats = parsedArgs.formats?.split(',').map((arg: string) => arg.trim()) ?? defaults.formats;
    const preprocess = parsedArgs.preprocess?.split(',').map((arg: string) => arg.trim()) ?? defaults.preprocess;
    const dir = parsedArgs.dir ?? defaults.dir;
    const sourceDir = parsedArgs.sourceDir ?? defaults.sourceDir;

    return {
        umdInputs,
        compressFormats,
        sourcemapFormats,
        formats,
        preprocess,
        dir,
        sourceDir
    } as {
        umdInputs: string[],
        compressFormats: string[],
        sourcemapFormats: string[],
        formats: string[],
        preprocess: string[],
        dir: string,
        sourceDir: string
    };
}