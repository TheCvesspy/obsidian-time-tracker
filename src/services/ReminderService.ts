import { Notice } from 'obsidian';
import { PluginSettings, ReminderMode } from '../types';
import { TimerService } from './TimerService';

/**
 * Manages two types of reminders:
 * 1. **Idle nudges** — fire when NO timer is running, to remind the user to track time
 * 2. **Active reminders** — fire when timer IS running (interval or schedule based)
 *
 * Idle nudges run continuously from plugin load. Active reminders start/stop with the timer.
 */
export class ReminderService {
	// Active reminder state
	private activeIntervalId: number | null = null;
	private activeScheduleTimeoutId: number | null = null;

	// Idle nudge state
	private idleIntervalId: number | null = null;

	constructor(
		private timerService: TimerService,
		private getSettings: () => PluginSettings
	) {}

	// ── Idle Nudges (always-on) ──

	/** Start idle nudge reminders. Called on plugin load. */
	startIdleNudges(): void {
		this.stopIdleNudges();

		if (!this.getSettings().enableIdleReminders) return;

		const ms = this.getSettings().idleReminderIntervalMinutes * 60_000;
		if (ms <= 0) return;

		this.idleIntervalId = window.setInterval(() => {
			// Only nudge when the timer is NOT running
			if (!this.timerService.isRunning) {
				const msg = this.getSettings().idleReminderMessage;
				new Notice(msg, 10_000);
			}
		}, ms);
	}

	/** Stop idle nudge reminders */
	stopIdleNudges(): void {
		if (this.idleIntervalId !== null) {
			window.clearInterval(this.idleIntervalId);
			this.idleIntervalId = null;
		}
	}

	/** Restart idle nudges (call after settings change) */
	restartIdleNudges(): void {
		this.startIdleNudges();
	}

	// ── Active Reminders (while timer running) ──

	/** Start active reminders. Called when timer starts. */
	startActiveReminders(): void {
		this.stopActiveReminders();
		const mode = this.getSettings().reminderMode;

		if (mode === ReminderMode.Interval) {
			this.startActiveInterval();
		} else if (mode === ReminderMode.Schedule) {
			this.startActiveSchedule();
		}
	}

	/** Stop active reminders. Called when timer stops. */
	stopActiveReminders(): void {
		if (this.activeIntervalId !== null) {
			window.clearInterval(this.activeIntervalId);
			this.activeIntervalId = null;
		}
		if (this.activeScheduleTimeoutId !== null) {
			window.clearTimeout(this.activeScheduleTimeoutId);
			this.activeScheduleTimeoutId = null;
		}
	}

	/** Stop everything (plugin unload) */
	stop(): void {
		this.stopIdleNudges();
		this.stopActiveReminders();
	}

	// ── Active reminder internals ──

	private startActiveInterval(): void {
		const ms = this.getSettings().reminderIntervalMinutes * 60_000;
		if (ms <= 0) return;
		this.activeIntervalId = window.setInterval(() => this.notifyActive(), ms);
	}

	private startActiveSchedule(): void {
		const now = new Date();
		const times = this.getSettings().reminderScheduledTimes
			.map(t => this.parseTimeToday(t))
			.filter((t): t is Date => t !== null && t > now)
			.sort((a, b) => a.getTime() - b.getTime());

		this.scheduleNext(times, 0);
	}

	private scheduleNext(times: Date[], index: number): void {
		if (index >= times.length) return;

		const delay = times[index].getTime() - Date.now();
		if (delay <= 0) {
			this.scheduleNext(times, index + 1);
			return;
		}

		this.activeScheduleTimeoutId = window.setTimeout(() => {
			this.notifyActive();
			this.scheduleNext(times, index + 1);
		}, delay);
	}

	private notifyActive(): void {
		if (!this.timerService.isRunning) return;

		const elapsed = this.timerService.getFormattedElapsed();
		const task = this.timerService.currentDescription || 'unnamed task';
		const msg = this.getSettings().reminderMessage
			.replace('{elapsed}', elapsed)
			.replace('{task}', task);
		new Notice(msg, 10_000);
	}

	private parseTimeToday(timeStr: string): Date | null {
		const match = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
		if (!match) return null;

		const now = new Date();
		const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
			parseInt(match[1]), parseInt(match[2]), 0, 0);
		return date;
	}
}
