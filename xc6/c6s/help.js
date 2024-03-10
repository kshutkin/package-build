const helpText = `Usage: <command> [options]
Commands:
    rm <path> - Remove a file or directory.
    cp <src> <dest> - Copy a file or directory.
    mv <from> <to> - Move a file or directory.
    ln <existingPath> <newPath> - Create a hard link.
`;

export function help() {
    console.log(helpText);
}