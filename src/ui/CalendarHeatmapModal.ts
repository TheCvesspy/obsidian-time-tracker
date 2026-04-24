import { Modal } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { formatDateISO, isNonWorkingDay, calculateStreaks } from '../utils';
import { renderHeatmap, renderHeatmapLegend, renderMonthCalendar } from './charts/HeatmapRenderer';

type HeatmapPeriod = 'month' | '3m' | '6m' | '1y';

export class CalendarHeatmapModal extends Modal {
	private period: HeatmapPeriod = 'month';
	private contentContainer: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-heatmap-modal');
		await this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Calendar Heatmap' });

		// Period toggle
		const toggleRow = contentEl.createDiv({ cls: 'time-tracker-view-toggle' });
		const periods: [HeatmapPeriod, string][] = [
			['month', 'Current Month'],
			['3m', '3 Months'],
			['6m', '6 Months'],
			['1y', '1 Year'],
		];

		for (const [key, label] of periods) {
			const btn = toggleRow.createEl('button', {
				cls: `time-tracker-toggle-btn ${this.period === key ? 'time-tracker-toggle-active' : ''}`,
				text: label,
			});
			btn.addEventListener('click', async () => {
				this.period = key;
				await this.render();
			});
		}

		this.contentContainer = contentEl.createDiv({ cls: 'time-tracker-heatmap-content' });
		this.contentContainer.createEl('p', { text: 'Loading...', cls: 'time-tracker-loading' });

		await this.loadAndRender();
	}

	private async loadAndRender(): Promise<void> {
		if (!this.contentContainer) return;

		const endDate = new Date();
		const startDate = new Date();

		switch (this.period) {
			case 'month':
				startDate.setDate(1);
				break;
			case '3m':
				startDate.setMonth(startDate.getMonth() - 3);
				break;
			case '6m':
				startDate.setMonth(startDate.getMonth() - 6);
				break;
			case '1y':
				startDate.setFullYear(startDate.getFullYear() - 1);
				break;
		}

		const summary = await this.plugin.reportService.getDateRangeSummary(
			formatDateISO(startDate),
			formatDateISO(endDate)
		);

		this.contentContainer.empty();

		const settings = this.plugin.settings;
		const holidays = settings.holidays;
		const excludeNW = settings.excludeNonWorkingDays;

		// Build data map
		const dataMap = new Map<string, number>();
		for (const day of summary.days) {
			if (day.totalHours > 0) {
				dataMap.set(day.date, day.totalHours);
			}
		}

		// Render heatmap
		const heatmapContainer = this.contentContainer.createDiv({ cls: 'time-tracker-heatmap-wrapper' });
		const scaleMode = settings.enableGoals ? 'goal' as const : 'relative' as const;

		if (this.period === 'month') {
			const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
			heatmapContainer.createEl('h4', {
				text: `${monthNames[endDate.getMonth()]} ${endDate.getFullYear()}`,
				cls: 'time-tracker-month-title',
			});
			renderMonthCalendar(
				heatmapContainer,
				dataMap,
				endDate,
				settings.weekStartDay,
				settings.heatmapColorScheme,
				scaleMode,
				settings.dailyGoalHours,
				holidays,
				excludeNW
			);
		} else {
			renderHeatmap(
				heatmapContainer,
				dataMap,
				startDate,
				endDate,
				settings.weekStartDay,
				settings.heatmapColorScheme,
				scaleMode,
				settings.dailyGoalHours,
				holidays,
				excludeNW
			);
		}

		// Legend
		renderHeatmapLegend(
			this.contentContainer,
			settings.heatmapColorScheme,
			settings.enableGoals,
			excludeNW
		);

		// Summary stats — work-day aware
		const workDays = excludeNW
			? summary.days.filter(d => !isNonWorkingDay(d.date, holidays))
			: summary.days;
		const activeWorkDays = workDays.filter(d => d.totalHours > 0);
		const avgPerDay = activeWorkDays.length > 0
			? Math.round((summary.totalHours / activeWorkDays.length) * 10) / 10
			: 0;

		// Streaks — work-day aware
		const { currentStreak, longestStreak } = calculateStreaks(
			summary.days, holidays, excludeNW
		);

		// Most productive day of week — only consider work days when toggle is on
		const dayOfWeekTotals = new Array(7).fill(0);
		const dayOfWeekCounts = new Array(7).fill(0);
		for (const day of summary.days) {
			if (day.totalHours > 0) {
				const date = new Date(day.date + 'T00:00:00');
				const dow = date.getDay();
				// When excluding non-working days, skip weekends and holidays
				if (excludeNW && isNonWorkingDay(day.date, holidays)) continue;
				dayOfWeekTotals[dow] += day.totalHours;
				dayOfWeekCounts[dow]++;
			}
		}

		let bestDay = 0;
		let bestDayAvg = 0;
		const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
		for (let i = 0; i < 7; i++) {
			const avg = dayOfWeekCounts[i] > 0 ? dayOfWeekTotals[i] / dayOfWeekCounts[i] : 0;
			if (avg > bestDayAvg) {
				bestDayAvg = avg;
				bestDay = i;
			}
		}

		// Summary cards (5 total)
		const cards = this.contentContainer.createDiv({ cls: 'time-tracker-summary-cards' });

		const totalCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		totalCard.createDiv({ cls: 'time-tracker-card-value', text: `${summary.totalHours}h` });
		totalCard.createDiv({ cls: 'time-tracker-card-label', text: 'Total Hours' });

		const avgCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		avgCard.createDiv({ cls: 'time-tracker-card-value', text: `${avgPerDay}h` });
		avgCard.createDiv({ cls: 'time-tracker-card-label', text: excludeNW ? 'Avg/Work Day' : 'Avg/Active Day' });

		const currentStreakCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		currentStreakCard.createDiv({ cls: 'time-tracker-card-value', text: `${currentStreak}d` });
		currentStreakCard.createDiv({ cls: 'time-tracker-card-label', text: 'Current Streak' });

		const streakCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		streakCard.createDiv({ cls: 'time-tracker-card-value', text: `${longestStreak}d` });
		streakCard.createDiv({ cls: 'time-tracker-card-label', text: 'Longest Streak' });

		const bestDayCard = cards.createDiv({ cls: 'time-tracker-summary-card' });
		bestDayCard.createDiv({ cls: 'time-tracker-card-value', text: activeWorkDays.length > 0 ? dayNames[bestDay].substring(0, 3) : '-' });
		bestDayCard.createDiv({ cls: 'time-tracker-card-label', text: 'Most Productive' });
	}
}
