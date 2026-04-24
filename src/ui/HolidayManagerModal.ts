import { Modal, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import type { Holiday } from '../types';
import { formatDateISO } from '../utils';

const HOLIDAY_LINE_REGEX = /^(\d{4}-\d{2}-\d{2})\s+(.+)$/;

export class HolidayManagerModal extends Modal {
	private selectedYear: number;
	private contentContainer: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.selectedYear = new Date().getFullYear();
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-holiday-modal');
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Manage Holidays' });

		// Year selector
		const navRow = contentEl.createDiv({ cls: 'time-tracker-holiday-nav' });

		const prevBtn = navRow.createEl('button', {
			cls: 'time-tracker-nav-btn',
			text: '\u2190',
		});
		prevBtn.addEventListener('click', () => {
			this.selectedYear--;
			this.render();
		});

		navRow.createEl('span', {
			cls: 'time-tracker-holiday-year',
			text: String(this.selectedYear),
		});

		const nextBtn = navRow.createEl('button', {
			cls: 'time-tracker-nav-btn',
			text: '\u2192',
		});
		nextBtn.addEventListener('click', () => {
			this.selectedYear++;
			this.render();
		});

		// Count for this year
		const yearHolidays = this.getHolidaysForYear(this.selectedYear);
		navRow.createEl('span', {
			cls: 'time-tracker-holiday-count',
			text: `${yearHolidays.length} holiday${yearHolidays.length !== 1 ? 's' : ''}`,
		});

		this.contentContainer = contentEl.createDiv({ cls: 'time-tracker-holiday-content' });

		// Holiday list for selected year
		this.renderHolidayList(this.contentContainer, yearHolidays);

		// Add single holiday row
		this.renderAddRow(this.contentContainer);

		// Bulk import section
		this.renderImportSection(this.contentContainer);
	}

	private renderHolidayList(container: HTMLElement, holidays: Holiday[]): void {
		if (holidays.length === 0) {
			container.createEl('p', {
				text: `No holidays configured for ${this.selectedYear}.`,
				cls: 'time-tracker-holiday-empty',
			});
			return;
		}

		const list = container.createDiv({ cls: 'time-tracker-holiday-list' });
		const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

		for (const holiday of sorted) {
			const row = list.createDiv({ cls: 'time-tracker-holiday-row' });
			row.createSpan({ cls: 'time-tracker-holiday-date', text: holiday.date });
			row.createSpan({ cls: 'time-tracker-holiday-name', text: holiday.name });

			const deleteBtn = row.createEl('button', {
				cls: 'time-tracker-holiday-delete',
				text: '\u00d7',
				attr: { 'aria-label': 'Delete holiday' },
			});
			deleteBtn.addEventListener('click', async () => {
				this.plugin.settings.holidays = this.plugin.settings.holidays.filter(
					h => h.date !== holiday.date
				);
				await this.plugin.saveSettings();
				this.render();
			});
		}
	}

	private renderAddRow(container: HTMLElement): void {
		const addSection = container.createDiv({ cls: 'time-tracker-holiday-add' });
		addSection.createEl('h4', { text: 'Add Holiday' });

		const row = addSection.createDiv({ cls: 'time-tracker-holiday-add-row' });

		const dateInput = row.createEl('input', {
			type: 'date',
			cls: 'time-tracker-holiday-input',
		});
		dateInput.value = `${this.selectedYear}-01-01`;

		const nameInput = row.createEl('input', {
			type: 'text',
			cls: 'time-tracker-holiday-input',
			placeholder: 'Holiday name',
		});

		const addBtn = row.createEl('button', {
			cls: 'mod-cta',
			text: 'Add',
		});
		addBtn.addEventListener('click', async () => {
			const date = dateInput.value;
			const name = nameInput.value.trim();
			if (!date || !name) return;

			// Deduplicate: overwrite if same date exists
			this.plugin.settings.holidays = this.plugin.settings.holidays.filter(
				h => h.date !== date
			);
			this.plugin.settings.holidays.push({ date, name });
			await this.plugin.saveSettings();
			this.render();
		});
	}

	private renderImportSection(container: HTMLElement): void {
		const importSection = container.createDiv({ cls: 'time-tracker-holiday-import' });
		importSection.createEl('h4', { text: 'Bulk Import' });
		importSection.createEl('p', {
			text: 'Paste holidays, one per line: YYYY-MM-DD Holiday Name',
			cls: 'setting-item-description',
		});

		const textarea = importSection.createEl('textarea', {
			cls: 'time-tracker-holiday-textarea',
			placeholder: '2026-01-01 New Year\'s Day\n2026-12-25 Christmas Day',
		});

		const btnRow = importSection.createDiv({ cls: 'time-tracker-holiday-import-actions' });

		const importBtn = btnRow.createEl('button', {
			cls: 'mod-cta',
			text: 'Import',
		});
		importBtn.addEventListener('click', async () => {
			const text = textarea.value;
			if (!text.trim()) return;

			const lines = text.split('\n');
			let added = 0;

			// Build a map from existing holidays for deduplication
			const existingMap = new Map<string, string>();
			for (const h of this.plugin.settings.holidays) {
				existingMap.set(h.date, h.name);
			}

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;
				const match = trimmed.match(HOLIDAY_LINE_REGEX);
				if (match) {
					existingMap.set(match[1], match[2].trim());
					added++;
				}
			}

			this.plugin.settings.holidays = Array.from(existingMap.entries()).map(
				([date, name]) => ({ date, name })
			);
			await this.plugin.saveSettings();
			textarea.value = '';
			this.render();

			if (added > 0) {
				const { Notice } = await import('obsidian');
				new Notice(`Imported ${added} holiday${added !== 1 ? 's' : ''}.`);
			}
		});
	}

	private getHolidaysForYear(year: number): Holiday[] {
		const prefix = `${year}-`;
		return this.plugin.settings.holidays.filter(h => h.date.startsWith(prefix));
	}
}
