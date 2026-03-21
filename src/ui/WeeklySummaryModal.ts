import { Modal, Notice, Setting } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { WeeklySummary } from '../types';
import { parseDate, isToday, formatDisplayFromISO } from '../utils';

export class WeeklySummaryModal extends Modal {
	private currentWeekStart: Date;
	private summary: WeeklySummary | null = null;
	private contentContainer: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.currentWeekStart = this.plugin.reportService.getWeekStart(new Date());
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-weekly-modal');
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

		// Fetch data
		this.summary = await this.plugin.reportService.getWeeklySummary(this.currentWeekStart);
		titleEl.textContent = `${this.formatDisplay(this.summary.weekStart)} \u2014 ${this.formatDisplay(this.summary.weekEnd)}`;

		this.renderContent();
	}

	private renderContent(): void {
		if (!this.contentContainer || !this.summary) return;
		this.contentContainer.empty();

		// Summary cards
		const cards = this.contentContainer.createDiv({ cls: 'time-tracker-summary-cards' });

		this.renderCard(cards, `${this.summary.totalHours}h`, 'Total Hours');
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
				row.createSpan({
					cls: 'time-tracker-bar-value',
					text: `${Math.round(hours * 100) / 100}h (${pct}%)`,
				});
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
						new Notice('Weekly summary copied to clipboard');
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
							new Notice('Weekly summary inserted into active note');
							this.close();
						} else {
							new Notice('No active note to insert into');
						}
					});
			});
	}

	private renderCard(container: HTMLElement, value: string, label: string): void {
		const card = container.createDiv({ cls: 'time-tracker-summary-card' });
		card.createDiv({ cls: 'time-tracker-card-value', text: value });
		card.createDiv({ cls: 'time-tracker-card-label', text: label });
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
