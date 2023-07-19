export type Option = {
    title: string;
    field: string;
} & ({
    initialValue?: string;
} | {
    items: Option[];
    mutateInnerObject: boolean;
});

export type PkgInfo = {
    readme: string;
    pkg: object;
};

export type OptionsValue = {
    [key: string]: string | OptionsValue;
};