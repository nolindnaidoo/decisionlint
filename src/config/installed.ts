import { type ConfigFs, parent, under } from './projectConfig';

/** The name this tool is published under on npm, and so the folder a project installs it in. */
export const PACKAGE = 'jevlint-le';

/** A copy of this tool that a project has installed for itself. */
export type Installed = Readonly<{
	/** The package's own folder, inside a `node_modules`. */
	dir: string;
	version: string;
	/** The file its manifest names as the library, when it names one. Releases before 0.3.0 name none. */
	library: string | undefined;
}>;

/**
 * A copy that is there, under `node_modules`, and cannot be named: its
 * manifest could not be read. Not the same as no copy, which is the one
 * fallback the status bar says nothing about.
 */
export type UnreadableCopy = Readonly<{
	dir: string;
	/** What is wrong with its `package.json`, as the end of a sentence. */
	problem: string;
}>;

type Manifest = Readonly<{ version: string; main: string | undefined }>;

// The manifest, or what is wrong with it.
function manifestIn(fs: ConfigFs, path: string): Manifest | string {
	let text: string;
	try {
		text = fs.read(path);
	} catch {
		return 'could not be read';
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return 'is not JSON';
	}
	const { version, main } = (parsed ?? {}) as Partial<Record<string, unknown>>;
	if (typeof version !== 'string') return 'has no version';
	return { version, main: typeof main === 'string' ? main : undefined };
}

/**
 * The copy of this tool installed nearest to a file: in its folder's
 * `node_modules` or one above it, no higher than `stop`. Only the manifest
 * is read here. Nothing in the package is run.
 */
export function findInstalled(
	file: string,
	stop: string | undefined,
	fs: ConfigFs,
): Installed | UnreadableCopy | undefined {
	let dir = parent(file);
	while (true) {
		const packageDir = under(dir, 'node_modules', PACKAGE);
		const manifest = under(packageDir, 'package.json');
		if (fs.isFile(manifest)) {
			const read = manifestIn(fs, manifest);
			if (typeof read === 'string') return { dir: packageDir, problem: read };
			return {
				dir: packageDir,
				version: read.version,
				// Kept inside the package's folder, whatever the manifest says.
				library: read.main
					? under(packageDir, read.main.replace(/^\.?[\\/]+/, ''))
					: undefined,
			};
		}
		const above = parent(dir);
		if (dir === stop || above === dir) return undefined;
		dir = above;
	}
}
