import { Modal } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { DailySummary } from '../types';
import { formatDateISO, isNonWorkingDay } from '../utils';
import { renderLineChart, renderStackedAreaChart, generatePalette, ChartSeries } from './charts/ChartRenderer';

type TrendPeriod = '4w' | '3m' | '6m' | '1y';

export class TrendChartsModal extends Modal {
	private period: TrendPeriod = '3m';
	private showWorkdaysOnly: boolean;
	private contentContainer: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.showWorkdaysOnly = plugin.settings.excludeNonWorkingDays;
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal', 'time-tracker-chart-modal');
		await this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Trend Charts' });

		// Period toggle
		const toggleRow = contentEl.createDiv({ cls: 'time-tracker-view-toggle' });
		const periods: [TrendPeriod, string][] = [
			['4w', '4 Weeks'],
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

		// Workdays-only filter
		const filterRow = contentEl.createDiv({ cls: 'time-tracker-chart-filter' });
		const filterLabel = filterRow.createEl('label');
		const checkbox = filterLabel.createEl('input', { type: 'checkbox' });
		checkbox.checked = this.showWorkdaysOnly;
		checkbox.addEventListener('change', async () => {
			this.showWorkdaysOnly = checkbox.checked;
			await this.render();
		});
		filterLabel.appendText(' Workdays only');

		this.contentContainer = contentEl.createDiv();
		this.contentContainer.createEl('p', { text: 'Loading...', cls: 'time-tracker-loading' });

		await this.loadAndRender();
	}

	private async loadAndRender(): Promise<void> {
		if (!this.contentContainer) return;

		const endDate = new Date();
		const startDate = new Date();

		switch (this.period) {
			case '4w':
				startDate.setDate(startDate.getDate() - 27);
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

		// 1. Hours Over Time (daily line chart)
		this.renderHoursOverTime(this.contentContainer, summary.days);

		// 2. Category Trends (weekly stacked area)
		this.renderCategoryTrends(this.contentContainer, summary.days);
	}

	private renderHoursOverTime(container: HTMLElement, days: DailySummary[]): void {
		const section = container.createDiv({ cls: 'time-tracker-chart-section' });
		section.createEl('h4', { text: 'Hours Over Time' });

		const canvas = section.createEl('canvas', { cls: 'time-tracker-chart-canvas' });

		const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent')?.trim() || '#7c5cbf';
		const holidays = this.plugin.settings.holidays;

		// Filter days based on workdays-only toggle
		let filteredDays: DailySummary[];
		let highlightIndices: number[] | undefined;

		if (this.showWorkdaysOnly) {
			filteredDays = days.filter(d => !isNonWorkingDay(d.date, holidays));
		} else {
			filteredDays = days;
			// Mark weekend/holiday indices for shading
			highlightIndices = [];
			for (let i = 0; i < days.length; i++) {
				if (isNonWorkingDay(days[i].date, holidays)) {
					highlightIndices.push(i);
				}
			}
		}

		const xLabels = filteredDays.map(d => {
			const date = new Date(d.date + 'T00:00:00');
			const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
			return `${months[date.getMonth()]} ${date.getDate()}`;
		});

		const rawData = filteredDays.map(d => d.totalHours);

		const series: ChartSeries[] = [{
			label: 'Hours',
			data: rawData,
			color: accentColor,
		}];

		// Moving average (5-point)
		if (filteredDays.length >= 5) {
			const windowSize = 5;
			const maData = rawData.map((_, i) => {
				const startIdx = Math.max(0, i - windowSize + 1);
				const window = rawData.slice(startIdx, i + 1);
				return Math.round((window.reduce((sum, v) => sum + v, 0) / window.length) * 100) / 100;
			});
			series.push({
				label: '5-day avg',
				data: maData,
				color: '#e07c39',
				style: 'smooth',
			});
		}

		const settings = this.plugin.settings;
		const goalLine = settings.enableGoals ? settings.dailyGoalHours : undefined;

		// Defer rendering until canvas has layout dimensions
		setTimeout(() => {
			renderLineChart(canvas, series, {
				xLabels,
				areaFill: true,
				goalLine,
				highlightIndices,
			});
		}, 0);
	}

	private renderCategoryTrends(container: HTMLElement, days: DailySummary[]): void {
		// Aggregate days into weekly buckets
		const weeklyBuckets = this.aggregateByWeek(days);

		if (weeklyBuckets.length === 0) return;

		// Collect all categories
		const allCategories = new Set<string>();
		for (const week of weeklyBuckets) {
			for (const cat of Object.keys(week.byCategory)) {
				allCategories.add(cat);
			}
		}

		if (allCategories.size === 0) return;

		const section = container.createDiv({ cls: 'time-tracker-chart-section' });
		section.createEl('h4', { text: 'Category Trends (Weekly)' });

		const canvas = section.createEl('canvas', { cls: 'time-tracker-chart-canvas' });

		const accentColor = getComputedStyle(document.body).getPropertyValue('--interactive-accent')?.trim() || '#7c5cbf';
		const categories = Array.from(allCategories);
		const palette = generatePalette(accentColor, categories.length);

		const xLabels = weeklyBuckets.map(w => w.label);
		const series: ChartSeries[] = categories.map((cat, i) => ({
			label: cat,
			data: weeklyBuckets.map(w => w.byCategory[cat] || 0),
			color: palette[i],
		}));

		// Sort by total hours descending so the biggest category is at the bottom
		const catTotals = categories.map((cat, i) => ({
			cat,
			total: series[i].data.reduce((a, b) => a + b, 0),
			series: series[i],
		}));
		catTotals.sort((a, b) => b.total - a.total);
		const sortedSeries = catTotals.map(c => c.series);

		setTimeout(() => {
			renderStackedAreaChart(canvas, sortedSeries, xLabels);
		}, 0);

		// Legend
		const legend = section.createDiv({ cls: 'time-tracker-chart-legend' });
		for (const ct of catTotals) {
			const item = legend.createDiv({ cls: 'time-tracker-chart-legend-item' });
			const swatch = item.createSpan({ cls: 'time-tracker-chart-legend-swatch' });
			swatch.style.background = ct.series.color;
			item.createSpan({ text: `${ct.cat} (${Math.round(ct.total * 100) / 100}h)` });
		}
	}

	private aggregateByWeek(days: DailySummary[]): { label: string; byCategory: Record<string, number> }[] {
		const weekStartDay = this.plugin.settings.weekStartDay;
		const buckets: Map<string, Record<string, number>> = new Map();
		const bucketLabels: Map<string, string> = new Map();

		for (const day of days) {
			const date = new Date(day.date + 'T00:00:00');
			const diff = (date.getDay() - weekStartDay + 7) % 7;
			const weekStart = new Date(date);
			weekStart.setDate(weekStart.getDate() - diff);
			const key = formatDateISO(weekStart);

			if (!buckets.has(key)) {
				buckets.set(key, {});
				const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
				bucketLabels.set(key, `${months[weekStart.getMonth()]} ${weekStart.getDate()}`);
			}

			const bucket = buckets.get(key)!;
			for (const [cat, hours] of Object.entries(day.byCategory)) {
				bucket[cat] = (bucket[cat] || 0) + hours;
			}
		}

		const sortedKeys = Array.from(buckets.keys()).sort();
		return sortedKeys.map(key => ({
			label: bucketLabels.get(key)!,
			byCategory: buckets.get(key)!,
		}));
	}
}
