# xc6

eXecute c(ommand) (xc6) is a command line tool to execute commands in a package.json script or a shell script.

Why:

- cross-platform
- lightweight
- no dependencies
- no need to install a package globally
- fast

Notes

- It is not a reimplementation of unix commands, but a simple wrapper around nodejs fs module.
- No glob patterns are supported.

[Changelog](./CHANGELOG.md)

## rm

Remove a file or directory.

### Usage

```sh
xc6 rm <file | directory>
```

## mv

Move a file or directory.

### Usage

```sh
xc6 mv <source> <destination>
```

## cp

Copy a file or directory.

### Usage

```sh
xc6 cp <source> <destination>
```

## ln

Create a link to a file or directory.

### Usage

```sh
xc6 ln <existingPath> <newPath>
```

# License

[MIT](https://github.com/kshutkin/package-build/blob/main/LICENSE)