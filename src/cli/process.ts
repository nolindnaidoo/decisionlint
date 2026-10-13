import { lstatSync, type Stats, statSync } from 'node:fs';
import type { Entry } from './files';

// What the two process entry points share: the real disk, read the one way.

function kindOf(stats: Stats): Entry['kind'] {
	if (stats.isDirectory()) return 'dir';
	if (stats.isFile()) return 'file';
	// A pipe, a socket or a device. Reading one can block for as long as nobody
	// writes to it, so it is named and never opened.
	return 'other';
}

/** The entry at a path, or undefined when there is none. */
export function stat(path: string): Entry | undefined {
	const found = statSync(path, { throwIfNoEntry: false });
	if (!found) return undefined;
	return {
		kind: kindOf(found),
		size: found.size,
		link: lstatSync(path).isSymbolicLink(),
	};
}
