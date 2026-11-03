# cli-test-helper

[![Branch coverage](https://raw.githubusercontent.com/kshutkin/package-build/coverage/cli-test-helper/badge.svg)](https://github.com/kshutkin/package-build/tree/coverage/cli-test-helper/coverage)

It is a very simple helper module to test command line tools.

# Installation

```sh
npm install --save-dev cli-test-helper
```

## API

```ts
/**
 * Converts a string to real files and directories in the file system.
 */
export function stringToFiles(data: string, baseDir: string): Promise<void>;
/**
 * Converts files and directories in the file system to a string.
 */
export function filesToString(baseDir: string): Promise<string>;
```

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)
