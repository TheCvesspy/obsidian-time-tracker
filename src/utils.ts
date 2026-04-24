/** Shared date and time utility functions used across the plugin */

import { App, Notice } from 'obsidian';
import type { Holiday, DailySummary, TimeEntry } from './types';
import { PLUGIN_ID } from './constants';

export type NoticeType = 'info' | 'success' | 'warning' | 'error';

/** Show a Notice with the plugin's visual branding. */
export function notify(message: string, type: NoticeType = 'info', duration?: number): Notice {
	const n = duration !== undefined ? new Notice(message, duration) : new Notice(message);
	n.noticeEl.classList.add('time-tracker-notice', `time-tracker-notice-${type}`);
	return n;
}

/** Format a Date to YYYY-MM-DD */
export function formatDateISO(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/** Parse a YYYY-MM-DD string into a Date (local timezone, midnight) */
export function parseDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split('-').map(Number);
	return new Date(y, m - 1, d);
}

/** Format a Date to HH:MM (24h) */
export function formatTime24(date: Date): string {
	const h = String(date.getHours()).padStart(2, '0');
	const m = String(date.getMinutes()).padStart(2, '0');
	return `${h}:${m}`;
}

/** Convert HH:MM (24h) to h:MM AM/PM (12h) */
export function formatTime12(time24: string): string {
	const [hStr, mStr] = time24.split(':');
	let h = parseInt(hStr);
	const suffix = h >= 12 ? 'PM' : 'AM';
	if (h === 0) h = 12;
	else if (h > 12) h -= 12;
	return `${h}:${mStr} ${suffix}`;
}

