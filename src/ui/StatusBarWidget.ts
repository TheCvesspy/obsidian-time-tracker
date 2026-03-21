import { Menu } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { STATUS_BAR_IDLE_TEXT } from '../constants';

export class StatusBarWidget {
	private el: HTMLElement;
	private dotEl: HTMLElement;
	private textEl: HTMLElement;

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

		if (timer.isRunning) {
			this.el.removeClass('time-tracker-idle');
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
		} else {
			this.el.removeClass('time-tracker-running');
			this.el.addClass('time-tracker-idle');
			this.dotEl.style.display = 'none';
			this.textEl.textContent = STATUS_BAR_IDLE_TEXT;
		}
	}

	private onClick(e: MouseEvent): void {
		const timer = this.plugin.timerService;

		if (timer.isRunning) {
			// Show context menu
			const menu = new Menu();
			menu.addItem(item => {
				item.setTitle('Stop Timer')
					.setIcon('square')
					.onClick(() => this.plugin.stopTimer());
			});
			menu.showAtMouseEvent(e);
		} else {
			// Open timer start modal
			this.plugin.startTimerInteractive();
		}
	}
}
