import { lstatSync, type Stats, statSync } from 'node:fs';
import type { Entry } from './files';

// What the two process entry points share: the real disk, read the one way,
// and the interrupt, listened for the one way.

function kindOf(stats: Stats): Entry['kind'] {
	if (stats.isDirectory()) return 'dir';
	if (stats.isFile()) return 'file';
	// A pipe, a socket or a device. Reading one can block for as long as nobody
	// writes to it, so it is named and never opened.
	return 'other';
}

type Interrupts = Readonly<{
	once: (event: 'SIGINT', listener: () => void) => unknown;
}>;

/**
 * A signal that aborts on the user's interrupt. Listening for the interrupt
 * is what stops it ending the process, so nothing listens until a call asks
 * to be stopped, and one listener serves every call until it fires: the
 * server once added a listener per paid call and never took one away. After
 * an interrupt the next call arms a fresh signal, and a second interrupt with
 * nothing armed ends the process, as on the command line.
 */
export function createStopSignal(interrupts: Interrupts): () => AbortSignal {
	let armed: AbortController | undefined;
	return () => {
		if (armed) return armed.signal;
		const stop = new AbortController();
		armed = stop;
		interrupts.once('SIGINT', () => {
			armed = undefined;
			stop.abort();
		});
		return stop.signal;
	};
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
