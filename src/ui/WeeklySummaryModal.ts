import { Modal, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { WeeklySummary } from '../types';
import { parseDate, isToday, formatDisplayFromISO, notify } from '../utils';
import { renderReferencePill, aggregateByReference } from './formatReference';

export class WeeklySummaryModal extends Modal {
	private currentWeekStart: Date;
	private summary: WeeklySummary | null = null;
	/** Previous week summary, used to compute week-over-week deltas. */
	private previousSummary: WeeklySummary | null = null;
	private contentContainer: HTMLElement | null = null;
	private readyDispose: (() => void) | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.currentWeekStart = this.plugin.reportService.getWeekStart(new Date());
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-weekly-modal');
		this.readyDispose = this.plugin.bujoBridge.onReady(() => {
			if (this.summary) this.renderContent();
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
		prevBtn.addEventListener('click', () => this.navigateWeek(-1));

		const titleEl = nav.createEl('span', { cls: 'time-tracker-week-title' });

		const nextBtn = nav.createEl('button', {
			cls: 'time-tracker-nav-btn',
			text: '\u2192',
		});
		nextBtn.addEventListener('click', () => this.navigateWeek(1));

		// Loading state
		titleEl.textContent = 'Loading...';
		this.contentContainer = contentEl.createDiv({ cls: 'time-tracker-weekly-content' });

		// Fetch data for the current AND previous week in parallel so we can compute WoW deltas.
		const previousWeekStart = new Date(this.currentWeekStart);
		previousWeekStart.setDate(previousWeekStart.getDate() - 7);
		const [current, previous] = await Promise.all([
			this.plugin.reportService.getWeeklySummary(this.currentWeekStart),
			this.plugin.reportService.getWeeklySummary(previousWeekStart),
		]);
		this.summary = current;
		this.previousSummary = previous;
		titleEl.textContent = `${this.formatDisplay(this.summary.weekStart)} \u2014 ${this.formatDisplay(this.summary.weekEnd)}`;

		this.renderContent();
	}

	private renderContent(): void {
		if (!this.contentContainer || !this.summary) return;
		this.contentContainer.empty();

		// Summary cards
		const cards = this.contentContainer.createDiv({ cls: 'time-tracker-summary-cards' });

		const prevTotal = this.previousSummary?.totalHours ?? 0;
		this.renderCard(
			cards,
			`${this.summary.totalHours}h`,
			'Total Hours',
			this.deltaLabel(this.summary.totalHours, prevTotal, 'h'),
		);
		this.renderCard(cards, `${this.summary.days.filter(d => d.totalHours > 0).length}`, 'Active Days');
		const avgHours = this.summary.days.filter(d => d.totalHours > 0).length > 0
			? Math.round((this.summary.totalHours / this.summary.days.filter(d => d.totalHours > 0).length) * 10) / 10
			: 0;
		this.renderCard(cards, `${avgHours}h`, 'Avg/Day');

		// Daily breakdown
		const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		const dailySection = this.contentContainer.createDiv({ cls: 'time-tracker-daily-breakdown' });
		dailySection.createEl('h4', { text: 'Daily Breakdown' });

		const maxHours = Math.max(...this.summary.days.map(d => d.totalHours), 1);

		for (const day of this.summary.days) {
			const date = parseDate(day.date);
			const dayName = dayNames[date.getDay()];
			const todayFlag = isToday(date);

			const row = dailySection.createDiv({ cls: 'time-tracker-bar-row' });
			const label = row.createSpan({ cls: 'time-tracker-bar-label' });
			label.textContent = dayName;
			if (todayFlag) {
				label.createSpan({ cls: 'time-tracker-today-dot', text: ' \u2022' });
			}

			const barWrap = row.createDiv({ cls: 'time-tracker-bar-container' });
			const bar = barWrap.createDiv({ cls: 'time-tracker-bar' });
			const pct = maxHours > 0 ? (day.totalHours / maxHours) * 100 : 0;
			bar.style.width = `${pct}%`;

			row.createSpan({
				cls: 'time-tracker-bar-value',
				text: day.totalHours > 0 ? `${day.totalHours}h` : '-',
			});
		}

		// Reference breakdown (Topic / JIRA rollup) — only when there's something to show.
		this.renderReferenceBreakdown();

		// Category breakdown
		if (Object.keys(this.summary.byCategory).length > 0) {
			const catSection = this.contentContainer.createDiv({ cls: 'time-tracker-category-breakdown' });
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

				// Week-over-week delta chip for this category (only when there's a previous-week number to compare to).
				const prevForCat = this.previousSummary?.byCategory[cat] ?? 0;
				const deltaText = this.deltaLabel(hours, prevForCat, 'h');

				const valueSpan = row.createSpan({ cls: 'time-tracker-bar-value' });
				valueSpan.setText(`${Math.round(hours * 100) / 100}h (${pct}%)`);
				if (deltaText) {
					valueSpan.createSpan({
						cls: `time-tracker-delta ${this.deltaClass(hours, prevForCat)}`,
						text: ` ${deltaText}`,
					});
				}
			}
		}

		// Actions
		const actions = this.contentContainer.createDiv({ cls: 'time-tracker-weekly-actions' });

		new Setting(actions)
			.addButton(btn => {
				btn.setButtonText('Copy as Markdown')
					.onClick(async () => {
						if (!this.summary) return;
						const md = this.plugin.reportService.formatWeeklySummaryMarkdown(this.summary);
						await navigator.clipboard.writeText(md);
						notify('Weekly summary copied to clipboard', 'success');
					});
			})
			.addButton(btn => {
				btn.setButtonText('Insert into Note')
					.onClick(async () => {
						if (!this.summary) return;
						const md = this.plugin.reportService.formatWeeklySummaryMarkdown(this.summary);
						const activeFile = this.app.workspace.getActiveFile();
						if (activeFile) {
							const content = await this.app.vault.read(activeFile);
							await this.app.vault.modify(activeFile, content + '\n\n' + md);
							notify('Weekly summary inserted into active note', 'success');
							this.close();
						} else {
							notify('No active note to insert into', 'warning');
						}
					});
			});
	}

	/** Render a "By Reference" rollup — aggregates hours per Topic/JIRA key. */
	private renderReferenceBreakdown(): void {
		if (!this.contentContainer || !this.summary) return;

		const rollup = aggregateByReference(this.summary.days.flatMap(d => d.entries));
		if (rollup.length === 0) return;

		const section = this.contentContainer.createDiv({ cls: 'time-tracker-category-breakdown' });
		section.createEl('h4', { text: 'By Reference' });

		const maxHours = Math.max(...rollup.map(r => r.hours), 1);
		const totalHours = this.summary.totalHours;

		for (const entry of rollup) {
			const row = section.createDiv({ cls: 'time-tracker-bar-row' });
			const labelWrap = row.createSpan({ cls: 'time-tracker-bar-label' });
			renderReferencePill(labelWrap, entry.reference, this.plugin.bujoBridge, this.app);

			const barWrap = row.createDiv({ cls: 'time-tracker-bar-container' });
			const bar = barWrap.createDiv({ cls: 'time-tracker-bar time-tracker-bar-accent' });
			bar.style.width = `${(entry.hours / maxHours) * 100}%`;

			const pct = totalHours > 0 ? Math.round((entry.hours / totalHours) * 100) : 0;
			row.createSpan({
				cls: 'time-tracker-bar-value',
				text: `${Math.round(entry.hours * 100) / 100}h (${pct}%)`,
			});
		}
	}

	private renderCard(container: HTMLElement, value: string, label: string, deltaText?: string | null): void {
		const card = container.createDiv({ cls: 'time-tracker-summary-card' });
		card.createDiv({ cls: 'time-tracker-card-value', text: value });
		card.createDiv({ cls: 'time-tracker-card-label', text: label });
		if (deltaText) {
			card.createDiv({
				cls: `time-tracker-card-delta ${this.deltaClassFromLabel(deltaText)}`,
				text: deltaText,
			});
		}
	}

	/**
	 * Format a week-over-week delta as a compact chip like `+1.5h vs last week`
	 * or `−0.75h vs last week`. Returns null when the delta rounds to zero AND
	 * the previous week had activity (to avoid noisy "±0h" chips).
	 */
	private deltaLabel(current: number, previous: number, unit: string): string | null {
		if (previous === 0 && current === 0) return null;
		const diff = Math.round((current - previous) * 100) / 100;
		if (diff === 0) return `±0${unit} vs last week`;
		const sign = diff > 0 ? '+' : '\u2212'; // unicode minus reads better
		return `${sign}${Math.abs(diff)}${unit} vs last week`;
	}

	private deltaClass(current: number, previous: number): string {
		const diff = current - previous;
		if (diff > 0.005) return 'time-tracker-delta-up';
		if (diff < -0.005) return 'time-tracker-delta-down';
		return 'time-tracker-delta-flat';
	}

	private deltaClassFromLabel(label: string): string {
		if (label.startsWith('+')) return 'time-tracker-delta-up';
		if (label.startsWith('\u2212')) return 'time-tracker-delta-down';
		return 'time-tracker-delta-flat';
	}

	private async navigateWeek(offset: number): Promise<void> {
		this.currentWeekStart.setDate(this.currentWeekStart.getDate() + (offset * 7));
		await this.render();
	}

	private formatDisplay(dateStr: string): string {
		const date = parseDate(dateStr);
		const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		return `${months[date.getMonth()]} ${date.getDate()}`;
	}
}
