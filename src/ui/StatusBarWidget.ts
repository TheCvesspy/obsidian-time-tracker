import { Menu } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { formatDateISO, formatHotkeyForCommand } from '../utils';
import { DailySummaryModal } from './DailySummaryModal';
import { EditEntryModal } from './EditEntryModal';
import { CalendarHeatmapModal } from './CalendarHeatmapModal';
import { TrendChartsModal } from './TrendChartsModal';
import { QuickLogModal } from './QuickLogModal';
import { ReferenceSuggestModal } from './ReferenceSuggestModal';
import { formatReferenceForDisplay } from './formatReference';

export class StatusBarWidget {
	private el: HTMLElement;
	private dotEl: HTMLElement;
	private textEl: HTMLElement;
	private todayHours = 0;

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
			// Distinct visual state for paused vs. running.
			if (timer.isPaused) this.el.addClass('time-tracker-paused');
			else this.el.removeClass('time-tracker-paused');
			this.dotEl.style.display = '';

			const elapsed = timer.getFormattedElapsed();
			const desc = timer.currentDescription || 'Timer';
			const cat = timer.currentCategory;
			const label = cat ? `${cat} - ${desc}` : desc;

			// Truncate long descriptions
			const maxLen = 30;
			const truncated = label.length > maxLen ? label.substring(0, maxLen) + '...' : label;

			const prefix = timer.isPaused ? '\u23F8' : elapsed; // ⏸ when paused
			this.textEl.textContent = timer.isPaused
				? `${prefix} ${elapsed} | ${truncated}`
				: `${elapsed} | ${truncated}`;

			// Surface the attached reference in the hover tooltip.
			const ref = timer.currentReference;
			const formatted = formatReferenceForDisplay(ref, this.plugin.bujoBridge);
			const stateLine = timer.isPaused ? 'Paused' : null;
			const tooltipLines = [label, stateLine, formatted?.label].filter(Boolean) as string[];
			this.el.setAttr('title', tooltipLines.join('\n'));
		} else {
			this.el.removeClass('time-tracker-running', 'time-tracker-paused');
			this.el.addClass('time-tracker-idle');
			this.dotEl.style.display = 'none';
			this.textEl.textContent = this.formatIdleText();
			this.el.removeAttribute('title');
		}

		// Refresh today's total in the background
		this.refreshTodayHours();
	}

	/** Fetch today's logged hours and update idle text */
	private async refreshTodayHours(): Promise<void> {
		try {
			const today = formatDateISO(new Date());
			const summary = await this.plugin.reportService.getDailySummary(today);
			this.todayHours = summary.totalHours;

			// Only update text if still idle (timer may have started while fetching)
			if (!this.plugin.timerService.isRunning) {
				this.textEl.textContent = this.formatIdleText();
			}
		} catch {
			// Silently ignore — file may not exist yet
		}
	}

	/** Format the idle status text and apply goal color indicator */
	private formatIdleText(): string {
		const settings = this.plugin.settings;
		// Remove any previous goal color classes
		this.el.removeClass('time-tracker-goal-reached', 'time-tracker-goal-near', 'time-tracker-goal-far');

		if (settings.enableGoals) {
			const ratio = this.todayHours / settings.dailyGoalHours;
			if (ratio >= 1) {
				this.el.addClass('time-tracker-goal-reached');
			} else if (ratio >= 0.75) {
				this.el.addClass('time-tracker-goal-near');
			} else {
				this.el.addClass('time-tracker-goal-far');
			}
			return `${this.todayHours}h / ${settings.dailyGoalHours}h`;
		}
		return `Today: ${this.todayHours}h`;
	}

	/** Append the binding (if any) to a menu label: "Start Timer (Ctrl+Shift+T)". */
	private withHotkey(label: string, commandId: string): string {
		const hotkey = formatHotkeyForCommand(this.plugin.app, commandId);
		return hotkey ? `${label}  ·  ${hotkey}` : label;
	}

	private onClick(e: MouseEvent): void {
		const menu = new Menu();
		const timer = this.plugin.timerService;

		if (timer.isRunning) {
			if (timer.isPaused) {
				menu.addItem(item => {
					item.setTitle(this.withHotkey('Resume Timer', 'resume-timer'))
						.setIcon('play')
						.onClick(() => this.plugin.resumeTimer());
				});
			} else {
				menu.addItem(item => {
					item.setTitle(this.withHotkey('Pause Timer', 'pause-timer'))
						.setIcon('pause')
						.onClick(() => this.plugin.pauseTimer());
				});
			}
			menu.addItem(item => {
				item.setTitle(this.withHotkey('Stop Timer', 'stop-timer'))
					.setIcon('square')
					.onClick(() => this.plugin.stopTimer());
			});
			// Quick "attach reference" action while the timer is running.
			if (this.plugin.bujoBridge.isAvailable()) {
				const refLabel = timer.currentReference ? 'Change Reference…' : 'Attach Reference…';
				menu.addItem(item => {
					item.setTitle(refLabel)
						.setIcon('bookmark')
						.onClick(() => {
							new ReferenceSuggestModal(
								this.plugin.app,
								this.plugin.bujoBridge,
								async (ref) => {
									await this.plugin.timerService.setReference(ref);
									this.update();
								},
								{ initial: timer.currentReference ?? null, title: 'Attach a reference' }
							).open();
						});
				});
			}
		} else {
			menu.addItem(item => {
				item.setTitle(this.withHotkey('Start Timer', 'start-timer'))
					.setIcon('play')
					.onClick(() => this.plugin.startTimerInteractive());
			});
		}

		// Manual "Log Work" entry is always useful — whether the timer is running
		// (back-filling missed time) or idle (logging a completed task).
		menu.addItem(item => {
			item.setTitle(this.withHotkey('Log Work', 'quick-log'))
				.setIcon('clock')
				.onClick(() => new QuickLogModal(this.plugin).open());
		});

		// Undo last log — only exposed when the in-memory stack has something to roll back.
		const undoTarget = this.plugin.timeEntryService.peekUndo();
		if (undoTarget) {
			menu.addItem(item => {
				item.setTitle(this.withHotkey(`Undo: ${undoTarget.label}`, 'undo-last-log'))
					.setIcon('undo-2')
					.onClick(() => this.plugin.undoLastLog());
			});
		}

		menu.addSeparator();

		menu.addItem(item => {
			item.setTitle(this.withHotkey('Daily Summary', 'daily-summary'))
				.setIcon('calendar')
				.onClick(() => new DailySummaryModal(this.plugin).open());
		});

		menu.addItem(item => {
			item.setTitle(this.withHotkey('Edit Time Log', 'edit-time-log'))
				.setIcon('pencil')
				.onClick(() => new EditEntryModal(this.plugin).open());
		});

		menu.addItem(item => {
			item.setTitle(this.withHotkey('Calendar Heatmap', 'calendar-heatmap'))
				.setIcon('layout-grid')
				.onClick(() => new CalendarHeatmapModal(this.plugin).open());
		});

		menu.addItem(item => {
			item.setTitle(this.withHotkey('Trend Charts', 'trend-charts'))
				.setIcon('line-chart')
				.onClick(() => new TrendChartsModal(this.plugin).open());
		});

		menu.showAtMouseEvent(e);
	}
}
