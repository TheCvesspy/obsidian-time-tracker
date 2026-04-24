import { Notice, Plugin } from 'obsidian';
import { notify, detectOverlaps, detectGaps, formatTime24, formatDateISO } from './utils';
import { DEFAULT_PLUGIN_DATA, PluginData, PluginSettings, TimeEntry, WorklogReference } from './types';
import { TimerService } from './services/TimerService';
import { TimeEntryService } from './services/TimeEntryService';
import { ReminderService } from './services/ReminderService';
import { DailyNoteIntegration } from './services/DailyNoteIntegration';
import { ReportService } from './services/ReportService';
import { BuJoBridge } from './services/BuJoBridge';
import { StatusBarWidget } from './ui/StatusBarWidget';
import { TimerModal } from './ui/TimerModal';
import { QuickLogModal } from './ui/QuickLogModal';
import { WeeklySummaryModal } from './ui/WeeklySummaryModal';
import { DailySummaryModal } from './ui/DailySummaryModal';
import { EditEntryModal } from './ui/EditEntryModal';
import { DateRangeReportModal } from './ui/DateRangeReportModal';
import { CalendarHeatmapModal } from './ui/CalendarHeatmapModal';
import { TrendChartsModal } from './ui/TrendChartsModal';
import { TemplatePickerModal } from './ui/TemplatePickerModal';
import { ReferenceSuggestModal } from './ui/ReferenceSuggestModal';
import { OverlapWarningModal } from './ui/OverlapWarningModal';
import { TimeTrackerSettingTab } from './settings';

export default class TimeTrackerPlugin extends Plugin {
	data!: PluginData;
	settings!: PluginSettings;

	timerService!: TimerService;
	timeEntryService!: TimeEntryService;
	reminderService!: ReminderService;
	dailyNoteIntegration!: DailyNoteIntegration;
	reportService!: ReportService;
	bujoBridge!: BuJoBridge;

	/** Last Topic/JIRA reference the user picked; used to pre-seed the picker. */
	lastUsedReference: WorklogReference | null = null;

	private statusBarWidget: StatusBarWidget | null = null;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		// Load persisted data with deep merge
		await this.loadPluginData();

		// Initialize services
		this.bujoBridge = new BuJoBridge(this.app, () => this.settings);

		this.dailyNoteIntegration = new DailyNoteIntegration(
			this.app,
			() => this.settings
		);

		this.timerService = new TimerService(
			() => this.data.timerState,
			async (state) => {
				this.data.timerState = state;
				await this.saveData(this.data);
			},
			() => this.settings
		);

		this.timeEntryService = new TimeEntryService(
			this.app,
			this.dailyNoteIntegration,
			() => this.settings
		);

		this.reminderService = new ReminderService(
			this.timerService,
			() => this.settings
		);

		this.reportService = new ReportService(
			this.timeEntryService,
			() => this.settings
		);

		// Status bar widget
		this.statusBarEl = this.addStatusBarItem();
		this.statusBarWidget = new StatusBarWidget(this.statusBarEl, this);
		this.updateStatusBarVisibility();

		// Timer UI updates
		this.timerService.onUpdate(() => {
			this.statusBarWidget?.update();
		});

		// Periodically refresh the status bar so today's hours and date rollover stay current
		this.registerInterval(window.setInterval(() => {
			this.statusBarWidget?.update();
		}, 30_000));

		// Register commands
		this.addCommand({
			id: 'start-timer',
			name: 'Start Timer',
			callback: () => this.startTimerInteractive(),
		});

		this.addCommand({
			id: 'start-timer-with-reference',
			name: 'Start Timer with Reference',
			callback: () => this.startTimerInteractive({ forcePromptReference: true }),
		});

		this.addCommand({
			id: 'stop-timer',
			name: 'Stop Timer',
			callback: () => this.stopTimer(),
		});

		this.addCommand({
			id: 'pause-timer',
			name: 'Pause Timer',
			callback: () => this.pauseTimer(),
		});

