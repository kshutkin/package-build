export interface Replacer {
    name: string;
    used: () => void;
}

export type Json = null | string | number | boolean | Json[] | { [name: string]: Json };