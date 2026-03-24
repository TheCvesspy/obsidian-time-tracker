import { TimeEntry, TimerState, PluginSettings } from '../types';
import { formatDateISO, formatTime24 } from '../utils';

export class TimerService {
	private updateInterval: number | null = null;
	private onUpdateCallback: (() => void) | null = null;
	/** Cached parse of startedAt to avoid repeated Date construction on every tick */
	private cachedStartMs: number | null = null;

	constructor(
		private getState: () => TimerState,
		private setState: (state: TimerState) => Promise<void>,
		private getSettings: () => PluginSettings
	) {}

	get isRunning(): boolean {
		return this.getState().isRunning;
	}

	get isPaused(): boolean {
		return this.getState().isPaused;
	}

	get currentDescription(): string {
		return this.getState().currentDescription;
	}

	get currentCategory(): string | null {
		return this.getState().currentCategory;
	}

	/** Start the timer with a description and optional category */
	async start(description: string, category: string | null): Promise<void> {
		if (this.isRunning) return;

		const now = new Date();
		this.cachedStartMs = now.getTime();

		await this.setState({
			isRunning: true,
			isPaused: false,
			startedAt: now.toISOString(),
			accumulatedMs: 0,
			currentDescription: description,
			currentCategory: category,
		});

		this.startUIUpdates();
	}

	/** Pause the running timer */
	async pause(): Promise<void> {
		const state = this.getState();
		if (!state.isRunning || state.isPaused || !state.startedAt) return;

		// Add current segment to accumulated time
		const segmentMs = Date.now() - new Date(state.startedAt).getTime();
		const accumulated = state.accumulatedMs + segmentMs;

		this.cachedStartMs = null;

		await this.setState({
			...state,
			isPaused: true,
			startedAt: null,
			accumulatedMs: accumulated,
		});

		this.stopUIUpdates();
		if (this.onUpdateCallback) this.onUpdateCallback();
	}

	/** Resume a paused timer */
	async resume(): Promise<void> {
		const state = this.getState();
		if (!state.isRunning || !state.isPaused) return;

		const now = new Date();
		this.cachedStartMs = now.getTime();

		await this.setState({
			...state,
			isPaused: false,
			startedAt: now.toISOString(),
		});

		this.startUIUpdates();
	}

	/** Stop the timer and return the completed time entry/entries (split if crossing midnight) */
	async stop(): Promise<TimeEntry[] | null> {
		const state = this.getState();
		if (!state.isRunning) return null;

		const totalMs = this.getElapsedMs();

		// Use "now" as end time, and compute effective start from total elapsed
		const endDate = new Date();
		const startDate = new Date(endDate.getTime() - totalMs);

		this.cachedStartMs = null;

		await this.setState({
			isRunning: false,
			isPaused: false,
			startedAt: null,
			accumulatedMs: 0,
			currentDescription: '',
			currentCategory: null,
		});

		this.stopUIUpdates();

		// Check if the entry crosses midnight
		if (this.isSameDay(startDate, endDate)) {
			return [this.buildEntry(startDate, endDate, state.currentDescription, state.currentCategory)];
		}

		// Split at midnight: entry 1 ends at 23:59, entry 2 starts at 00:00
		const midnight = new Date(endDate);
		midnight.setHours(0, 0, 0, 0);

		const endOfDay = new Date(midnight.getTime() - 60000); // 23:59 of start day

		const entry1 = this.buildEntry(startDate, endOfDay, state.currentDescription, state.currentCategory);
		const entry2 = this.buildEntry(midnight, endDate, state.currentDescription, state.currentCategory);

		return [entry1, entry2];
	}

	/** Get elapsed milliseconds since timer started (including accumulated from pauses) */
	getElapsedMs(): number {
		const state = this.getState();
		if (!state.isRunning) return 0;

		const accumulated = state.accumulatedMs || 0;

		if (state.isPaused) {
			return accumulated;
		}

		// Use cached value to avoid Date parse on every tick
		if (this.cachedStartMs === null && state.startedAt) {
			this.cachedStartMs = new Date(state.startedAt).getTime();
		}
		const currentSegment = this.cachedStartMs ? Date.now() - this.cachedStartMs : 0;
		return accumulated + currentSegment;
	}

	/** Get formatted elapsed time string */
	getFormattedElapsed(): string {
		const ms = this.getElapsedMs();
		const totalSeconds = Math.floor(ms / 1000);
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		const seconds = totalSeconds % 60;

		const pad = (n: number) => String(n).padStart(2, '0');

		if (this.getSettings().showSeconds) {
			return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
		}
		return `${pad(hours)}:${pad(minutes)}`;
	}

	/** Register a callback for UI updates (called every tick) */
	onUpdate(callback: () => void): void {
		this.onUpdateCallback = callback;
	}

	/** Start the UI update interval. Call after plugin load if timer was running. */
	startUIUpdates(): void {
		this.stopUIUpdates();
		const intervalMs = this.getSettings().showSeconds ? 1000 : 60000;
		this.updateInterval = window.setInterval(() => {
			if (this.onUpdateCallback) this.onUpdateCallback();
		}, intervalMs);
	}

	/** Stop the UI update interval */
	stopUIUpdates(): void {
		if (this.updateInterval !== null) {
			window.clearInterval(this.updateInterval);
			this.updateInterval = null;
		}
	}

	/** Resume timer UI if it was running (call on plugin load) */
	resumeIfRunning(): void {
		if (this.isRunning && !this.isPaused) {
			this.cachedStartMs = null; // Will be lazily cached on first getElapsedMs
			this.startUIUpdates();
		}
		// If paused, just trigger a UI update to show paused state
		if (this.isRunning && this.isPaused) {
			if (this.onUpdateCallback) this.onUpdateCallback();
		}
	}

	private isSameDay(a: Date, b: Date): boolean {
		return a.getFullYear() === b.getFullYear()
			&& a.getMonth() === b.getMonth()
			&& a.getDate() === b.getDate();
	}

	private buildEntry(start: Date, end: Date, description: string, category: string | null): TimeEntry {
		const durationMs = end.getTime() - start.getTime();
		const durationHours = Math.round((durationMs / 3600000) * 100) / 100;

		const entryDate = formatDateISO(start);

		return {
			id: `${entryDate}:${formatTime24(start)}`,
			date: entryDate,
			startTime: formatTime24(start),
			endTime: formatTime24(end),
			durationHours,
			description,
			category,
		};
	}
}
