import { Notice, Plugin } from 'obsidian';
import { DEFAULT_PLUGIN_DATA, PluginData, PluginSettings, TimeEntry } from './types';
import { TimerService } from './services/TimerService';
import { TimeEntryService } from './services/TimeEntryService';
import { ReminderService } from './services/ReminderService';
import { DailyNoteIntegration } from './services/DailyNoteIntegration';
import { ReportService } from './services/ReportService';
import { StatusBarWidget } from './ui/StatusBarWidget';
import { TimerModal } from './ui/TimerModal';
import { QuickLogModal } from './ui/QuickLogModal';
import { EditEntryModal } from './ui/EditEntryModal';
import { DailySummaryModal } from './ui/DailySummaryModal';
import { WeeklySummaryModal } from './ui/WeeklySummaryModal';
import { TimeTrackerSettingTab } from './settings';

export default class TimeTrackerPlugin extends Plugin {
	data!: PluginData;
	settings!: PluginSettings;

	timerService!: TimerService;
	timeEntryService!: TimeEntryService;
	reminderService!: ReminderService;
	dailyNoteIntegration!: DailyNoteIntegration;
	reportService!: ReportService;

	private statusBarWidget: StatusBarWidget | null = null;
	private statusBarEl: HTMLElement | null = null;

	async onload(): Promise<void> {
		// Load persisted data with deep merge
		await this.loadPluginData();

		// Initialize services
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

		// Wire category auto-learning
		this.timeEntryService.setOnNewCategory((cat) => {
			if (!this.settings.categories.some(c => c.toLowerCase() === cat.toLowerCase())) {
				this.settings.categories.push(cat);
				this.saveSettings();
			}
		});

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

		// Register commands
		this.addCommand({
			id: 'start-timer',
			name: 'Start Timer',
			callback: () => this.startTimerInteractive(),
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
			id: 'toggle-timer',
			name: 'Toggle Timer',
			callback: () => {
				if (this.timerService.isRunning && this.timerService.isPaused) {
					this.resumeTimer();
				} else if (this.timerService.isRunning) {
					this.pauseTimer();
				} else {
					this.startTimerInteractive();
				}
			},
		});

		this.addCommand({
			id: 'quick-log',
			name: 'Log Time',
			callback: () => new QuickLogModal(this).open(),
		});

		this.addCommand({
			id: 'edit-time-log',
			name: 'Edit Time Log',
			callback: () => new EditEntryModal(this).open(),
		});

		this.addCommand({
			id: 'daily-summary',
			name: 'Daily Summary',
			callback: () => new DailySummaryModal(this).open(),
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

		// Settings tab
		this.addSettingTab(new TimeTrackerSettingTab(this.app, this));

		// On layout ready: resume timer, start reminders, refresh daily total
		this.app.workspace.onLayoutReady(() => {
			this.timerService.resumeIfRunning();
			if (this.timerService.isRunning && !this.timerService.isPaused) {
				this.reminderService.startActiveReminders();
			}
			// Always start idle nudges (they only fire when timer is NOT running)
			this.reminderService.startIdleNudges();
			this.statusBarWidget?.update();
			this.statusBarWidget?.refreshDailyTotal();
		});
	}

	onunload(): void {
		this.reminderService.stop();
		this.timerService.stopUIUpdates();
	}

	/** Open timer modal to start a new timer */
	startTimerInteractive(): void {
		if (this.timerService.isRunning) {
			new Notice('Timer is already running. Stop it first.');
			return;
		}
		new TimerModal(this).open();
	}

	/** Start the timer programmatically (called from TimerModal) */
	async startTimer(description: string, category: string | null): Promise<void> {
		await this.timerService.start(description, category);
		this.reminderService.startActiveReminders();
		this.statusBarWidget?.update();
		new Notice(`Timer started: ${description}`);
	}

	/** Pause the running timer */
	async pauseTimer(): Promise<void> {
		if (!this.timerService.isRunning || this.timerService.isPaused) {
			new Notice('No running timer to pause.');
			return;
		}
		await this.timerService.pause();
		this.reminderService.stopActiveReminders();
		this.statusBarWidget?.update();
		new Notice('Timer paused');
	}

	/** Resume a paused timer */
	async resumeTimer(): Promise<void> {
		if (!this.timerService.isRunning || !this.timerService.isPaused) {
			new Notice('No paused timer to resume.');
			return;
		}
		await this.timerService.resume();
		this.reminderService.startActiveReminders();
		this.statusBarWidget?.update();
		new Notice('Timer resumed');
	}

	/** Stop the running timer and save the log */
	async stopTimer(): Promise<void> {
		if (!this.timerService.isRunning) {
			new Notice('No timer is running.');
			return;
		}

		// Stop timer first to get the entries
		const entries = await this.timerService.stop();
		this.reminderService.stopActiveReminders();
		this.statusBarWidget?.update();

		if (entries && entries.length > 0) {
			try {
				let totalHours = 0;
				for (const entry of entries) {
					await this.timeEntryService.addEntry(entry);
					totalHours += entry.durationHours ?? 0;
				}
				totalHours = Math.round(totalHours * 100) / 100;

				if (entries.length > 1) {
					new Notice(`Logged ${totalHours}h across ${entries.length} logs (midnight split): ${entries[0].description}`);
				} else {
					new Notice(`Logged ${totalHours}h: ${entries[0].description}`);
				}
			} catch (err) {
				console.error('Time Tracker: Failed to save time log', err);
				const entry = entries[0];
				new Notice(
					`Failed to save time log. Please log manually:\n${entry.startTime}-${entry.endTime} (${entry.durationHours}h) ${entry.description}`,
					15_000
				);
			}
			await this.refreshStatusBar();
		}
	}

	/** Add a manual time log (called from QuickLogModal) */
	async addManualEntry(entry: TimeEntry): Promise<void> {
		await this.timeEntryService.addEntry(entry);
		new Notice(`Logged ${entry.durationHours}h: ${entry.description}`);
		await this.refreshStatusBar();
	}

	/** Refresh the status bar daily total */
	async refreshStatusBar(): Promise<void> {
		await this.statusBarWidget?.refreshDailyTotal();
	}

	/** Navigate to today's daily note */
	async openTodayTimeLog(): Promise<void> {
		const file = await this.dailyNoteIntegration.getOrCreateDailyNote(new Date());
		const leaf = this.app.workspace.getLeaf(false);
		await leaf.openFile(file);
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
