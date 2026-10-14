/**
 * A model id read into its parts. One model is spelt many ways across the
 * platforms that serve it: `jev-1.13.0` at TypeSafe, `typesafe/jev-1.13` and
 * `~typesafe/jev-latest` at OpenRouter, `typesafe-ai/jev` at Vercel,
 * `gpt-6-luna-decisions-20261006` dated at a gateway. A rule reads the parts
 * and never matches a spelling, so a new spelling is a change here and not in
 * every rule that looks at a model.
 */
export type ModelId = Readonly<{
	/** Everything before the family: `typesafe/`, `~typesafe/`, `openai/`, or '' when bare. */
	prefix: string;
	family: ModelFamily;
	/** The numbers of a versioned id: `jev-1.13.0` is [1, 13, 0] and `typesafe/jev-1.13` is [1, 13]. */
	version: ReadonlyArray<number> | undefined;
	/** A floating alias, which moves when the vendor releases. */
	alias: 'latest' | 'preview' | undefined;
	/** A dated snapshot a gateway adds, `-20261006`. */
	snapshot: string | undefined;
	/** True when the `-decisions` word Vercel and LLM Gateway put after Luna is present. */
	decisions: boolean;
	/** A tier after a colon, as in `d1:free`. */
	tier: string | undefined;
}>;

export type ModelFamily = 'jev' | 'luna' | 'd1' | 'decision-1';

// The word each family is written as, in every spelling seen. A Map, because
// the key comes from the file.
const FAMILIES: ReadonlyMap<string, ModelFamily> = new Map([
	['jev', 'jev'],
	['gpt-6-luna', 'luna'],
	['d1', 'd1'],
	['microsoft-decision-1', 'decision-1'],
]);

// prefix, family, -decisions, -version or -alias, -snapshot, :tier. A version
// has a dot, which is what tells it from an eight-digit snapshot. A version
// followed by anything but a snapshot or a tier, `jev-2.0.0-preview`, is not
// a version this reads, and nor is an alias with numbers after it.
const MODEL_ID =
	/^(~?(?:[\w.-]+\/)*)(jev|gpt-6-luna|d1|microsoft-decision-1)(-decisions)?(?:-(\d+(?:\.\d+){1,2})|-(latest|preview))?(?:-(\d{8}))?(?::([\w.-]+))?$/;

/** The parts of a model id, or undefined for an id of no family this reads: a Hugging Face repo, an Ollama tag, a deployment name. */
export function parseModelId(value: string): ModelId | undefined {
	const match = MODEL_ID.exec(value);
	if (!match) return undefined;
	const [, prefix = '', word = '', decisions, version, alias, snapshot, tier] =
		match;
	const family = FAMILIES.get(word);
	if (!family) return undefined;
	return Object.freeze({
		prefix,
		family,
		version: version ? version.split('.').map(Number) : undefined,
		alias: alias as ModelId['alias'],
		snapshot,
		decisions: decisions !== undefined,
		tier,
	});
}

/** True for a Jev id whose version is above `than`, a bare versioned id, in any spelling. */
export function isNewerJev(value: string, than: string): boolean {
	const [ours, theirs] = [parseModelId(value), parseModelId(than)];
	if (ours?.family !== 'jev' || !ours.version || !theirs?.version) return false;
	const differs = ours.version.findIndex(
		(part, index) => part !== theirs.version?.[index],
	);
	return (
		differs !== -1 &&
		(ours.version[differs] ?? 0) > (theirs.version[differs] ?? 0)
	);
}

/**
 * The pinned id a floating Jev alias should become, written as the platform
 * that takes the alias writes its pinned ids, or undefined when no platform
 * documents one for this spelling. `known` is the bare versioned id the alias
 * points to today.
 *
 * - `jev-latest` -> `jev-1.13.0`: TypeSafe and Eden AI write the bare id.
 * - `~typesafe/jev-latest` -> `typesafe/jev-1.13`: OpenRouter drops the tilde
 *   and writes two numbers. https://openrouter.ai/docs/guides/community/jev,
 *   read 2026-10-14.
 */
export function pinnedSpelling(
	value: string,
	known: string,
): string | undefined {
	const [id, pin] = [parseModelId(value), parseModelId(known)];
	if (id?.family !== 'jev' || !id.alias || !pin?.version) return undefined;
	if (id.prefix === '') return `jev-${pin.version.join('.')}`;
	if (id.prefix === '~typesafe/')
		return `typesafe/jev-${pin.version.slice(0, 2).join('.')}`;
	return undefined;
}

/** True for a Jev alias in any spelling: the id moves when TypeSafe releases. */
export function isFloatingJev(value: string): boolean {
	const id = parseModelId(value);
	return id?.family === 'jev' && id.alias !== undefined;
}
