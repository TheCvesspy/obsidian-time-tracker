import { Modal, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { DailySummary } from '../types';
import { formatDateISO, parseDate, isToday, formatDateDisplay } from '../utils';

export class DailySummaryModal extends Modal {
	private currentDate: Date;
	private summary: DailySummary | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.currentDate = new Date();
		this.currentDate.setHours(0, 0, 0, 0);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-daily-modal');
		await this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		// Navigation header
		const nav = contentEl.createDiv({ cls: 'time-tracker-week-nav' });

		const prevBtn = nav.createEl('button', {
			cls: 'time-tracker-nav-btn',
			text: '\u2190',
		});
		prevBtn.addEventListener('click', () => this.navigateDay(-1));

		const titleEl = nav.createEl('span', { cls: 'time-tracker-week-title' });

		const nextBtn = nav.createEl('button', {
			cls: 'time-tracker-nav-btn',
			text: '\u2192',
		});
		nextBtn.addEventListener('click', () => this.navigateDay(1));

		titleEl.textContent = 'Loading...';

		const container = contentEl.createDiv({ cls: 'time-tracker-weekly-content' });

		// Fetch data
		const dateStr = formatDateISO(this.currentDate);
		this.summary = await this.plugin.reportService.getDailySummary(dateStr);

		const dayLabel = formatDateDisplay(this.currentDate);
		const year = this.currentDate.getFullYear();
		const todayLabel = isToday(this.currentDate) ? ' (Today)' : '';
		titleEl.textContent = `${dayLabel}, ${year}${todayLabel}`;

		this.renderContent(container);
	}

	private renderContent(container: HTMLElement): void {
		if (!this.summary) return;

		// Summary cards
		const cards = container.createDiv({ cls: 'time-tracker-summary-cards' });
		this.renderCard(cards, `${this.summary.totalHours}h`, 'Total Hours');
		this.renderCard(cards, `${this.summary.entries.length}`, 'Entries');

		// Entry list
		if (this.summary.entries.length > 0) {
			const entrySection = container.createDiv({ cls: 'time-tracker-daily-breakdown' });
			entrySection.createEl('h4', { text: 'Entries' });

			for (const entry of this.summary.entries) {
				const row = entrySection.createDiv({ cls: 'time-tracker-bar-row' });
				row.createSpan({
					cls: 'time-tracker-bar-label',
					text: `${entry.startTime} - ${entry.endTime}`,
				});

				const desc = entry.category
					? `${entry.category} - ${entry.description}`
					: entry.description;

				const barWrap = row.createDiv({ cls: 'time-tracker-bar-container' });
				barWrap.createSpan({
					cls: 'time-tracker-entry-desc',
					text: desc,
				});

				row.createSpan({
					cls: 'time-tracker-bar-value',
					text: `${entry.durationHours}h`,
				});
			}
		}

		// Category breakdown
		if (Object.keys(this.summary.byCategory).length > 0) {
			const catSection = container.createDiv({ cls: 'time-tracker-category-breakdown' });
			catSection.createEl('h4', { text: 'By Category' });

			const sorted = Object.entries(this.summary.byCategory)
				.sort(([, a], [, b]) => b - a);

			const maxCatHours = Math.max(...sorted.map(([, h]) => h), 1);

			for (const [cat, hours] of sorted) {
				const row = catSection.createDiv({ cls: 'time-tracker-bar-row' });
				row.createSpan({ cls: 'time-tracker-bar-label', text: cat });

				const barWrap = row.createDiv({ cls: 'time-tracker-bar-container' });
				const bar = barWrap.createDiv({ cls: 'time-tracker-bar time-tracker-bar-accent' });
				bar.style.width = `${(hours / maxCatHours) * 100}%`;

				const pct = this.summary.totalHours > 0
					? Math.round((hours / this.summary.totalHours) * 100)
					: 0;
				row.createSpan({
					cls: 'time-tracker-bar-value',
					text: `${Math.round(hours * 100) / 100}h (${pct}%)`,
				});
			}
		}

		// Empty state
		if (this.summary.entries.length === 0) {
			container.createEl('p', { text: 'No time entries for this day.' });
		}
	}

	private renderCard(container: HTMLElement, value: string, label: string): void {
		const card = container.createDiv({ cls: 'time-tracker-summary-card' });
		card.createDiv({ cls: 'time-tracker-card-value', text: value });
		card.createDiv({ cls: 'time-tracker-card-label', text: label });
	}

	private async navigateDay(offset: number): Promise<void> {
		this.currentDate.setDate(this.currentDate.getDate() + offset);
		await this.render();
	}
}
