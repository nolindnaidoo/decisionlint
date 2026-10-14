import { afterEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createInstalledLookup } from './installedCopies';

const fileAt = (path: string) =>
	({
		uri: vscode.Uri.parse(`file://${path}`),
	}) as unknown as vscode.TextDocument;

// A disk with no copy anywhere, counting how often it is asked.
const emptyDisk = () => ({ isFile: vi.fn(() => false), read: () => '' });

describe('the lookup of a project copy', () => {
	afterEach(() => vi.useRealTimers());

	it('asks the disk once per folder, then answers from memory', () => {
		const disk = emptyDisk();
		const lookup = createInstalledLookup(disk);
		lookup(fileAt('/work/a/q.json'));
		const asked = disk.isFile.mock.calls.length;
		expect(asked).toBeGreaterThan(0);
		lookup(fileAt('/work/a/r.json'));
		expect(disk.isFile).toHaveBeenCalledTimes(asked);
	});

	it('remembers at most 512 folders, and lets the one asked about longest ago leave first', () => {
		vi.useFakeTimers();
		const disk = emptyDisk();
		const lookup = createInstalledLookup(disk);
		lookup(fileAt('/work/d0/q.json'));
		// Past its time, so the next question about d0 goes to the disk and moves it to the newest end.
		vi.advanceTimersByTime(10_000);
		for (let i = 1; i < 512; i += 1) lookup(fileAt(`/work/d${i}/q.json`));
		lookup(fileAt('/work/d0/q.json'));
		const settled = disk.isFile.mock.calls.length;
		// The 513th folder pushes one out: d1, the oldest, not d0.
		lookup(fileAt('/work/d512/q.json'));
		const afterNew = disk.isFile.mock.calls.length;
		expect(afterNew).toBeGreaterThan(settled);
		lookup(fileAt('/work/d0/r.json'));
		expect(disk.isFile).toHaveBeenCalledTimes(afterNew);
		lookup(fileAt('/work/d1/r.json'));
		expect(disk.isFile.mock.calls.length).toBeGreaterThan(afterNew);
	});
});