/** Format a display date like "Mon, Mar 16" */
export function formatDateDisplay(date: Date): string {
	const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

/** Format a display date like "Mar 16, 2026" from a YYYY-MM-DD string */
export function formatDisplayFromISO(dateStr: string): string {
	const date = parseDate(dateStr);
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Check if a Date is today */
export function isToday(date: Date): boolean {
	const now = new Date();
	return date.getFullYear() === now.getFullYear()
		&& date.getMonth() === now.getMonth()
		&& date.getDate() === now.getDate();
}

/** Escape a string for use in a RegExp */
export function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Round an end time based on the selected rounding mode ('none', '5min', '15min', '30min'). */
export function roundEndTime(
	startTime: string,
	endTime: string,
	roundingMode: string
): { endTime: string; durationHours: number } {
	const [sh, sm] = startTime.split(':').map(Number);
	const [eh, em] = endTime.split(':').map(Number);
	const startMin = sh * 60 + sm;
	let endMin = eh * 60 + em;

	if (roundingMode !== 'none') {
		const interval = roundingMode === '5min' ? 5
			: roundingMode === '15min' ? 15
			: roundingMode === '30min' ? 30
			: 0;

		if (interval > 0) {
			endMin = Math.round(endMin / interval) * interval;
			if (endMin <= startMin) {
				endMin = startMin + interval;
			}
		}
	}

	const roundedH = String(Math.floor(endMin / 60)).padStart(2, '0');
	const roundedM = String(endMin % 60).padStart(2, '0');
	const durationHours = Math.round(((endMin - startMin) / 60) * 100) / 100;

	return { endTime: `${roundedH}:${roundedM}`, durationHours };
}

/** Check if a date string (YYYY-MM-DD) falls on a weekend (Sat/Sun) or a configured holiday */
export function isNonWorkingDay(dateStr: string, holidays: Holiday[]): boolean {
	const date = parseDate(dateStr);
	const dow = date.getDay();
	if (dow === 0 || dow === 6) return true;
	return holidays.some(h => h.date === dateStr);
}

/** Get the holiday name for a date, or null if it's not a holiday */
export function getHolidayName(dateStr: string, holidays: Holiday[]): string | null {
	const h = holidays.find(h => h.date === dateStr);
	return h ? h.name : null;
}

/** Convert an HH:MM (24h) string to minutes since midnight; returns null for malformed input. */
export function timeToMinutes(hhmm: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
	if (!match) return null;
	const h = parseInt(match[1], 10);
	const m = parseInt(match[2], 10);
	if (isNaN(h) || isNaN(m)) return null;
	return h * 60 + m;
}

/** A contiguous stretch of unaccounted time between two logged entries on a single day. */
export interface TimeGap {
	/** Start of the gap in HH:MM (24h). */
	startTime: string;
	/** End of the gap in HH:MM (24h). */
	endTime: string;
	/** Duration in minutes (integer). */
	minutes: number;
}

/**
 * Compute unaccounted stretches between logged entries on a single day.
 * Entries without an endTime are treated as still-running (ignored). Gaps
 * smaller than `minMinutes` are filtered out. If `includeTail` is true and
 * a `now` time is provided (HH:MM), an additional "tail" gap from the last
 * entry's end to `now` is included when it exceeds the threshold.
 */
export function detectGaps(
	entries: TimeEntry[],
	minMinutes: number,
	options: { includeTail?: boolean; now?: string } = {}
): TimeGap[] {
	const valid = entries
		.filter(e => e.endTime)
		.map(e => ({
			start: timeToMinutes(e.startTime)!,
			end: timeToMinutes(e.endTime!)!,
		}))
		.filter(e => e.start != null && e.end != null && e.end > e.start)
		.sort((a, b) => a.start - b.start);

	const gaps: TimeGap[] = [];
	for (let i = 1; i < valid.length; i++) {
		const prevEnd = valid[i - 1].end;
		const nextStart = valid[i].start;
		const minutes = nextStart - prevEnd;
		if (minutes >= minMinutes) {
			gaps.push({
				startTime: minutesToTime(prevEnd),
				endTime: minutesToTime(nextStart),
				minutes,
			});
		}
	}

	if (options.includeTail && valid.length > 0 && options.now) {
		const nowMin = timeToMinutes(options.now);
		if (nowMin != null) {
			const lastEnd = valid[valid.length - 1].end;
			const tail = nowMin - lastEnd;
			if (tail >= minMinutes) {
				gaps.push({
					startTime: minutesToTime(lastEnd),
					endTime: options.now,
					minutes: tail,
				});
			}
		}
	}

	return gaps;
}

/** Format minutes-since-midnight as HH:MM. */
function minutesToTime(total: number): string {
	const h = String(Math.floor(total / 60)).padStart(2, '0');
	const m = String(total % 60).padStart(2, '0');
	return `${h}:${m}`;
}

/**
 * Find entries that overlap the candidate's time range. Only entries on the
 * same date are considered, and the candidate itself (matched by
 * `excludeStartTime`) is excluded from the result — pass the original start
 * time when called from an edit flow. Entries with malformed times are skipped.
 * Edge-adjacent entries (one ending exactly when the next begins) are NOT
 * considered overlapping.
 */
export function detectOverlaps(
	candidate: TimeEntry,
	existing: TimeEntry[],
	excludeStartTime?: string
): TimeEntry[] {
	if (!candidate.endTime) return [];
	const cStart = timeToMinutes(candidate.startTime);
	const cEnd = timeToMinutes(candidate.endTime);
	if (cStart == null || cEnd == null || cEnd <= cStart) return [];

	const overlaps: TimeEntry[] = [];
	for (const other of existing) {
		if (other.date !== candidate.date) continue;
		if (excludeStartTime && other.startTime === excludeStartTime) continue;
		if (!other.endTime) continue;
		const oStart = timeToMinutes(other.startTime);
		const oEnd = timeToMinutes(other.endTime);
		if (oStart == null || oEnd == null) continue;
		// Strictly overlapping: intervals share at least one minute of real time.
		if (cStart < oEnd && oStart < cEnd) {
			overlaps.push(other);
		}
	}
	return overlaps;
}

/**
 * Return a human-readable hotkey label for one of this plugin's commands
 * (e.g. "Ctrl+Shift+T"), or `null` when no binding is configured. Uses the
 * unofficial hotkey-manager surface — guarded defensively so unexpected API
 * shapes just fall back to no label.
 */
export function formatHotkeyForCommand(app: App, commandId: string): string | null {
	try {
		const fullId = commandId.includes(':') ? commandId : `${PLUGIN_ID}:${commandId}`;
		const manager = (app as unknown as {
			hotkeyManager?: {
				getHotkeys?: (id: string) => Array<{ modifiers: string[]; key: string }> | undefined;
				getDefaultHotkeys?: (id: string) => Array<{ modifiers: string[]; key: string }> | undefined;
			};
		}).hotkeyManager;
		if (!manager) return null;

		const hotkeys = manager.getHotkeys?.(fullId) ?? manager.getDefaultHotkeys?.(fullId) ?? [];
		if (!Array.isArray(hotkeys) || hotkeys.length === 0) return null;

		const first = hotkeys[0];
		if (!first) return null;
		const parts = [...(first.modifiers ?? []), first.key].filter(Boolean);
		if (parts.length === 0) return null;
		// Normalise modifier names: Obsidian uses 'Mod' for Ctrl/Cmd, 'Alt', 'Shift'.
		return parts
			.map(p => p === 'Mod' ? (navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl') : p)
			.join('+');
	} catch {
		return null;
	}
}

/**
 * Calculate current and longest work-day streaks.
 * When excludeNonWorking is true, weekends and holidays are skipped entirely
 * (they neither break nor contribute to streaks).
 */
export function calculateStreaks(
	days: DailySummary[],
	holidays: Holiday[],
	excludeNonWorking: boolean
): { currentStreak: number; longestStreak: number } {
	let longestStreak = 0;
	let currentStreak = 0;

	for (const day of days) {
		if (excludeNonWorking && isNonWorkingDay(day.date, holidays)) {
			continue; // skip non-working days entirely
		}
		if (day.totalHours > 0) {
			currentStreak++;
			longestStreak = Math.max(longestStreak, currentStreak);
		} else {
			currentStreak = 0;
		}
	}

	// Current streak: count backwards from the end (most recent day)
	let current = 0;
	for (let i = days.length - 1; i >= 0; i--) {
		const day = days[i];
		if (excludeNonWorking && isNonWorkingDay(day.date, holidays)) {
			continue;
		}
		if (day.totalHours > 0) {
			current++;
		} else {
			break;
		}
	}

	return { currentStreak: current, longestStreak };
}