		this.addCommand({
			id: 'resume-timer',
			name: 'Resume Timer',
			callback: () => this.resumeTimer(),
		});

		this.addCommand({
			id: 'toggle-pause',
			name: 'Pause / Resume Timer',
			callback: () => this.togglePauseTimer(),
		});

		this.addCommand({
			id: 'toggle-timer',
			name: 'Toggle Timer',
			callback: () => {
				if (this.timerService.isRunning) {
					this.stopTimer();
				} else {
					this.startTimerInteractive();
				}
			},
		});

		this.addCommand({
			// Command ID kept stable so existing hotkey bindings survive the rename.
			id: 'quick-log',
			name: 'Log Work',
			callback: () => new QuickLogModal(this).open(),
		});

		this.addCommand({
			id: 'weekly-summary',
			name: 'Weekly Summary',
			callback: () => new WeeklySummaryModal(this).open(),
		});

		this.addCommand({
			id: 'open-today-time-log',
			name: "Open Today's Time Log",
			callback: () => this.openTodayTimeLog(),
		});

		this.addCommand({
			id: 'daily-summary',
			name: 'Daily Summary',
			callback: () => new DailySummaryModal(this).open(),
		});

		this.addCommand({
			id: 'edit-time-log',
			name: 'Edit Time Log',
			callback: () => new EditEntryModal(this).open(),
		});

		this.addCommand({
			id: 'date-range-report',
			name: 'Date Range Report',
			callback: () => new DateRangeReportModal(this).open(),
		});

		this.addCommand({
			id: 'calendar-heatmap',
			name: 'Calendar Heatmap',
			callback: () => new CalendarHeatmapModal(this).open(),
		});

		this.addCommand({
			id: 'trend-charts',
			name: 'Trend Charts',
			callback: () => new TrendChartsModal(this).open(),
		});

		this.addCommand({
			id: 'undo-last-log',
			name: 'Undo Last Log Change',
			callback: () => this.undoLastLog(),
		});

		this.addCommand({
			id: 'start-from-template',
			name: 'Start Timer from Template',
			callback: () => {
				if (this.settings.templateTasks.length === 0) {
					notify('No template tasks configured. Add them in Settings > Template Tasks.', 'warning');
					return;
				}
				new TemplatePickerModal(this).open();
			},
		});

		// Settings tab
		this.addSettingTab(new TimeTrackerSettingTab(this.app, this));

