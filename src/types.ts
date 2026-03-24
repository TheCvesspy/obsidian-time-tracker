/** A single time tracking entry */
export interface TimeEntry {
	/** Unique ID for in-memory tracking: `${date}:${startTime}` */
	id: string;
	/** ISO date string YYYY-MM-DD */
	date: string;
	/** Start time HH:MM (24h) */
	startTime: string;
	/** End time HH:MM (24h), null if timer is running */
	endTime: string | null;
	/** Duration in hours (computed), null if running */
	durationHours: number | null;
	/** Free text description */
	description: string;
	/** Category/project name (optional) */
	category: string | null;
}

/** Timer state persisted across restarts */
export interface TimerState {
	/** Whether the timer is currently running */
	isRunning: boolean;
	/** Whether the timer is paused */
	isPaused: boolean;
	/** ISO timestamp when timer was started (or resumed), null if stopped */
	startedAt: string | null;
	/** Milliseconds accumulated before the current segment (from pauses) */
	accumulatedMs: number;
	/** Description of current task */
	currentDescription: string;
	/** Category of current task */
	currentCategory: string | null;
}

export enum ReminderMode {
	Interval = 'interval',
	Schedule = 'schedule',
	Off = 'off',
}

export interface PluginSettings {
	/** Path for standalone daily notes (only used when BuJo not detected) */
	standaloneDailyNotePath: string;
	/** Whether to integrate with BuJo plugin when available */
	enableBuJoIntegration: boolean;
	/** Whether to integrate with Obsidian's core Daily Notes plugin */
	enableObsidianDailyNotesIntegration: boolean;
	/** Manual override for BuJo daily note path (empty = auto-detect from BuJo settings) */
	buJoDailyNotePathOverride: string;
	/** Section heading to use in daily notes */
	timeLogHeading: string;
	/** Configurable project/category list */
	categories: string[];
	/** Allow free-text categories beyond the configured list */
	allowFreeTextCategories: boolean;
	/** Reminder mode: interval, schedule, or off */
	reminderMode: ReminderMode;
	/** Interval in minutes (for interval mode) */
	reminderIntervalMinutes: number;
	/** Scheduled times as HH:MM strings (for schedule mode) */
	reminderScheduledTimes: string[];
	/** Reminder message template when timer IS running. {elapsed} and {task} are placeholders */
	reminderMessage: string;
	/** Enable idle nudges when no timer is running */
	enableIdleReminders: boolean;
	/** Idle nudge interval in minutes */
	idleReminderIntervalMinutes: number;
	/** Idle nudge message template */
	idleReminderMessage: string;
	/** Whether to show seconds in the status bar */
	showSeconds: boolean;
	/** Time format: '24h' or '12h' */
	timeFormat: '24h' | '12h';
	/** Week start day: 0=Sunday .. 6=Saturday */
	weekStartDay: number;
	/** Whether the status bar widget is enabled */
	showStatusBar: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	standaloneDailyNotePath: 'TimeTracking/Daily',
	enableBuJoIntegration: true,
	enableObsidianDailyNotesIntegration: true,
	buJoDailyNotePathOverride: '',
	timeLogHeading: '## Time Log',
	categories: ['Deep Work', 'Meetings', 'Admin', 'Review', 'Learning'],
	allowFreeTextCategories: true,
	reminderMode: ReminderMode.Off,
	reminderIntervalMinutes: 30,
	reminderScheduledTimes: ['09:00', '12:00', '15:00', '17:00'],
	reminderMessage: 'Time check: {elapsed} on "{task}"',
	enableIdleReminders: true,
	idleReminderIntervalMinutes: 30,
	idleReminderMessage: 'Are you tracking your time? Start a timer or log what you worked on!',
	showSeconds: false,
	timeFormat: '24h',
	weekStartDay: 1,
	showStatusBar: true,
};

export interface PluginData {
	settings: PluginSettings;
	/** Persisted timer state (survives Obsidian restart) */
	timerState: TimerState;
}

export const DEFAULT_PLUGIN_DATA: PluginData = {
	settings: { ...DEFAULT_SETTINGS },
	timerState: {
		isRunning: false,
		isPaused: false,
		startedAt: null,
		accumulatedMs: 0,
		currentDescription: '',
		currentCategory: null,
	},
};

/** Computed report data */
export interface DailySummary {
	date: string;
	entries: TimeEntry[];
	totalHours: number;
	byCategory: Record<string, number>;
}

export interface WeeklySummary {
	weekStart: string;
	weekEnd: string;
	days: DailySummary[];
	totalHours: number;
	byCategory: Record<string, number>;
}

export interface MonthlySummary {
	/** "YYYY-MM" */
	month: string;
	days: DailySummary[];
	totalHours: number;
	byCategory: Record<string, number>;
}
