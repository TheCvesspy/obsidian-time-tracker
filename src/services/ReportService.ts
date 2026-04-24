import { DailySummary, WeeklySummary, DateRangeSummary, PluginSettings } from '../types';
import { TimeEntryService } from './TimeEntryService';
import { formatDateISO, parseDate, formatDisplayFromISO } from '../utils';

/** Quote a CSV field only when it contains a separator, quote, or newline. */
function csvEscape(value: string): string {
	if (/[",\n\r]/.test(value)) {
		return `"${value.replace(/"/g, '""')}"`;
	}
	return value;
}

export class ReportService {
	constructor(
		private timeEntryService: TimeEntryService,
		private getSettings: () => PluginSettings
	) {}

	/** Get a summary for a single day */
	async getDailySummary(dateStr: string): Promise<DailySummary> {
		const entries = await this.timeEntryService.getEntriesForDate(dateStr);
		let totalHours = 0;
		const byCategory: Record<string, number> = {};

		for (const entry of entries) {
			const hours = entry.durationHours ?? 0;
			totalHours += hours;
			const cat = entry.category || 'Uncategorized';
			byCategory[cat] = (byCategory[cat] || 0) + hours;
		}

		return {
			date: dateStr,
			entries,
			totalHours: Math.round(totalHours * 100) / 100,
			byCategory,
		};
	}

	/** Get a weekly summary starting from a given date — reads all 7 days in parallel */
	async getWeeklySummary(weekStartDate: Date): Promise<WeeklySummary> {
		const dates: string[] = [];
		const current = new Date(weekStartDate);
		for (let i = 0; i < 7; i++) {
			dates.push(formatDateISO(current));
			current.setDate(current.getDate() + 1);
		}

		// Parallel fetch of all 7 days
		const days = await Promise.all(dates.map(d => this.getDailySummary(d)));

		const byCategory: Record<string, number> = {};
		let totalHours = 0;

		for (const day of days) {
			totalHours += day.totalHours;
			for (const [cat, hours] of Object.entries(day.byCategory)) {
				byCategory[cat] = (byCategory[cat] || 0) + hours;
			}
		}

		const weekEnd = new Date(weekStartDate);
		weekEnd.setDate(weekEnd.getDate() + 6);

		return {
			weekStart: formatDateISO(weekStartDate),
			weekEnd: formatDateISO(weekEnd),
			days,
			totalHours: Math.round(totalHours * 100) / 100,
			byCategory,
		};
	}

	/** Format a weekly summary as markdown */
	formatWeeklySummaryMarkdown(summary: WeeklySummary): string {
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const lines: string[] = [];

		lines.push(`# Weekly Summary: ${formatDisplayFromISO(summary.weekStart)} - ${formatDisplayFromISO(summary.weekEnd)}`);
		lines.push('');
		lines.push('| Day | Hours | Top Category |');
		lines.push('|-----|-------|-------------|');

		for (const day of summary.days) {
			const date = parseDate(day.date);
			const dayName = dayNames[date.getDay()];
			const topCat = this.getTopCategory(day.byCategory);
			const hours = day.totalHours > 0 ? `${day.totalHours}h` : '-';
			lines.push(`| ${dayName} | ${hours} | ${topCat} |`);
		}

		lines.push(`| **Total** | **${summary.totalHours}h** | |`);
		lines.push('');

		if (Object.keys(summary.byCategory).length > 0) {
			lines.push('## By Category');
			lines.push('');
			lines.push('| Category | Hours | % |');
			lines.push('|----------|-------|---|');

			const sorted = Object.entries(summary.byCategory)
				.sort(([, a], [, b]) => b - a);

			for (const [cat, hours] of sorted) {
				const pct = summary.totalHours > 0
					? Math.round((hours / summary.totalHours) * 100)
					: 0;
				lines.push(`| ${cat} | ${Math.round(hours * 100) / 100}h | ${pct}% |`);
			}
		}

		return lines.join('\n');
	}

	/** Get the start of the week containing the given date */
	getWeekStart(date: Date): Date {
		const weekStartDay = this.getSettings().weekStartDay;
		const d = new Date(date);
		d.setHours(0, 0, 0, 0);
		const currentDay = d.getDay();
		const diff = (currentDay - weekStartDay + 7) % 7;
		d.setDate(d.getDate() - diff);
		return d;
	}

	/** Get a summary for an arbitrary date range */
	async getDateRangeSummary(startISO: string, endISO: string): Promise<DateRangeSummary> {
		const dates: string[] = [];
		const current = parseDate(startISO);
		const end = parseDate(endISO);
		while (current <= end) {
			dates.push(formatDateISO(current));
			current.setDate(current.getDate() + 1);
		}

		const days = await Promise.all(dates.map(d => this.getDailySummary(d)));

		const byCategory: Record<string, number> = {};
		let totalHours = 0;

		for (const day of days) {
			totalHours += day.totalHours;
			for (const [cat, hours] of Object.entries(day.byCategory)) {
				byCategory[cat] = (byCategory[cat] || 0) + hours;
			}
		}

		return {
			startDate: startISO,
			endDate: endISO,
			days,
			totalHours: Math.round(totalHours * 100) / 100,
			byCategory,
		};
	}

	/** Format a date range summary as markdown */
	formatDateRangeSummaryMarkdown(summary: DateRangeSummary): string {
		const lines: string[] = [];

		lines.push(`# Report: ${formatDisplayFromISO(summary.startDate)} - ${formatDisplayFromISO(summary.endDate)}`);
		lines.push('');

		const activeDays = summary.days.filter(d => d.totalHours > 0);
		lines.push(`**Total Hours:** ${summary.totalHours}h`);
		lines.push(`**Active Days:** ${activeDays.length}`);
		lines.push('');

		if (activeDays.length > 0) {
			lines.push('## Daily Breakdown');
			lines.push('');
			lines.push('| Date | Hours |');
			lines.push('|------|-------|');
			for (const day of activeDays) {
				lines.push(`| ${formatDisplayFromISO(day.date)} | ${day.totalHours}h |`);
			}
			lines.push('');
		}

		if (Object.keys(summary.byCategory).length > 0) {
			lines.push('## By Category');
			lines.push('');
			lines.push('| Category | Hours | % |');
			lines.push('|----------|-------|---|');
			const sorted = Object.entries(summary.byCategory).sort(([, a], [, b]) => b - a);
			for (const [cat, hours] of sorted) {
				const pct = summary.totalHours > 0
					? Math.round((hours / summary.totalHours) * 100)
					: 0;
				lines.push(`| ${cat} | ${Math.round(hours * 100) / 100}h | ${pct}% |`);
			}
		}

		return lines.join('\n');
	}

	/**
	 * Serialise a range of time entries to CSV — one row per entry, with headers.
	 * Columns: Date, Start, End, Duration (hours), Category, Description, Reference.
	 * Fields are quoted only when they contain a comma, quote, or newline.
	 */
	formatDateRangeSummaryCSV(summary: DateRangeSummary): string {
		const lines: string[] = [
			['Date', 'Start', 'End', 'Duration (h)', 'Category', 'Description', 'Reference'].join(','),
		];
		for (const day of summary.days) {
			for (const entry of day.entries) {
				const ref = !entry.reference ? ''
					: entry.reference.kind === 'topic'
						? `Topic: ${entry.reference.value}`
						: entry.reference.value;
				lines.push([
					entry.date,
					entry.startTime,
					entry.endTime ?? '',
					String(entry.durationHours ?? ''),
					entry.category ?? '',
					entry.description,
					ref,
				].map(csvEscape).join(','));
			}
		}
		return lines.join('\n');
	}

	private getTopCategory(byCategory: Record<string, number>): string {
		let top = '';
		let topHours = 0;
		for (const [cat, hours] of Object.entries(byCategory)) {
			if (hours > topHours) {
				top = cat;
				topHours = hours;
			}
		}
		return top || '-';
	}
}
