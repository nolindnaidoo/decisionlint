import { basename } from 'node:path';
import * as vscode from 'vscode';
import {
	CONFIG_FILE,
	type ConfigFs,
	createConfigLoader,
	folderOf,
	isExcluded,
} from '../config/projectConfig';
import type { LintOptions } from '../types';

/** The lint settings for a document, or why its settings file could not be used. */
export type Resolved =
	| Readonly<{
			options: LintOptions;
			/** True when the settings file leaves this document out. */
			excluded?: boolean;
	  }>
	| Readonly<{ problem: string }>;

export type ProjectConfigs = Readonly<{
	/**
	 * The settings that apply to a document. A `jevlint-le.json` in its folder
	 * or one above it, no higher than the workspace folder, replaces the editor's own
	 * settings, so the editor reports what the command line would. `editor` is
	 * those settings, or the reason they cannot be used, which is the answer
	 * when no file replaces them.
	 */
	for: (
		document: vscode.TextDocument,
		editor: LintOptions | string,
	) => Resolved;
	dispose: () => void;
}>;

type Deps = Readonly<{
	fs: ConfigFs;
	/** Called when a settings file is written, added or removed. */
	onChange: () => void;
}>;

export function createProjectConfigs(deps: Deps): ProjectConfigs {
	const loader = createConfigLoader(deps.fs);
	const watcher = vscode.workspace.createFileSystemWatcher(`**/${CONFIG_FILE}`);
	const changed = (): void => {
		loader.clear();
		deps.onChange();
	};
	const subscriptions = [
		watcher.onDidChange(changed),
		watcher.onDidCreate(changed),
		watcher.onDidDelete(changed),
	];

	const fromEditor = (editor: LintOptions | string): Resolved =>
		typeof editor === 'string' ? { problem: editor } : { options: editor };

	return Object.freeze({
		for: (
			document: vscode.TextDocument,
			editor: LintOptions | string,
		): Resolved => {
			// A file that is not on disk has no folder to look in.
			if (document.uri.scheme !== 'file') return fromEditor(editor);
			const file = document.uri.fsPath;
			const folder = vscode.workspace.getWorkspaceFolder(document.uri);
			// A file opened on its own has no folder to stop at, so the search runs to the top.
			const found = loader.for(file, folder?.uri.fsPath);
			if (!found) return fromEditor(editor);
			if (typeof found.options === 'string')
				return { problem: `${basename(found.path)}: ${found.options}` };
			return {
				options: found.options,
				excluded: isExcluded(found.options.exclude, folderOf(found.path), file),
			};
		},
		dispose: () => {
			for (const subscription of subscriptions) subscription.dispose();
			watcher.dispose();
		},
	});
}