		// On layout ready: resume timer, start reminders
		this.app.workspace.onLayoutReady(() => {
			this.timerService.resumeIfRunning();
			if (this.timerService.isRunning) {
				this.reminderService.startActiveReminders();
			}
			// Always start idle nudges (they only fire when timer is NOT running)
			this.reminderService.startIdleNudges();
			this.statusBarWidget?.update();
		});
	}

	onunload(): void {
		this.reminderService.stop();
		this.timerService.stopUIUpdates();
		this.bujoBridge?.dispose();
	}

	/**
	 * Open the timer modal. When `forcePromptReference` is set, or
	 * `bujoPromptOnStart` is on and BuJo is available, the reference picker
	 * opens first and its result pre-fills the timer modal.
	 */
	startTimerInteractive(options: { forcePromptReference?: boolean } = {}): void {
		if (this.timerService.isRunning) {
			notify('Timer is already running. Stop it first.', 'warning');
			return;
		}

		const shouldPrompt = options.forcePromptReference
			|| (this.settings.bujoPromptOnStart && this.bujoBridge.isAvailable());

		if (options.forcePromptReference && !this.bujoBridge.isAvailable()) {
			notify('BuJo plugin is not available — opening timer without reference picker.', 'warning');
		}

		if (shouldPrompt && this.bujoBridge.isAvailable()) {
			new ReferenceSuggestModal(
				this.app,
				this.bujoBridge,
				(ref) => new TimerModal(this, ref).open(),
				{ title: 'Attach a reference', skippable: !options.forcePromptReference }
			).open();
		} else {
			new TimerModal(this).open();
		}
	}

	/** Start the timer programmatically (called from TimerModal) */
	async startTimer(description: string, category: string | null, reference?: WorklogReference | null): Promise<void> {
		await this.timerService.start(description, category, reference);
		this.reminderService.startActiveReminders();
		this.statusBarWidget?.update();
		notify(`Timer started: ${description}`, 'success');

		// Gap nudge — fire-and-forget, must not block the start path.
		this.maybeNudgeAboutGap().catch(err => {
			console.error('Time Tracker: gap nudge failed', err);
		});
	}

	/**
	 * If the user just started a timer and today's last logged entry ended more
	 * than `gapDetectionMinutes` ago, show a Notice with a "Log Work" shortcut
	 * so the gap can be backfilled quickly.
	 */
	private async maybeNudgeAboutGap(): Promise<void> {
		if (!this.settings.enableGapDetection) return;
		const threshold = Math.max(1, this.settings.gapDetectionMinutes);

		const today = formatDateISO(new Date());
		const entries = await this.timeEntryService.getEntriesForDate(today);
		if (entries.length === 0) return;

		// We want the "tail" gap — from the last entry's end to right before the
		// timer we just started. Use the timer's startedAt to avoid racing with
		// seconds that have already elapsed.
		const now = formatTime24(new Date());
		const gaps = detectGaps(entries, threshold, { includeTail: true, now });
		if (gaps.length === 0) return;

		const tail = gaps[gaps.length - 1];
		if (tail.endTime !== now) return; // only surface the just-opened tail gap

		const fragment = document.createDocumentFragment();
		fragment.appendChild(document.createTextNode(
			`Unlogged ${tail.minutes}-minute gap from ${tail.startTime} to ${tail.endTime}. `
		));
		const btn = document.createElement('a');
		btn.textContent = 'Log it now';
		btn.style.cursor = 'pointer';
		btn.style.textDecoration = 'underline';
		btn.addEventListener('click', () => {
			new QuickLogModal(this, {
				date: today,
				startTime: tail.startTime,
				endTime: tail.endTime,
			}).open();
		});
		fragment.appendChild(btn);
		new Notice(fragment, 12_000);
	}

	/** Pause the running timer. No-op when stopped or already paused. */
	async pauseTimer(): Promise<void> {
		if (!this.timerService.isRunning) {
			notify('No timer is running.', 'warning');
			return;
		}
		if (this.timerService.isPaused) {
			notify('Timer is already paused.', 'warning');
			return;
		}
		await this.timerService.pause();
		this.statusBarWidget?.update();
		notify('Timer paused', 'info');
	}

	/** Resume a paused timer. No-op when not paused. */
	async resumeTimer(): Promise<void> {
		if (!this.timerService.isPaused) {
			notify('Timer is not paused.', 'warning');
			return;
		}
		await this.timerService.resume();
		this.statusBarWidget?.update();
		notify('Timer resumed', 'success');
	}

	/** Toggle pause/resume. Shown as a single command for single-key hotkeys. */
	async togglePauseTimer(): Promise<void> {
		if (!this.timerService.isRunning) {
			notify('No timer is running.', 'warning');
			return;
		}
		if (this.timerService.isPaused) {
			await this.resumeTimer();
		} else {
			await this.pauseTimer();
		}
	}

	/** Stop the running timer and save the time log */
	async stopTimer(): Promise<void> {
		if (!this.timerService.isRunning) {
			notify('No timer is running.', 'warning');
			return;
		}

		// Before tearing down the timer, give the user a chance to attach a reference.
		if (
			this.settings.bujoPromptOnStop
			&& this.bujoBridge.isAvailable()
			&& !this.timerService.currentReference
		) {
			const picked = await new Promise<WorklogReference | null>(resolve => {
				new ReferenceSuggestModal(
					this.app,
					this.bujoBridge,
					(ref) => resolve(ref),
					{ title: 'Attach a reference before saving', skippable: true }
				).open();
			});
			if (picked) {
				await this.timerService.setReference(picked);
				if (this.settings.rememberLastReference) {
					this.lastUsedReference = picked;
				}
			}
		}

		// Stop timer first to get the entry, but save state only after successful write
		const entry = await this.timerService.stop();
		this.reminderService.stopActiveReminders();
		this.statusBarWidget?.update();

		if (entry) {
			try {
				// Overlap check: stop-timer is a write path too. Cancelling here means
				// the entry is discarded; the user is expected to fix times via Log Work.
				if (!await this.confirmNoOverlaps(entry)) {
					notify(
						`Timer stopped but row was not saved. Use Log Work to record:\n${entry.startTime}-${entry.endTime} (${entry.durationHours}h) ${entry.description}`,
						'warning', 15_000
					);
					return;
				}
				await this.timeEntryService.addEntry(entry);
				notify(`Logged ${entry.durationHours}h: ${entry.description}`, 'success');
			} catch (err) {
				// Time log failed to write — notify user so they can log manually
				console.error('Time Tracker: Failed to save time log', err);
				notify(
					`Failed to save time log. Please log manually:\n${entry.startTime}-${entry.endTime} (${entry.durationHours}h) ${entry.description}`,
					'error', 15_000
				);
			}
		}
	}

	/** Add a manual time log (called from QuickLogModal) */
	async addManualEntry(entry: TimeEntry): Promise<void> {
		if (!await this.confirmNoOverlaps(entry)) return;
		await this.timeEntryService.addEntry(entry);
		notify(`Logged ${entry.durationHours}h: ${entry.description}`, 'success');
		this.refreshStatusBar();
	}

	/**
	 * Check for overlaps on the entry's date and, when `warnOnOverlap` is on,
	 * prompt the user to confirm or cancel the write. Resolves `true` when the
	 * caller should proceed, `false` when the user cancelled.
	 */
	async confirmNoOverlaps(candidate: TimeEntry, excludeStartTime?: string): Promise<boolean> {
		if (!this.settings.warnOnOverlap) return true;
		const existing = await this.timeEntryService.getEntriesForDate(candidate.date);
		const overlaps = detectOverlaps(candidate, existing, excludeStartTime);
		if (overlaps.length === 0) return true;
		return new Promise<boolean>(resolve => {
			new OverlapWarningModal(this.app, candidate, overlaps, resolve).open();
		});
	}

	/** Navigate to today's daily note */
	async openTodayTimeLog(): Promise<void> {
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(new Date());
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
	}

	/** Refresh the status bar widget */
	refreshStatusBar(): void {
		this.statusBarWidget?.update();
	}

	/** Roll back the most recent log write, if the in-memory stack is non-empty. */
	async undoLastLog(): Promise<void> {
		const label = await this.timeEntryService.undoLastWrite();
		if (label) {
			notify(`Undone: ${label}`, 'success');
			this.refreshStatusBar();
		} else {
			notify('Nothing to undo.', 'warning');
		}
	}

	/** Update status bar visibility based on settings */
	updateStatusBarVisibility(): void {
		if (this.statusBarEl) {
			this.statusBarEl.style.display = this.settings.showStatusBar ? '' : 'none';
		}
	}

	/** Save settings to disk */
	async saveSettings(): Promise<void> {
		this.data.settings = this.settings;
		await this.saveData(this.data);
	}

	/** Load and deep-merge plugin data */
	private async loadPluginData(): Promise<void> {
		const saved = await this.loadData();
		this.data = this.deepMerge(DEFAULT_PLUGIN_DATA, saved || {}) as PluginData;
		this.settings = this.data.settings;
	}

	/** Deep merge source into target (target values are defaults) */
	private deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
		const result: Record<string, any> = { ...target };
		for (const key of Object.keys(source)) {
			if (
				source[key] &&
				typeof source[key] === 'object' &&
				!Array.isArray(source[key]) &&
				target[key] &&
				typeof target[key] === 'object' &&
				!Array.isArray(target[key])
			) {
				result[key] = this.deepMerge(target[key], source[key]);
			} else if (source[key] !== undefined) {
				result[key] = source[key];
			}
		}
		return result;
	}
}
