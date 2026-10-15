import { KNOWN_VERSION, MODEL_ALIASES } from '../lint/limits';

/** The models page as Markdown, which holds the alias table without the site's markup around it. */
export const MODELS_PAGE = 'https://docs.typesafe.ai/models.md';

export type ReleaseCheck = Readonly<{
	/** Reasons the declared version is wrong, or cannot be shown to be right. */
	failures: ReadonlyArray<string>;
	warnings: ReadonlyArray<string>;
}>;

/** The versioned id each alias points to, read from the rows of the alias table. */
export function readAliases(page: string): ReadonlyMap<string, string> {
	const found = new Map<string, string>();
	for (const row of page.matchAll(
		/^\|\s*`(jev-[a-z]+)`\s*\|\s*`(jev-\d+\.\d+\.\d+)`\s*\|/gm,
	)) {
		const [, alias, version] = row;
		if (alias && version && MODEL_ALIASES.has(alias)) found.set(alias, version);
	}
	return found;
}

/**
 * Whether `KNOWN_VERSION` is still what `jev-latest` points to. A page the
 * alias cannot be read from is a failure, never a pass: a check that goes
 * quiet when the vendor moves a table would report "current" for ever.
 */
export function checkRelease(page: string): ReleaseCheck {
	const aliases = readAliases(page);
	const latest = aliases.get('jev-latest');
	if (latest === undefined) {
		return {
			failures: [
				`${MODELS_PAGE} no longer says what jev-latest points to. Read the page and mend readAliases in src/ask/released.ts.`,
			],
			warnings: [],
		};
	}
	const failures =
		latest === KNOWN_VERSION
			? []
			: [
					`jev-latest points to ${latest} and KNOWN_VERSION is ${KNOWN_VERSION}. Move KNOWN_VERSION and VERIFIED_ON in src/lint/limits.ts, then recalibrate before moving DEFAULT_MODEL.`,
				];
	const preview = aliases.get('jev-preview');
	const warnings =
		preview !== undefined && preview !== latest
			? [`jev-preview points to ${preview}, ahead of jev-latest.`]
			: [];
	return { failures, warnings };
}
