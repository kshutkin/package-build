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
    dependencies?: Record<string, string>,
    devDependencies?: Record<string, string>,
    peerDependencies?: Record<string, string>
}