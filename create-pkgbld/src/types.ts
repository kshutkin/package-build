export type Option = ({
    title: string;
    field: string;
    type?: undefined | 'toggle' | 'list';
} | {
    title: string;
    field: string;
    type: 'multiselect';
    list: string[];
} | {
    title: string;
    field: string;
    type: 'select';
    list: string[];
}) & ({
    initialValue?: string;
} | {
    items: Option[];
    mutateInnerObject: boolean;
});

export type PackageJson = {
    private?: boolean,
    version?: string,
    name?: string,
    license?: string,
    author?: string | {
        name?: string,
        email?: string,
        url?: string
    },
    description?: string,
    scripts?: {
        build?: string,
        lint?: string
    },
    dependencies?: Record<string, string>,
    devDependencies?: Record<string, string>,
    peerDependencies?: Record<string, string>,
    [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export type PkgInfo = {
    readme: string;
    pkg: PackageJson;
    mode: 'create' | 'update';
};

export type OptionsValue = {
    [key: string]: undefined | null | number | boolean | string | OptionsValue;
};