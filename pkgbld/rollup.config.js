import rollupExtrasPluginClean from "@rollup-extras/plugin-clean";

import rollupPluginCommonjs from "@rollup/plugin-commonjs";

import rollupExtrasPluginExternals from "@rollup-extras/plugin-externals";

import rollupPluginNodeResolve from "@rollup/plugin-node-resolve";

import rollupPluginTypescript2 from "rollup-plugin-typescript2";

import rollupExtrasPluginBinify from "@rollup-extras/plugin-binify";

export default [ {
    input: [ "./src/index.ts" ],
    output: [ {
        format: "es",
        dir: "dist",
        entryFileNames: "[name].mjs",
        plugins: [ rollupExtrasPluginClean() ],
        sourcemap: false,
        chunkFileNames: "[name].mjs"
    }, {
        format: "cjs",
        dir: "dist",
        entryFileNames: "[name].cjs",
        plugins: [ rollupExtrasPluginClean().api.addInstance(), rollupExtrasPluginBinify() ],
        sourcemap: false,
        chunkFileNames: "[name].cjs"
    } ],
    plugins: [ rollupExtrasPluginExternals(), rollupPluginNodeResolve(), rollupPluginCommonjs(), rollupPluginTypescript2() ]
} ];