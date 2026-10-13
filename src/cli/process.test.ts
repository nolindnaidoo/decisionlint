import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createStopSignal } from './process';

describe('the stop signal', () => {
	it('listens for the interrupt once, however many calls ask for it', () => {
		const interrupts = new EventEmitter();
		const stopSignal = createStopSignal(interrupts);
		const first = stopSignal();
		for (let i = 0; i < 50; i += 1) expect(stopSignal()).toBe(first);
		expect(interrupts.listenerCount('SIGINT')).toBe(1);
		expect(first.aborted).toBe(false);
	});

	it('aborts on the interrupt, and arms again for the next call', () => {
		const interrupts = new EventEmitter();
		const stopSignal = createStopSignal(interrupts);
		const first = stopSignal();
		interrupts.emit('SIGINT');
		expect(first.aborted).toBe(true);
		// Listening again is what keeps a second interrupt from ending the process,
		// so nothing listens until a call asks to be stopped.
		expect(interrupts.listenerCount('SIGINT')).toBe(0);
		const second = stopSignal();
		expect(second).not.toBe(first);
		expect(second.aborted).toBe(false);
		expect(interrupts.listenerCount('SIGINT')).toBe(1);
	});
});
