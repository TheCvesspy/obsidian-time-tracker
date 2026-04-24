import { App, TFile } from 'obsidian';
import { TimeEntry, PluginSettings, WorklogReference } from '../types';
import { DailyNoteIntegration } from './DailyNoteIntegration';
import {
	TIME_LOG_ROW_REGEX,
	TOTAL_ROW_REGEX,
	TABLE_HEADER,
	TABLE_SEPARATOR,
	TABLE_HEADER_V2,
	TABLE_SEPARATOR_V2,
	HEADER_V1_REGEX,
	HEADER_V2_REGEX,
	JIRA_KEY_REGEX,
	WIKILINK_REF_REGEX,
} from '../constants';
import { formatDateISO, parseDate, formatTime12 } from '../utils';

/** Header shape used by the Time Log table in a daily note. */
type TableVersion = 'none' | 'v1' | 'v2';

/**
 * Undo history entry — captured right before a write so `undoLastWrite()` can
 * restore the file to its prior contents. Stored in memory only (cleared on
 * reload), bounded to MAX_UNDO_DEPTH to avoid unbounded growth.
 */
export interface UndoSnapshot {
	filePath: string;
	priorContents: string;
	label: string;
	timestamp: number;
}

const MAX_UNDO_DEPTH = 5;

export class TimeEntryService {
	private undoStack: UndoSnapshot[] = [];

	/**
	 * Serialises all write operations so concurrent read-modify-write cycles
	 * can't clobber each other. A single shared promise chain is cheap — writes
	 * are user-initiated and infrequent, so the queue never backs up.
	 */
	private writeQueue: Promise<unknown> = Promise.resolve();

	constructor(
		private app: App,
		private dailyNoteIntegration: DailyNoteIntegration,
		private getSettings: () => PluginSettings
	) {}

