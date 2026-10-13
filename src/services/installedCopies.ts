import * as vscode from 'vscode';
import { findInstalled, type Installed } from '../config/installed';
import { type ConfigFs, parent } from '../config/projectConfig';

// Asked on every lint, so the answer for a folder is kept this long. A
// project's packages change with an install, not with a keystroke.
const KEPT_MS = 10_000;
// A workspace run asks about every folder it has, and the answers once
// stayed for the life of the window. Past this many, the folders whose time
// is up leave first, then the one asked about longest ago.
const MOST_KEPT = 512;

/** The copy of this tool a document's project has installed, if it has one. */
export type InstalledLookup = (
	document: vscode.TextDocument,
) => Installed | undefined;

export function createInstalledLookup(fs: ConfigFs): InstalledLookup {
	// In the order the folders were last asked about, which is what a Map keeps.
	const known = new Map<string, { at: number; found: Installed | undefined }>();
	const makeRoom = (now: number): void => {
		if (known.size < MOST_KEPT) return;
		for (const [dir, kept] of known)
			if (now - kept.at >= KEPT_MS) known.delete(dir);
		if (known.size < MOST_KEPT) return;
		const oldest = known.keys().next().value;
		if (oldest !== undefined) known.delete(oldest);
	};
	return (document) => {
		// A file that is not on disk has no project around it.
		if (document.uri.scheme !== 'file') return undefined;
		const file = document.uri.fsPath;
		const dir = parent(file);
		const now = Date.now();
		const kept = known.get(dir);
		if (kept && now - kept.at < KEPT_MS) return kept.found;
		const folder = vscode.workspace.getWorkspaceFolder(document.uri);
		const found = findInstalled(file, folder?.uri.fsPath, fs);
		// Removed before it is set again, so a refreshed folder is the newest.
		known.delete(dir);
		makeRoom(now);
		known.set(dir, { at: now, found });
		return found;
	};
}
