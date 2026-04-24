import { Modal, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { DateRangeSummary } from '../types';
import { formatDateISO, formatDisplayFromISO, parseDate, isToday, notify } from '../utils';
import { renderReferencePill, aggregateByReference } from './formatReference';

export class DateRangeReportModal extends Modal {
	private startDate: string;
	private endDate: string;
	private summary: DateRangeSummary | null = null;
	private contentContainer: HTMLElement | null = null;
	private readyDispose: (() => void) | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		// Default to last 30 days
		const end = new Date();
		const start = new Date();
		start.setDate(start.getDate() - 29);
		this.startDate = formatDateISO(start);
		this.endDate = formatDateISO(end);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-weekly-modal');
		this.readyDispose = this.plugin.bujoBridge.onReady(() => {
			if (this.summary) this.renderReport(this.summary);
		});
		this.render();
	}

	onClose(): void {
		if (this.readyDispose) { this.readyDispose(); this.readyDispose = null; }
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Custom Date Range Report' });

		// Date pickers
		new Setting(contentEl)
			.setName('Start date')
			.addText(text => {
				text.setValue(this.startDate)
					.onChange(val => { this.startDate = val; });
				text.inputEl.type = 'date';
			});

		new Setting(contentEl)
			.setName('End date')
			.addText(text => {
				text.setValue(this.endDate)
					.onChange(val => { this.endDate = val; });
				text.inputEl.type = 'date';
			});

		// Preset buttons
		const presetRow = contentEl.createDiv({ cls: 'time-tracker-template-pills' });
		const presets: [string, () => [string, string]][] = [
			['Last 7 days', () => {
				const end = new Date();
				const start = new Date();
				start.setDate(start.getDate() - 6);
				return [formatDateISO(start), formatDateISO(end)];
			}],
			['Last 30 days', () => {
				const end = new Date();
				const start = new Date();
				start.setDate(start.getDate() - 29);
				return [formatDateISO(start), formatDateISO(end)];
			}],
			['This quarter', () => {
				const now = new Date();
				const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
				return [formatDateISO(qStart), formatDateISO(now)];
			}],
			['Last quarter', () => {
				const now = new Date();
				const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
				const qEnd = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 0);
				return [formatDateISO(qStart), formatDateISO(qEnd)];
			}],
		];

		for (const [label, getRange] of presets) {
			const btn = presetRow.createEl('button', {
				cls: 'time-tracker-template-pill',
				text: label,
			});
			btn.addEventListener('click', async () => {
				const [s, e] = getRange();
				this.startDate = s;
				this.endDate = e;
				this.render();
				await this.generate();
			});
		}

		// Generate button
		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Generate Report')
					.setCta()
					.onClick(() => this.generate());
			});

		this.contentContainer = contentEl.createDiv();

		// If we already have a summary, re-render it
		if (this.summary) {
			this.renderReport(this.summary);
		}
	}

	private async generate(): Promise<void> {
		if (!this.startDate || !this.endDate || this.startDate > this.endDate) {
			notify('Invalid date range.', 'warning');
			return;
		}

		if (!this.contentContainer) return;
		this.contentContainer.empty();
		this.contentContainer.createEl('p', { text: 'Loading...', cls: 'time-tracker-loading' });

		this.summary = await this.plugin.reportService.getDateRangeSummary(this.startDate, this.endDate);
		this.contentContainer.empty();
		this.renderReport(this.summary);
	}

	private renderReport(summary: DateRangeSummary): void {
		if (!this.contentContainer) return;
		const container = this.contentContainer;

		// Summary cards
		const activeDays = summary.days.filter(d => d.totalHours > 0);
		const avgPerDay = activeDays.length > 0
			? Math.round((summary.totalHours / activeDays.length) * 10) / 10
			: 0;

		const cards = container.createDiv({ cls: 'time-tracker-summary-cards' });

		const totalCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		totalCard.createDiv({ cls: 'time-tracker-card-value', text: `${summary.totalHours}h` });
		totalCard.createDiv({ cls: 'time-tracker-card-label', text: 'Total Hours' });

		const daysCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		daysCard.createDiv({ cls: 'time-tracker-card-value', text: String(activeDays.length) });
		daysCard.createDiv({ cls: 'time-tracker-card-label', text: 'Active Days' });

		const avgCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		avgCard.createDiv({ cls: 'time-tracker-card-value', text: `${avgPerDay}h` });
		avgCard.createDiv({ cls: 'time-tracker-card-label', text: 'Avg/Day' });

		// Daily breakdown (only active days)
		if (activeDays.length > 0) {
			const section = container.createDiv({ cls: 'time-tracker-daily-breakdown' });
			section.createEl('h4', { text: 'Daily Breakdown' });

			const maxHours = Math.max(...activeDays.map(d => d.totalHours));

			for (const day of activeDays) {
				const row = section.createDiv({ cls: 'time-tracker-bar-row' });
				const date = parseDate(day.date);
				const dayLabel = formatDisplayFromISO(day.date);
				const todayMarker = isToday(date) ? ' \u2022' : '';

				const label = row.createDiv({ cls: 'time-tracker-bar-label' });
				label.textContent = dayLabel;
				if (todayMarker) {
					label.createSpan({ cls: 'time-tracker-today-dot', text: todayMarker });
				}

				const barContainer = row.createDiv({ cls: 'time-tracker-bar-container' });
				const bar = barContainer.createDiv({ cls: 'time-tracker-bar' });
				bar.style.width = `${(day.totalHours / maxHours) * 100}%`;

				row.createDiv({
					cls: 'time-tracker-bar-value',
					text: `${day.totalHours}h`,
				});
			}
		}

		// Reference breakdown — aggregates across all entries in the range.
		this.renderReferenceBreakdown(container, summary);

		// Category breakdown
		this.renderCategoryBreakdown(container, summary.byCategory, summary.totalHours);

		// Actions
		const actions = container.createDiv({ cls: 'time-tracker-weekly-actions' });

		new Setting(actions)
			.addButton(btn => {
				btn.setButtonText('Copy as Markdown')
					.onClick(async () => {
						const md = this.plugin.reportService.formatDateRangeSummaryMarkdown(summary);
						await navigator.clipboard.writeText(md);
						notify('Copied to clipboard', 'success');
					});
			})
			.addButton(btn => {
				btn.setButtonText('Copy as CSV')
					.onClick(async () => {
						const csv = this.plugin.reportService.formatDateRangeSummaryCSV(summary);
						await navigator.clipboard.writeText(csv);
						const rowCount = summary.days.reduce((n, d) => n + d.entries.length, 0);
						notify(`Copied ${rowCount} ${rowCount === 1 ? 'row' : 'rows'} as CSV`, 'success');
					});
			})
			.addButton(btn => {
				btn.setButtonText('Save CSV to Vault')
					.onClick(() => this.saveCsvToVault(summary));
			})
			.addButton(btn => {
				btn.setButtonText('Insert into Note')
					.onClick(async () => {
						const md = this.plugin.reportService.formatDateRangeSummaryMarkdown(summary);
						const file = this.app.workspace.getActiveFile();
						if (!file) {
							notify('No active note to insert into.', 'warning');
							return;
						}
						const content = await this.app.vault.read(file);
						await this.app.vault.modify(file, content + '\n\n' + md);
						notify('Inserted into note', 'success');
						this.close();
					});
			});
	}

	/** Write the CSV to a timestamped file in the vault root and open it. */
	private async saveCsvToVault(summary: DateRangeSummary): Promise<void> {
		const csv = this.plugin.reportService.formatDateRangeSummaryCSV(summary);
		const base = `time-tracker-${summary.startDate}_to_${summary.endDate}`;
		let path = `${base}.csv`;
		// De-dupe on repeat exports in the same millisecond-lap.
		let counter = 1;
		while (this.app.vault.getAbstractFileByPath(path) != null) {
			path = `${base}-${counter++}.csv`;
		}
		try {
			const file = await this.app.vault.create(path, csv);
			notify(`Saved ${path}`, 'success');
			await this.app.workspace.getLeaf(false).openFile(file);
		} catch (err) {
			console.error('Time Tracker: CSV export failed', err);
			notify('Failed to save CSV. See console for details.', 'error');
		}
	}

	/** Render a "By Reference" rollup — aggregates hours per Topic/JIRA key. */
	private renderReferenceBreakdown(container: HTMLElement, summary: DateRangeSummary): void {
		const rollup = aggregateByReference(summary.days.flatMap(d => d.entries));
		if (rollup.length === 0) return;

		const section = container.createDiv({ cls: 'time-tracker-category-breakdown' });
		section.createEl('h4', { text: 'By Reference' });

		const maxHours = Math.max(...rollup.map(r => r.hours), 1);

		for (const entry of rollup) {
			const row = section.createDiv({ cls: 'time-tracker-bar-row' });
			const labelWrap = row.createDiv({ cls: 'time-tracker-bar-label' });
			renderReferencePill(labelWrap, entry.reference, this.plugin.bujoBridge, this.app);

			const barWrap = row.createDiv({ cls: 'time-tracker-bar-container' });
			const bar = barWrap.createDiv({ cls: 'time-tracker-bar time-tracker-bar-accent' });
			bar.style.width = `${(entry.hours / maxHours) * 100}%`;

			const pct = summary.totalHours > 0 ? Math.round((entry.hours / summary.totalHours) * 100) : 0;
			row.createDiv({
				cls: 'time-tracker-bar-value',
				text: `${Math.round(entry.hours * 100) / 100}h (${pct}%)`,
			});
		}
	}

	private renderCategoryBreakdown(
		container: HTMLElement,
		byCategory: Record<string, number>,
		totalHours: number
	): void {
		const cats = Object.entries(byCategory).sort(([, a], [, b]) => b - a);
		if (cats.length === 0) return;

		const section = container.createDiv({ cls: 'time-tracker-category-breakdown' });
		section.createEl('h4', { text: 'By Category' });

		const maxCatHours = cats[0][1];

		for (const [cat, hours] of cats) {
			const row = section.createDiv({ cls: 'time-tracker-bar-row' });
			row.createDiv({ cls: 'time-tracker-bar-label', text: cat });

			const barContainer = row.createDiv({ cls: 'time-tracker-bar-container' });
			const bar = barContainer.createDiv({ cls: 'time-tracker-bar time-tracker-bar-accent' });
			bar.style.width = `${(hours / maxCatHours) * 100}%`;

			const pct = totalHours > 0 ? Math.round((hours / totalHours) * 100) : 0;
			row.createDiv({
				cls: 'time-tracker-bar-value',
				text: `${Math.round(hours * 100) / 100}h (${pct}%)`,
			});
		}
	}
}
