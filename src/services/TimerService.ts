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
			startedAt: now.toISOString(),
			currentDescription: description,
			currentCategory: category,
		});

		this.startUIUpdates();
	}

	/** Stop the timer and return the completed time entry */
	async stop(): Promise<TimeEntry | null> {
		const state = this.getState();
		if (!state.isRunning || !state.startedAt) return null;

		const startDate = new Date(state.startedAt);
		const endDate = new Date();

		const entry = this.buildEntry(startDate, endDate, state.currentDescription, state.currentCategory);

		this.cachedStartMs = null;

		await this.setState({
			isRunning: false,
			startedAt: null,
			currentDescription: '',
			currentCategory: null,
		});

		this.stopUIUpdates();
		return entry;
	}

	/** Get elapsed milliseconds since timer started */
	getElapsedMs(): number {
		const state = this.getState();
		if (!state.isRunning || !state.startedAt) return 0;

		// Use cached value to avoid Date parse on every tick
		if (this.cachedStartMs === null) {
			this.cachedStartMs = new Date(state.startedAt).getTime();
		}
		return Date.now() - this.cachedStartMs;
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
		if (this.isRunning) {
			this.cachedStartMs = null; // Will be lazily cached on first getElapsedMs
			this.startUIUpdates();
		}
	}

	private buildEntry(start: Date, end: Date, description: string, category: string | null): TimeEntry {
		const durationMs = end.getTime() - start.getTime();
		const durationHours = Math.round((durationMs / 3600000) * 100) / 100;

		// Handle midnight crossing: use start date for the entry,
		// but if the timer crossed midnight, note end time could be < start time
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
