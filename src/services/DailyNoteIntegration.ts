import { App, TFile, TFolder } from 'obsidian';
import { PluginSettings } from '../types';
import { BUJO_PLUGIN_ID } from '../constants';
import { formatDateISO, formatDateDisplay, escapeRegex } from '../utils';

export class DailyNoteIntegration {
	constructor(
		private app: App,
		private getSettings: () => PluginSettings
	) {}

	/** Check if BuJo plugin is available and integration is enabled */
	isBuJoAvailable(): boolean {
		if (!this.getSettings().enableBuJoIntegration) return false;
		const bujo = (this.app as any).plugins?.getPlugin(BUJO_PLUGIN_ID);
		return bujo != null;
	}

	/** Check if Obsidian's core Daily Notes plugin is enabled */
	isObsidianDailyNotesAvailable(): boolean {
		if (!this.getSettings().enableObsidianDailyNotesIntegration) return false;
		const dailyNotes = (this.app as any).internalPlugins?.getPluginById?.('daily-notes');
		return dailyNotes?.enabled === true;
	}

	/** Get BuJo's configured daily note path */
	getBuJoDailyNotePath(): string {
		const override = this.getSettings().buJoDailyNotePathOverride;
		if (override && override.trim().length > 0) {
			return override.trim();
		}
		const bujo = (this.app as any).plugins?.getPlugin(BUJO_PLUGIN_ID);
		return bujo?.settings?.dailyNotePath ?? 'BuJo/Daily';
	}

	/** Get Obsidian Daily Notes folder path */
	private getObsidianDailyNotesFolder(): string {
		const dailyNotes = (this.app as any).internalPlugins?.getPluginById?.('daily-notes');
		return dailyNotes?.instance?.options?.folder || '';
	}

	/** Get Obsidian Daily Notes date format (moment.js format string) */
	private getObsidianDailyNotesFormat(): string {
		const dailyNotes = (this.app as any).internalPlugins?.getPluginById?.('daily-notes');
		return dailyNotes?.instance?.options?.format || 'YYYY-MM-DD';
	}

	/** Format a date using Obsidian Daily Notes format setting */
	private formatDateForDailyNotes(date: Date): string {
		const fmt = this.getObsidianDailyNotesFormat();
		// Simple moment-like formatting for common patterns
		const y = date.getFullYear();
		const m = date.getMonth() + 1;
		const d = date.getDate();
		return fmt
			.replace('YYYY', String(y))
			.replace('YY', String(y).slice(-2))
			.replace('MM', String(m).padStart(2, '0'))
			.replace('M', String(m))
			.replace('DD', String(d).padStart(2, '0'))
			.replace('D', String(d));
	}

	/** Get the daily note file path for a given date */
	getDailyNotePath(date: Date): string {
		// Priority: BuJo > Obsidian Daily Notes > Standalone
		if (this.isBuJoAvailable()) {
			const dateStr = formatDateISO(date);
			return `${this.getBuJoDailyNotePath()}/${dateStr}.md`;
		}
		if (this.isObsidianDailyNotesAvailable()) {
			const folder = this.getObsidianDailyNotesFolder();
			const filename = this.formatDateForDailyNotes(date);
			return folder ? `${folder}/${filename}.md` : `${filename}.md`;
		}
		const dateStr = formatDateISO(date);
		return `${this.getSettings().standaloneDailyNotePath}/${dateStr}.md`;
	}

	/** Get or create the daily note for a given date */
	async getOrCreateDailyNote(date: Date): Promise<TFile> {
		const path = this.getDailyNotePath(date);
		const file = this.app.vault.getAbstractFileByPath(path);

		if (file instanceof TFile) {
			await this.ensureTimeLogSection(file);
			return file;
		}

		// Create parent folders if needed
		const folderPath = path.substring(0, path.lastIndexOf('/'));
		if (folderPath) {
			await this.ensureFolderExists(folderPath);
		}

		// Create the file with appropriate template
		let content: string;
		if (this.isBuJoAvailable()) {
			content = this.buildBuJoTemplate(date);
		} else if (this.isObsidianDailyNotesAvailable()) {
			// Minimal template — Obsidian Daily Notes may have its own template
			content = this.buildDailyNotesTemplate(date);
		} else {
			content = this.buildStandaloneTemplate(date);
		}

		const newFile = await this.app.vault.create(path, content);
		return newFile;
	}

	/** Ensure the ## Time Log section exists in the file */
	async ensureTimeLogSection(file: TFile): Promise<void> {
		const content = await this.app.vault.read(file);
		const heading = this.getSettings().timeLogHeading;

		// Check if heading already exists (match the heading level and text)
		const headingText = heading.replace(/^#+\s*/, '');
		const headingRegex = new RegExp(`^#{1,6}\\s+${escapeRegex(headingText)}\\s*$`, 'm');

		if (headingRegex.test(content)) {
			return; // Section already exists
		}

		// Append the section at the end
		const newContent = content.trimEnd() + '\n\n' + heading + '\n';
		await this.app.vault.modify(file, newContent);
	}

	/** Find the Time Log section boundaries in file content */
	findTimeLogSection(content: string): { start: number; end: number } | null {
		const heading = this.getSettings().timeLogHeading;
		const headingText = heading.replace(/^#+\s*/, '');
		const headingLevel = (heading.match(/^(#+)/) || ['', '##'])[1].length;
		const headingRegex = new RegExp(`^#{${headingLevel}}\\s+${escapeRegex(headingText)}\\s*$`, 'm');

		const match = headingRegex.exec(content);
		if (!match) return null;

		const start = match.index + match[0].length;

		// Find the next heading of same or higher level
		const nextHeadingRegex = new RegExp(`^#{1,${headingLevel}}\\s+`, 'm');
		const remaining = content.substring(start);
		const nextMatch = nextHeadingRegex.exec(remaining);

		const end = nextMatch ? start + nextMatch.index : content.length;
		return { start, end };
	}

	private buildBuJoTemplate(date: Date): string {
		const display = formatDateDisplay(date);
		const year = date.getFullYear();
		const heading = this.getSettings().timeLogHeading;
		return `# Daily Log \u2014 ${display}, ${year}\n\n## Tasks\n\n## Migrated Tasks\n\n${heading}\n`;
	}

	private buildDailyNotesTemplate(date: Date): string {
		const dateStr = formatDateISO(date);
		const heading = this.getSettings().timeLogHeading;
		return `# ${dateStr}\n\n${heading}\n`;
	}

	private buildStandaloneTemplate(date: Date): string {
		const dateStr = formatDateISO(date);
		const heading = this.getSettings().timeLogHeading;
		return `# Time Log \u2014 ${dateStr}\n\n${heading}\n`;
	}

	private async ensureFolderExists(folderPath: string): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(folderPath);
		if (existing instanceof TFolder) return;

		// Create folders recursively
		const parts = folderPath.split('/');
		let current = '';
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			const folder = this.app.vault.getAbstractFileByPath(current);
			if (!folder) {
				try {
					await this.app.vault.createFolder(current);
				} catch {
					// Folder may have been created by another process
				}
			}
		}
	}
}
