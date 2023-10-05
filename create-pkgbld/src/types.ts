import { PackageJson } from 'options';

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
    render?: (option: Option, value: OptionsValue) => string;
});

export type PkgInfo = {
    readme: string;
    pkg: PackageJson;
    mode: 'create' | 'update';
};

export type OptionsValue = {
    [key: string]: undefined | null | number | boolean | string | OptionsValue;
};