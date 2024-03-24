export const Priority = {
    preprocess: 1000,
    cleanup: 1000,
    externals: 2000,
    resolve: 3000,
    commonjs: 4000,
    transpile: 6000,
    compress: 10000,
    finalize: 20000
} as const;