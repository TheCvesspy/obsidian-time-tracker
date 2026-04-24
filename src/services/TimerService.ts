import { TimeEntry, TimerState, PluginSettings, WorklogReference } from '../types';
import { formatDateISO, formatTime24, roundEndTime } from '../utils';

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

	/** True when the timer has an active run and is currently paused. */
	get isPaused(): boolean {
		const s = this.getState();
		return s.isRunning && !!s.pausedAt;
	}

	get currentDescription(): string {
		return this.getState().currentDescription;
	}

	get currentCategory(): string | null {
		return this.getState().currentCategory;
	}

	/** The reference attached to the running timer, if any. */
	get currentReference(): WorklogReference | undefined {
		return this.getState().currentReference;
	}

	/** Start the timer with a description, optional category, and optional reference */
	async start(description: string, category: string | null, reference?: WorklogReference | null): Promise<void> {
		if (this.isRunning) return;

		const now = new Date();
		this.cachedStartMs = now.getTime();

		await this.setState({
			isRunning: true,
			startedAt: now.toISOString(),
			currentDescription: description,
			currentCategory: category,
			pausedAt: null,
			accumulatedPausedMs: 0,
			...(reference ? { currentReference: reference } : {}),
		});

		this.startUIUpdates();
	}

	/** Freeze the timer at the current elapsed value. No-op when not running or already paused. */
	async pause(): Promise<void> {
		const state = this.getState();
		if (!state.isRunning || state.pausedAt) return;
		await this.setState({
			...state,
			pausedAt: new Date().toISOString(),
		});
	}

	/** Resume a paused timer, folding the pause duration into `accumulatedPausedMs`. */
	async resume(): Promise<void> {
		const state = this.getState();
		if (!state.isRunning || !state.pausedAt) return;
		const pausedMs = Date.now() - new Date(state.pausedAt).getTime();
		await this.setState({
			...state,
			pausedAt: null,
			accumulatedPausedMs: (state.accumulatedPausedMs ?? 0) + Math.max(pausedMs, 0),
		});
	}

	/** Toggle pause/resume convenience. No-op when stopped. */
	async togglePause(): Promise<void> {
		if (!this.isRunning) return;
		if (this.isPaused) await this.resume();
		else await this.pause();
	}

	/** Attach or replace the reference on the running timer (no-op if stopped). */
	async setReference(reference: WorklogReference | null): Promise<void> {
		const state = this.getState();
		if (!state.isRunning) return;
		await this.setState({
			...state,
			currentReference: reference ?? undefined,
		});
	}

	/** Stop the timer and return the completed time entry */
	async stop(): Promise<TimeEntry | null> {
		const state = this.getState();
		if (!state.isRunning || !state.startedAt) return null;

		// Fold any in-flight pause into accumulatedPausedMs so buildEntry
		// sees a consistent value.
		let accumulatedPausedMs = state.accumulatedPausedMs ?? 0;
		if (state.pausedAt) {
			accumulatedPausedMs += Math.max(Date.now() - new Date(state.pausedAt).getTime(), 0);
		}

		const startDate = new Date(state.startedAt);
		const endDate = new Date();

		const entry = this.buildEntry(
			startDate,
			endDate,
			state.currentDescription,
			state.currentCategory,
			state.currentReference,
			accumulatedPausedMs,
		);

		this.cachedStartMs = null;

		await this.setState({
			isRunning: false,
			startedAt: null,
			currentDescription: '',
			currentCategory: null,
			currentReference: undefined,
			pausedAt: null,
			accumulatedPausedMs: 0,
		});

		this.stopUIUpdates();
		return entry;
	}

	/** Get elapsed milliseconds since timer started, excluding time spent paused. */
	getElapsedMs(): number {
		const state = this.getState();
		if (!state.isRunning || !state.startedAt) return 0;

		// Use cached value to avoid Date parse on every tick
		if (this.cachedStartMs === null) {
			this.cachedStartMs = new Date(state.startedAt).getTime();
		}
		let paused = state.accumulatedPausedMs ?? 0;
		if (state.pausedAt) {
			paused += Math.max(Date.now() - new Date(state.pausedAt).getTime(), 0);
		}
		return Math.max(Date.now() - this.cachedStartMs - paused, 0);
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

	private buildEntry(
		start: Date,
		end: Date,
		description: string,
		category: string | null,
		reference: WorklogReference | undefined,
		accumulatedPausedMs: number
	): TimeEntry {
		const startTime = formatTime24(start);
		const rawEndTime = formatTime24(end);

		// Apply the user's rounding mode consistently with manual Edit Entry flow.
		// Keeps the recorded end/duration on the same grid (e.g. 15-min boundaries)
		// regardless of whether the row was written via stop-timer or quick-log.
		const rounding = this.getSettings().roundingMode;
		const rounded = roundEndTime(startTime, rawEndTime, rounding);

		// Subtract paused time from the recorded duration. The endTime column
		// continues to reflect the real wall-clock stop (rounded per settings);
		// the Duration column is authoritative for reporting math.
		const pausedHours = accumulatedPausedMs / 3_600_000;
		const effectiveDuration = Math.max(
			Math.round((rounded.durationHours - pausedHours) * 100) / 100,
			0,
		);

		// Handle midnight crossing: use start date for the entry,
		// but if the timer crossed midnight, end time could be < start time
		const entryDate = formatDateISO(start);

		return {
			id: `${entryDate}:${startTime}`,
			date: entryDate,
			startTime,
			endTime: rounded.endTime,
			durationHours: effectiveDuration,
			description,
			category,
			...(reference ? { reference } : {}),
		};
	}
}
