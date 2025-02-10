declare module 'cli-test-helper' {
	/**
	 * Converts a string to real files and directories in the file system.
	 * */
	export function stringToFiles(data: string, baseDir: string): Promise<void>;
	/**
	 * Converts files and directories in the file system to a string.
	 * */
	export function filesToString(baseDir: string, ignore?: string[] | undefined): Promise<string>;

	export {};
}

//# sourceMappingURL=index.d.ts.map