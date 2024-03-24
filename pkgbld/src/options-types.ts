export type PackageJson = {
    private?: boolean,
    version?: string,
    name?: string,
    license?: string,
    readme?: string,
    author?: string | {
        name?: string,
        email?: string,
        url?: string
    },
    description?: string,
    scripts?: {
        [key: string]: string
    },
    repository?: {
        type?: string,
        url?: string
    },
    files?: string[],
    bugs?: string,
    homepage?: string,
    dependencies?: Record<string, string>,
    devDependencies?: Record<string, string>,
    peerDependencies?: Record<string, string>,
    exports?: Record<string, string | Record<string, string>>
}