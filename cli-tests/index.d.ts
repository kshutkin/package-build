declare module 'cli-tests' {
	/**
	 * Converts a string to real files and directories in the file system.
	 * */
	export function stringToFiles(data: string, baseDir: string): Promise<void>;
	/**
	 * Converts files and directories in the file system to a string.
	 * */
	export function filesToString(baseDir: string): Promise<string>;
}

//# sourceMappingURL=index.d.ts.map