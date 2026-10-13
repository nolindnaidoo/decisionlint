import { describe, expect, it } from 'vitest';
import { findInstalled } from './installed';

const disk = (tree: Record<string, string>) => ({
	isFile: (path: string) => path in tree,
	read: (path: string) => {
		const text = tree[path];
		if (text === undefined) throw new Error('ENOENT');
		return text;
	},
});

// The copy, or a failure: a test that expects one is not satisfied by an unreadable one.
const copy = (found: ReturnType<typeof findInstalled>) => {
	if (!found || 'problem' in found) throw new Error('no readable copy found');
	return found;
};

describe('the copy a project has installed', () => {
	it('is found in the node_modules nearest the file', () => {
		const fs = disk({
			'/work/node_modules/jevlint-le/package.json': '{ "version": "0.1.0" }',
			'/work/app/node_modules/jevlint-le/package.json':
				'{ "version": "0.2.0" }',
		});
		expect(findInstalled('/work/app/src/q.ts', '/work', fs)).toEqual({
			dir: '/work/app/node_modules/jevlint-le',
			version: '0.2.0',
			library: undefined,
		});
		expect(copy(findInstalled('/work/lib/q.ts', '/work', fs)).version).toBe(
			'0.1.0',
		);
	});

	it('is not looked for above the folder the search stops at', () => {
		const fs = disk({
			'/node_modules/jevlint-le/package.json': '{ "version": "9.9.9" }',
		});
		expect(findInstalled('/work/app/q.ts', '/work', fs)).toBeUndefined();
		// A file opened on its own has no folder to stop at.
		expect(copy(findInstalled('/work/app/q.ts', undefined, fs)).version).toBe(
			'9.9.9',
		);
	});

	it('is nothing when the project has none', () => {
		expect(findInstalled('/work/q.ts', '/work', disk({}))).toBeUndefined();
	});

	it.each([
		['not JSON', '{', 'is not JSON'],
		['no version', '{ "name": "jevlint-le" }', 'has no version'],
		['a version that is not text', '{ "version": 2 }', 'has no version'],
	])(
		'is named, with the problem, when its manifest holds %s',
		(_, manifest, problem) => {
			const fs = disk({
				'/work/node_modules/jevlint-le/package.json': manifest,
			});
			expect(findInstalled('/work/q.ts', '/work', fs)).toEqual({
				dir: '/work/node_modules/jevlint-le',
				problem,
			});
		},
	);

	it('is named, with the problem, when its manifest cannot be read', () => {
		const at = '/work/node_modules/jevlint-le/package.json';
		const fs = {
			isFile: (path: string) => path === at,
			read: () => {
				throw new Error('EACCES');
			},
		};
		expect(findInstalled('/work/q.ts', '/work', fs)).toEqual({
			dir: '/work/node_modules/jevlint-le',
			problem: 'could not be read',
		});
	});

	it('names the library file when the manifest has one, inside the package', () => {
		const at = '/work/node_modules/jevlint-le/package.json';
		const found = (main: string) =>
			copy(
				findInstalled(
					'/work/q.ts',
					'/work',
					disk({ [at]: `{ "version": "0.3.0", "main": "${main}" }` }),
				),
			).library;
		expect(found('lib.js')).toBe('/work/node_modules/jevlint-le/lib.js');
		expect(found('./lib.js')).toBe('/work/node_modules/jevlint-le/lib.js');
		// An absolute path in a manifest must not send the editor elsewhere.
		expect(found('/etc/lib.js')).toBe(
			'/work/node_modules/jevlint-le/etc/lib.js',
		);
	});

	it('reads Windows paths as they are written', () => {
		const fs = disk({
			'C:\\work\\node_modules\\jevlint-le\\package.json':
				'{ "version": "0.2.0" }',
		});
		expect(copy(findInstalled('C:\\work\\src\\q.ts', 'C:\\work', fs)).dir).toBe(
			'C:\\work\\node_modules\\jevlint-le',
		);
	});
});
