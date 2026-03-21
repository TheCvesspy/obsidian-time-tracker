import { App, TFile } from 'obsidian';
import { TimeEntry, PluginSettings } from '../types';
import { DailyNoteIntegration } from './DailyNoteIntegration';
import { TIME_LOG_ROW_REGEX, TOTAL_ROW_REGEX, TABLE_HEADER, TABLE_SEPARATOR } from '../constants';
import { formatDateISO, parseDate, formatTime12 } from '../utils';

export class TimeEntryService {
	constructor(
		private app: App,
		private dailyNoteIntegration: DailyNoteIntegration,
		private getSettings: () => PluginSettings
	) {}

	/** Add a time entry to the appropriate daily note */
	async addEntry(entry: TimeEntry): Promise<void> {
		const date = parseDate(entry.date);
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(date);
		const content = await this.app.vault.read(file);

		const section = this.dailyNoteIntegration.findTimeLogSection(content);
		if (!section) {
			// Should not happen since getOrCreateDailyNote ensures the section exists
			return;
		}

		const sectionContent = content.substring(section.start, section.end);
		const row = this.buildTableRow(entry);

		// Check if table already exists
		const hasTable = sectionContent.includes(TABLE_HEADER);

		let newSectionContent: string;
		if (!hasTable) {
			// Create table with header + row + total
			const total = entry.durationHours ?? 0;
			newSectionContent = `\n${TABLE_HEADER}\n${TABLE_SEPARATOR}\n${row}\n${this.buildTotalRow(total)}\n`;
		} else {
			// Insert row before total row (or at end of table)
			const lines = sectionContent.split('\n');
			const totalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l));

			if (totalIdx >= 0) {
				// Insert before total, then update total
				lines.splice(totalIdx, 0, row);
				// Recompute total from all data rows
				const total = this.computeTotalFromLines(lines);
				// Find and replace the total row (it shifted by 1)
				const newTotalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l));
				if (newTotalIdx >= 0) {
					lines[newTotalIdx] = this.buildTotalRow(total);
				}
			} else {
				// No total row, append row + total
				let insertIdx = lines.length;
				while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') {
					insertIdx--;
				}
				const total = this.computeTotalFromLines([...lines, row]);
				lines.splice(insertIdx, 0, row);
				lines.splice(insertIdx + 1, 0, this.buildTotalRow(total));
			}
			newSectionContent = lines.join('\n');
		}

		const newContent = content.substring(0, section.start) + newSectionContent + content.substring(section.end);
		await this.app.vault.modify(file, newContent);
	}

	/** Parse time entries from a daily note for a given date */
	async getEntriesForDate(dateStr: string): Promise<TimeEntry[]> {
		const date = parseDate(dateStr);
		const path = this.dailyNoteIntegration.getDailyNotePath(date);
		const file = this.app.vault.getAbstractFileByPath(path);

		if (!(file instanceof TFile)) return [];

		const content = await this.app.vault.read(file);
		const section = this.dailyNoteIntegration.findTimeLogSection(content);
		if (!section) return [];

		const sectionContent = content.substring(section.start, section.end);
		const entries: TimeEntry[] = [];

		for (const line of sectionContent.split('\n')) {
			const match = TIME_LOG_ROW_REGEX.exec(line.trim());
			if (!match) continue;

			const startTime = match[1];
			const endTime = match[2];
			const durationStr = match[3];
			const description = match[4].trim();

			const durationHours = parseFloat(durationStr.replace('h', ''));
			const { category, desc } = this.parseDescription(description);

			entries.push({
				id: `${dateStr}:${startTime}`,
				date: dateStr,
				startTime,
				endTime,
				durationHours,
				description: desc,
				category,
			});
		}

		return entries;
	}

	/** Get entries for a date range (inclusive) — reads files in parallel */
	async getEntriesForRange(startDate: string, endDate: string): Promise<TimeEntry[]> {
		const dates: string[] = [];
		const current = parseDate(startDate);
		const end = parseDate(endDate);

		while (current <= end) {
			dates.push(formatDateISO(current));
			current.setDate(current.getDate() + 1);
		}

		const results = await Promise.all(dates.map(d => this.getEntriesForDate(d)));
		return results.flat();
	}

	/** Build a table row from a time entry */
	buildTableRow(entry: TimeEntry): string {
		const duration = entry.durationHours != null ? `${entry.durationHours}h` : '...';
		const desc = entry.category
			? `${entry.category} - ${entry.description}`
			: entry.description;

		const use12h = this.getSettings().timeFormat === '12h';
		const start = use12h ? formatTime12(entry.startTime) : entry.startTime;
		const end = entry.endTime
			? (use12h ? formatTime12(entry.endTime) : entry.endTime)
			: '...';

		return `| ${start} | ${end} | ${duration} | ${desc} |`;
	}

	private buildTotalRow(totalHours: number): string {
		const rounded = Math.round(totalHours * 100) / 100;
		return `| | | **${rounded}h** | **Total** |`;
	}

	private computeTotalFromLines(lines: string[]): number {
		let total = 0;
		for (const line of lines) {
			const match = TIME_LOG_ROW_REGEX.exec(line.trim());
			if (match) {
				total += parseFloat(match[3].replace('h', ''));
			}
		}
		return total;
	}

	/** Parse "Category - Description" format back into parts */
	private parseDescription(desc: string): { category: string | null; desc: string } {
		const sepIndex = desc.indexOf(' - ');
		if (sepIndex < 0) {
			return { category: null, desc };
		}

		const possibleCategory = desc.substring(0, sepIndex).trim();
		const categories = this.getSettings().categories;

		// Check if the part before " - " is a known category
		if (categories.some(c => c.toLowerCase() === possibleCategory.toLowerCase())) {
			return {
				category: possibleCategory,
				desc: desc.substring(sepIndex + 3).trim(),
			};
		}

		// If free text categories are allowed, treat it as a category anyway
		if (this.getSettings().allowFreeTextCategories && possibleCategory.length > 0 && possibleCategory.length <= 30) {
			return {
				category: possibleCategory,
				desc: desc.substring(sepIndex + 3).trim(),
			};
		}

		return { category: null, desc };
	}
}
