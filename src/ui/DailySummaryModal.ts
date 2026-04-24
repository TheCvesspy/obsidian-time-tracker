import { Modal, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { DailySummary } from '../types';
import { formatDateISO, parseDate, isToday, formatDateDisplay, detectGaps } from '../utils';
import { renderReferencePill } from './formatReference';
import { QuickLogModal } from './QuickLogModal';

export class DailySummaryModal extends Modal {
	private currentDate: Date;
	private summary: DailySummary | null = null;
	private readyDispose: (() => void) | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.currentDate = new Date();
		this.currentDate.setHours(0, 0, 0, 0);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-daily-modal');
		// Re-render when JIRA enrichment arrives from the BuJo bridge.
		this.readyDispose = this.plugin.bujoBridge.onReady(() => {
			if (this.summary) this.render();
		});
		await this.render();
	}

	onClose(): void {
		if (this.readyDispose) { this.readyDispose(); this.readyDispose = null; }
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
		this.renderCard(cards, `${this.summary.entries.length}`, 'Logs');

		// Goal progress bar
		const settings = this.plugin.settings;
		if (settings.enableGoals && settings.dailyGoalHours > 0) {
			this.renderGoalBar(container, this.summary.totalHours, settings.dailyGoalHours, 'Daily Goal');
		}

		// Entry list
		if (this.summary.entries.length > 0) {
			const entrySection = container.createDiv({ cls: 'time-tracker-daily-breakdown' });
			entrySection.createEl('h4', { text: 'Logs' });

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

				// Reference pill — legacy rows parse as undefined and render nothing.
				if (entry.reference) {
					const refWrap = row.createSpan({ cls: 'time-tracker-ref-cell' });
					renderReferencePill(refWrap, entry.reference, this.plugin.bujoBridge, this.app);
				}

				row.createSpan({
					cls: 'time-tracker-bar-value',
					text: `${entry.durationHours}h`,
				});
			}
		}

		// Unaccounted-time gaps — only meaningful when there are at least two entries.
		this.renderGaps(container);

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
			container.createEl('p', { text: 'No time logs for this day.' });
		}
	}

	/**
	 * Render a "Unaccounted Time" section listing gaps between entries on this
	 * day. Each gap has a "Log" button that opens Quick Log pre-filled with the
	 * gap's start/end. Hidden when the gap-detection setting is off or no gaps
	 * meet the threshold.
	 */
	private renderGaps(container: HTMLElement): void {
		if (!this.summary) return;
		const settings = this.plugin.settings;
		if (!settings.enableGapDetection) return;

		const threshold = Math.max(1, settings.gapDetectionMinutes);
		const gaps = detectGaps(this.summary.entries, threshold);
		if (gaps.length === 0) return;

		const section = container.createDiv({ cls: 'time-tracker-gaps-section' });
		section.createEl('h4', { text: 'Unaccounted Time' });

		for (const gap of gaps) {
			const row = section.createDiv({ cls: 'time-tracker-gap-row' });
			row.createSpan({
				cls: 'time-tracker-gap-range',
				text: `${gap.startTime} \u2013 ${gap.endTime}`,
			});
			row.createSpan({
				cls: 'time-tracker-gap-duration',
				text: `${gap.minutes} min`,
			});
			const logBtn = row.createEl('button', {
				cls: 'time-tracker-gap-log-btn',
				text: 'Log',
			});
			logBtn.addEventListener('click', () => {
				new QuickLogModal(this.plugin, {
					date: this.summary!.date,
					startTime: gap.startTime,
					endTime: gap.endTime,
				}).open();
			});
		}
	}

	private renderCard(container: HTMLElement, value: string, label: string): void {
		const card = container.createDiv({ cls: 'time-tracker-summary-card' });
		card.createDiv({ cls: 'time-tracker-card-value', text: value });
		card.createDiv({ cls: 'time-tracker-card-label', text: label });
	}

	private renderGoalBar(container: HTMLElement, current: number, goal: number, label: string): void {
		const pct = Math.min(Math.round((current / goal) * 100), 100);
		const overGoal = current >= goal;

		const goalContainer = container.createDiv({ cls: 'time-tracker-goal-container' });
		const barOuter = goalContainer.createDiv({ cls: 'time-tracker-goal-bar' });
		const fill = barOuter.createDiv({
			cls: `time-tracker-goal-fill ${overGoal ? 'time-tracker-goal-complete' : ''}`,
		});
		fill.style.width = `${pct}%`;

		const labelEl = goalContainer.createDiv({ cls: 'time-tracker-goal-label' });
		labelEl.textContent = `${label}: ${current}h / ${goal}h (${Math.round((current / goal) * 100)}%)`;
	}

	private async navigateDay(offset: number): Promise<void> {
		this.currentDate.setDate(this.currentDate.getDate() + offset);
		await this.render();
	}
}
