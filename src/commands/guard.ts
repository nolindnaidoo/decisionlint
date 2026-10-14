import { blocked } from '../ui/notifier';

/**
 * Wraps a command body. A body that throws is otherwise a command that did
 * nothing: the editor logs the rejection where no user looks, and the command
 * reads as broken. `what` is the command in a few words, as the subject of
 * the sentence the user sees.
 */
export function guarded(
	what: string,
	body: () => unknown,
): () => Promise<void> {
	return async () => {
		try {
			await body();
		} catch (thrown) {
			const reason = thrown instanceof Error ? thrown.message : String(thrown);
			blocked(`${what} could not finish: ${reason}`);
		}
	};
}