	private enqueue<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.writeQueue.then(fn, fn);
		// Swallow errors on the stored chain so one failure doesn't break the next call.
		this.writeQueue = next.catch(() => undefined);
		return next;
	}

	/** Peek at the most recent undo entry (for disabled-state UI). */
	peekUndo(): UndoSnapshot | null {
		return this.undoStack[this.undoStack.length - 1] ?? null;
	}

	/**
	 * Restore the most recent write to its prior contents. No-op when the stack
	 * is empty. Returns a label suitable for a Notice ("Undone: stop-timer") or
	 * null when nothing was undone.
	 */
	async undoLastWrite(): Promise<string | null> {
		return this.enqueue(async () => {
			const snap = this.undoStack.pop();
			if (!snap) return null;
			const file = this.app.vault.getAbstractFileByPath(snap.filePath);
			if (!(file instanceof TFile)) {
				// File was renamed or deleted since the snapshot — best-effort, skip.
				return null;
			}
			await this.app.vault.modify(file, snap.priorContents);
			return snap.label;
		});
	}

	/** Capture a file's current contents onto the undo stack. */
	private pushUndo(file: TFile, priorContents: string, label: string): void {
		this.undoStack.push({
			filePath: file.path,
			priorContents,
			label,
			timestamp: Date.now(),
		});
		if (this.undoStack.length > MAX_UNDO_DEPTH) {
			this.undoStack.shift();
		}
	}

	/** Add a time log to the appropriate daily note */
	async addEntry(entry: TimeEntry): Promise<void> {
		return this.enqueue(() => this._addEntryInner(entry));
	}

	private async _addEntryInner(entry: TimeEntry): Promise<void> {
		const date = parseDate(entry.date);
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(date);
		const content = await this.app.vault.read(file);

		const section = this.dailyNoteIntegration.findTimeLogSection(content);
		if (!section) {
			// Should not happen since getOrCreateDailyNote ensures the section exists
			return;
		}

		// Snapshot for undo BEFORE any mutation; labelled with the affected date.
		this.pushUndo(file, content, `Added ${entry.startTime}–${entry.endTime ?? '…'} on ${entry.date}`);

		const sectionContent = content.substring(section.start, section.end);
		const version = this.detectTableVersion(sectionContent);
		// Safety net: detect whether pre-existing rows are in the section even
		// when the header didn't match. Without this, a mangled header would
		// cause the fresh-table branch to wipe every prior entry.
		const hasExistingRows = sectionContent
			.split('\n')
			.some(l => TIME_LOG_ROW_REGEX.test(l.trim()));

		// Decide which header to use going forward:
		//   - If there's no table yet, pick v2 when the new entry carries a reference, else v1.
		//   - If the existing table is v1 and the new entry carries a reference, upgrade in place.
		//   - If the existing table is already v2, keep v2.
		const newVersion: 'v1' | 'v2' =
			version === 'v2' ? 'v2'
			: entry.reference ? 'v2'
			: 'v1';

		const row = this.buildTableRow(entry, newVersion);

		let newSectionContent: string;
		if (version === 'none' && !hasExistingRows) {
			const header = newVersion === 'v2' ? TABLE_HEADER_V2 : TABLE_HEADER;
			const separator = newVersion === 'v2' ? TABLE_SEPARATOR_V2 : TABLE_SEPARATOR;
			const total = entry.durationHours ?? 0;
			newSectionContent = `\n${header}\n${separator}\n${row}\n${this.buildTotalRow(total, newVersion)}\n`;
		} else {
			let lines = sectionContent.split('\n');

			// Header mangled but rows exist — reinsert a clean header+separator
			// above the first row so the row-insertion flow below proceeds normally.
			if (version === 'none' && hasExistingRows) {
				const header = newVersion === 'v2' ? TABLE_HEADER_V2 : TABLE_HEADER;
				const separator = newVersion === 'v2' ? TABLE_SEPARATOR_V2 : TABLE_SEPARATOR;
				const firstRowIdx = lines.findIndex(l => TIME_LOG_ROW_REGEX.test(l.trim()));
				if (firstRowIdx >= 0) {
					lines.splice(firstRowIdx, 0, header, separator);
				}
			}

			// Upgrade legacy v1 table in-place when the new row needs a reference column.
			if (version === 'v1' && newVersion === 'v2') {
				lines = this.upgradeLinesToV2(lines);
			}

			const totalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l.trim()));
			if (totalIdx >= 0) {
				lines.splice(totalIdx, 0, row);
				const total = this.computeTotalFromLines(lines);
				const newTotalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l.trim()));
				if (newTotalIdx >= 0) {
					lines[newTotalIdx] = this.buildTotalRow(total, newVersion);
				}
			} else {
				let insertIdx = lines.length;
				while (insertIdx > 0 && lines[insertIdx - 1].trim() === '') {
					insertIdx--;
				}
				const total = this.computeTotalFromLines([...lines, row]);
				lines.splice(insertIdx, 0, row);
				lines.splice(insertIdx + 1, 0, this.buildTotalRow(total, newVersion));
			}
			newSectionContent = lines.join('\n');
		}

		const newContent = content.substring(0, section.start) + newSectionContent + content.substring(section.end);
		await this.app.vault.modify(file, newContent);
	}

	/** Update an existing time log in the daily note (matched by date + old start time) */
	async updateEntry(date: string, oldStartTime: string, updatedEntry: TimeEntry): Promise<void> {
		return this.enqueue(() => this._updateEntryInner(date, oldStartTime, updatedEntry));
	}

	private async _updateEntryInner(date: string, oldStartTime: string, updatedEntry: TimeEntry): Promise<void> {
		const dateObj = parseDate(date);
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(dateObj);
		const content = await this.app.vault.read(file);

		const section = this.dailyNoteIntegration.findTimeLogSection(content);
		if (!section) return;

		this.pushUndo(file, content, `Updated ${oldStartTime} on ${date}`);

		const sectionContent = content.substring(section.start, section.end);
		const version = this.detectTableVersion(sectionContent);

		// Upgrade to v2 only if the updated row needs a reference column.
		const newVersion: 'v1' | 'v2' =
			version === 'v2' ? 'v2'
			: updatedEntry.reference ? 'v2'
			: 'v1';

		let lines = sectionContent.split('\n');
		if (version === 'v1' && newVersion === 'v2') {
			lines = this.upgradeLinesToV2(lines);
		}

		let replaced = false;
		for (let i = 0; i < lines.length; i++) {
			const match = TIME_LOG_ROW_REGEX.exec(lines[i].trim());
			if (match && match[1] === oldStartTime) {
				lines[i] = this.buildTableRow(updatedEntry, newVersion);
				replaced = true;
				break;
			}
		}

		if (!replaced) return;

		const totalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l.trim()));
		if (totalIdx >= 0) {
			lines[totalIdx] = this.buildTotalRow(this.computeTotalFromLines(lines), newVersion);
		}

		const newContent = content.substring(0, section.start) + lines.join('\n') + content.substring(section.end);
		await this.app.vault.modify(file, newContent);
	}

	/** Delete a time log from the daily note (matched by date + start time) */
	async deleteEntry(date: string, startTime: string): Promise<void> {
		return this.enqueue(() => this._deleteEntryInner(date, startTime));
	}

	private async _deleteEntryInner(date: string, startTime: string): Promise<void> {
		const dateObj = parseDate(date);
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(dateObj);
		const content = await this.app.vault.read(file);

		const section = this.dailyNoteIntegration.findTimeLogSection(content);
		if (!section) return;

		this.pushUndo(file, content, `Deleted ${startTime} on ${date}`);

		const sectionContent = content.substring(section.start, section.end);
		const version = this.detectTableVersion(sectionContent);
		const lines = sectionContent.split('\n');

		const rowIdx = lines.findIndex(l => {
			const match = TIME_LOG_ROW_REGEX.exec(l.trim());
			return match && match[1] === startTime;
		});

		if (rowIdx < 0) return;
		lines.splice(rowIdx, 1);

		const totalIdx = lines.findIndex(l => TOTAL_ROW_REGEX.test(l.trim()));
		if (totalIdx >= 0) {
			lines[totalIdx] = this.buildTotalRow(
				this.computeTotalFromLines(lines),
				version === 'v2' ? 'v2' : 'v1'
			);
		}

		const newContent = content.substring(0, section.start) + lines.join('\n') + content.substring(section.end);
		await this.app.vault.modify(file, newContent);
	}

	/** Parse time logs from a daily note for a given date */
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
			const referenceCell = match[5];

			const durationHours = parseFloat(durationStr.replace('h', ''));
			const { category, desc } = this.parseDescription(description);
			const reference = this.parseReferenceCell(referenceCell);

			entries.push({
				id: `${dateStr}:${startTime}`,
				date: dateStr,
				startTime,
				endTime,
				durationHours,
				description: desc,
				category,
				...(reference ? { reference } : {}),
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

	/** Build a table row from a time log. Version controls whether the Reference column is emitted. */
	buildTableRow(entry: TimeEntry, version: 'v1' | 'v2' = 'v1'): string {
		const duration = entry.durationHours != null ? `${entry.durationHours}h` : '...';
		const desc = entry.category
			? `${entry.category} - ${entry.description}`
			: entry.description;

		const use12h = this.getSettings().timeFormat === '12h';
		const start = use12h ? formatTime12(entry.startTime) : entry.startTime;
		const end = entry.endTime
			? (use12h ? formatTime12(entry.endTime) : entry.endTime)
			: '...';

		if (version === 'v2') {
			const ref = serializeReference(entry.reference);
			return `| ${start} | ${end} | ${duration} | ${desc} | ${ref} |`;
		}
		return `| ${start} | ${end} | ${duration} | ${desc} |`;
	}

	/** Detect whether the Time Log section currently has no table, a v1 header, or a v2 header. */
	detectTableVersion(sectionContent: string): TableVersion {
		if (HEADER_V2_REGEX.test(sectionContent)) return 'v2';
		if (HEADER_V1_REGEX.test(sectionContent)) return 'v1';
		return 'none';
	}

	/**
	 * Rewrite v1 section lines into v2: swap header + separator, append an empty
	 * Reference cell to data rows and to the Total row. Non-table lines are untouched.
	 */
	private upgradeLinesToV2(lines: string[]): string[] {
		return lines.map(line => {
			const trimmed = line.trim();
			if (trimmed === TABLE_HEADER) return TABLE_HEADER_V2;
			if (trimmed === TABLE_SEPARATOR) return TABLE_SEPARATOR_V2;

			// Data row: append ` |` before the final `|`. Regex match confirms shape.
			const rowMatch = TIME_LOG_ROW_REGEX.exec(trimmed);
			if (rowMatch && rowMatch[5] === undefined) {
				return trimmed.replace(/\|\s*$/, '| |');
			}

			// Total row: append an empty trailing cell when not already present.
			if (TOTAL_ROW_REGEX.test(trimmed) && !/\|\s*\|\s*$/.test(trimmed)) {
				return trimmed.replace(/\|\s*$/, '| |');
			}

			return line;
		});
	}

	private buildTotalRow(totalHours: number, version: 'v1' | 'v2' = 'v1'): string {
		const rounded = Math.round(totalHours * 100) / 100;
		if (version === 'v2') {
			return `| | | **${rounded}h** | **Total** | |`;
		}
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

	/** Parse the Reference cell into a structured WorklogReference (or null if empty/unrecognised). */
	private parseReferenceCell(cell: string | undefined): WorklogReference | null {
		if (cell == null) return null;
		const trimmed = cell.trim();
		if (!trimmed) return null;

		const wikilink = WIKILINK_REF_REGEX.exec(trimmed);
		if (wikilink) {
			// Restore any escaped pipe characters used to protect the markdown table.
			const value = wikilink[1].replace(/\\\|/g, '|').trim();
			if (value) return { kind: 'topic', value };
		}

		const upper = trimmed.toUpperCase();
		if (JIRA_KEY_REGEX.test(upper)) {
			return { kind: 'jira', value: upper };
		}

		// Unrecognised content: leave markdown alone, drop from the parsed entry.
		return null;
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

/**
 * Serialise a WorklogReference into the string that goes into the Reference cell.
 * Topic titles are pipe-escaped so they don't break the markdown table.
 */
export function serializeReference(ref: WorklogReference | undefined): string {
	if (!ref) return '';
	if (ref.kind === 'topic') {
		return `[[${ref.value.replace(/\|/g, '\\|')}]]`;
	}
	return ref.value.toUpperCase();
}
