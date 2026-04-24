/**
 * Optional reference attached to a time log, linking it to a BuJo Topic
 * or a single JIRA issue. Only set on new entries written after the
 * BuJo integration was introduced — legacy rows parse with `reference = undefined`.
 */
export type WorklogReference =
	/** Link to a BuJo Topic. `value` is the topic title (serialised as `[[value]]`). `topicPath` is kept in memory only. */
	| { kind: 'topic'; value: string; topicPath?: string }
	/** A single JIRA issue key, e.g. `PROJ-123` (always uppercase). */
	| { kind: 'jira'; value: string };

/** A single time log */
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
	/** Optional link to a BuJo Topic or JIRA issue. Absent on legacy rows. */
	reference?: WorklogReference;
}

/** Timer state persisted across restarts */
export interface TimerState {
	/** Timer has an active run (true when running OR paused; false only when stopped). */
	isRunning: boolean;
	/** ISO timestamp when timer was started, null if stopped */
	startedAt: string | null;
	/** Description of current task */
	currentDescription: string;
	/** Category of current task */
	currentCategory: string | null;
	/** Optional reference attached to the running timer; persisted via saveData */
	currentReference?: WorklogReference;
	/** ISO timestamp when the timer was paused. Null when the timer is running or stopped. */
	pausedAt?: string | null;
	/** Cumulative milliseconds accumulated from completed pauses during this run (resets on start/stop). */
	accumulatedPausedMs?: number;
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
	/** Whether daily goal tracking is enabled */
	enableGoals: boolean;
	/** Daily goal in hours */
	dailyGoalHours: number;
	/** Color scheme for the calendar heatmap */
	heatmapColorScheme: HeatmapColorScheme;
	/** Time rounding mode: 'none', '5min', '15min', '30min' */
	roundingMode: string;
	/** Predefined template tasks for quick start */
	templateTasks: TemplateTask[];
	/** List of non-working days (holidays) */
	holidays: Holiday[];
	/** Whether to exclude weekends/holidays from streak calculations and statistics */
	excludeNonWorkingDays: boolean;
	/** Prompt for a Topic/JIRA reference when starting the timer (only when BuJo is available) */
	bujoPromptOnStart: boolean;
	/** Prompt for a Topic/JIRA reference when stopping the timer if none is attached */
	bujoPromptOnStop: boolean;
	/** Fetch JIRA title/status from BuJo and show next to keys in reports */
	enableJiraEnrichment: boolean;
	/** Pre-seed the picker with the last-used reference */
	rememberLastReference: boolean;
	/** Warn with a confirmation modal when a new/edited entry overlaps existing rows on the same date */
	warnOnOverlap: boolean;
	/** Minimum gap in minutes before the gap-detection nudge is shown */
	gapDetectionMinutes: number;
	/** Whether to show a nudge when starting a timer after a gap */
	enableGapDetection: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	standaloneDailyNotePath: 'TimeTracking/Daily',
	enableBuJoIntegration: true,
	buJoDailyNotePathOverride: '',
	timeLogHeading: '## Time Log',
	categories: ['Meetings', 'Ceremonies', 'Analysis', 'Research', 'Testing', 'Review', 'Management', 'Admin', 'Learning'],
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
	enableGoals: false,
	dailyGoalHours: 8,
	heatmapColorScheme: 'green' as HeatmapColorScheme,
	roundingMode: 'none',
	templateTasks: [],
	holidays: [],
	excludeNonWorkingDays: true,
	bujoPromptOnStart: false,
	bujoPromptOnStop: true,
	enableJiraEnrichment: true,
	rememberLastReference: true,
	warnOnOverlap: true,
	gapDetectionMinutes: 15,
	enableGapDetection: true,
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
		startedAt: null,
		currentDescription: '',
		currentCategory: null,
		pausedAt: null,
		accumulatedPausedMs: 0,
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

export interface TemplateTask {
	name: string;
	description: string;
	category: string;
}

/** A non-working day (national holiday, company day off, etc.) */
export interface Holiday {
	/** ISO date string YYYY-MM-DD */
	date: string;
	/** Display name (e.g., "Christmas Day") */
	name: string;
}

export interface DateRangeSummary {
	startDate: string;
	endDate: string;
	days: DailySummary[];
	totalHours: number;
	byCategory: Record<string, number>;
}

export type HeatmapColorScheme = 'green' | 'blue' | 'purple' | 'accent';

export const HEATMAP_COLOR_SCHEMES: Record<HeatmapColorScheme, { colors: string[]; overtime: string }> = {
	green: {
		colors: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
		overtime: '#ff6b6b',
	},
	blue: {
		colors: ['#9ecae1', '#6baed6', '#3182bd', '#08519c'],
		overtime: '#ff6b6b',
	},
	purple: {
		colors: ['#c9b1ff', '#9f7aea', '#7c3aed', '#5b21b6'],
		overtime: '#ff6b6b',
	},
	accent: {
		colors: [],
		overtime: '',
	},
};
