import { Menu } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { formatDateISO } from '../utils';

export class StatusBarWidget {
	private el: HTMLElement;
	private dotEl: HTMLElement;
	private textEl: HTMLElement;
	private dailyTotal: number = 0;

	constructor(
		statusBarEl: HTMLElement,
		private plugin: TimeTrackerPlugin
	) {
		this.el = statusBarEl;
		this.el.addClass('time-tracker-status-bar', 'time-tracker-idle');

		this.dotEl = this.el.createSpan({ cls: 'time-tracker-dot' });
		this.textEl = this.el.createSpan({ cls: 'time-tracker-status-text' });

		this.el.addEventListener('click', (e) => this.onClick(e));
		this.update();
	}

	/** Update the status bar display */
	update(): void {
		const timer = this.plugin.timerService;

		if (timer.isRunning && !timer.isPaused) {
			this.el.removeClass('time-tracker-idle', 'time-tracker-paused');
			this.el.addClass('time-tracker-running');
			this.dotEl.style.display = '';

			const elapsed = timer.getFormattedElapsed();
			const desc = timer.currentDescription || 'Timer';
			const cat = timer.currentCategory;
			const label = cat ? `${cat} - ${desc}` : desc;

			// Truncate long descriptions
			const maxLen = 30;
			const truncated = label.length > maxLen ? label.substring(0, maxLen) + '...' : label;

			this.textEl.textContent = `${elapsed} | ${truncated}`;
		} else if (timer.isRunning && timer.isPaused) {
			this.el.removeClass('time-tracker-idle', 'time-tracker-running');
			this.el.addClass('time-tracker-paused');
			this.dotEl.style.display = '';

			const elapsed = timer.getFormattedElapsed();
			const desc = timer.currentDescription || 'Timer';
			const cat = timer.currentCategory;
			const label = cat ? `${cat} - ${desc}` : desc;

			const maxLen = 30;
			const truncated = label.length > maxLen ? label.substring(0, maxLen) + '...' : label;

			this.textEl.textContent = `\u23F8 ${elapsed} | ${truncated}`;
		} else {
			this.el.removeClass('time-tracker-running', 'time-tracker-paused');
			this.el.addClass('time-tracker-idle');
			this.dotEl.style.display = 'none';
			this.textEl.textContent = `Today: ${this.dailyTotal}h`;
		}
	}

	/** Refresh the daily total from entries */
	async refreshDailyTotal(): Promise<void> {
		const dateStr = formatDateISO(new Date());
		const entries = await this.plugin.timeEntryService.getEntriesForDate(dateStr);
		let total = 0;
		for (const entry of entries) {
			total += entry.durationHours ?? 0;
		}
		this.dailyTotal = Math.round(total * 100) / 100;
		this.update();
	}

	private onClick(e: MouseEvent): void {
		const timer = this.plugin.timerService;

		if (timer.isRunning && timer.isPaused) {
			// Paused — show resume/stop menu
			const menu = new Menu();
			menu.addItem(item => {
				item.setTitle('Resume Timer')
					.setIcon('play')
					.onClick(() => this.plugin.resumeTimer());
			});
			menu.addItem(item => {
				item.setTitle('Stop Timer')
					.setIcon('square')
					.onClick(() => this.plugin.stopTimer());
			});
			menu.showAtMouseEvent(e);
		} else if (timer.isRunning) {
			// Running — show pause/stop menu
			const menu = new Menu();
			menu.addItem(item => {
				item.setTitle('Pause Timer')
					.setIcon('pause')
					.onClick(() => this.plugin.pauseTimer());
			});
			menu.addItem(item => {
				item.setTitle('Stop Timer')
					.setIcon('square')
					.onClick(() => this.plugin.stopTimer());
			});
			menu.showAtMouseEvent(e);
		} else {
			// Idle — open timer start modal
			this.plugin.startTimerInteractive();
		}
	}
}
