// JevLint-LE is DecisionLint since 1.0.0. This version of the old extension
// lints nothing: the new one is a different id, so both can be installed at
// once, and two linters would report every finding twice. Its one act is a
// notice that installs the new extension and removes this one.
const vscode = require('vscode');

const OLD_ID = 'nolindnaidoo.jevlint-le';
const NEW_ID = 'nolindnaidoo.decisionlint';
const DISMISSED = 'jevlint-le.pointer.dismissed';

const INSTALL = 'Install DecisionLint';
const REMOVE = 'Remove JevLint-LE';
const LATER = 'Later';
const NEVER = "Don't show again";

async function offer(context) {
	if (context.globalState.get(DISMISSED)) return;
	const installed = vscode.extensions.getExtension(NEW_ID) !== undefined;
	const message = installed
		? 'DecisionLint is installed, and this JevLint-LE is only a pointer to it. Remove JevLint-LE?'
		: 'JevLint-LE is now DecisionLint, which lints the questions sent to every decision-model platform. This version of JevLint-LE lints nothing. Install DecisionLint?';
	const choice = await vscode.window.showInformationMessage(
		message,
		installed ? REMOVE : INSTALL,
		LATER,
		NEVER,
	);
	if (choice === NEVER) await context.globalState.update(DISMISSED, true);
	if (choice !== INSTALL && choice !== REMOVE) return;
	if (choice === INSTALL)
		await vscode.commands.executeCommand(
			'workbench.extensions.installExtension',
			NEW_ID,
		);
	await vscode.commands.executeCommand(
		'workbench.extensions.uninstallExtension',
		OLD_ID,
	);
}

function activate(context) {
	// Not awaited: activation must not wait on a toast, which settles only
	// when it closes.
	void offer(context);
}

function deactivate() {}

module.exports = { activate, deactivate };
