export const greeting: string = 'hello';

export function add(a: number, b: number): number {
    return a + b;
}

interface Config {
    name: string;
    value: number;
}

export function createConfig(name: string, value: number): Config {
    return { name, value };
}
