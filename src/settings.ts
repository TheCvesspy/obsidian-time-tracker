import { App, PluginSettingTab, Setting } from 'obsidian';
import type TimeTrackerPlugin from './main';
import { ReminderMode, HeatmapColorScheme } from './types';
import { HolidayManagerModal } from './ui/HolidayManagerModal';

export class TimeTrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: TimeTrackerPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── Integration ──
		containerEl.createEl('h3', { text: 'Integration' });

		new Setting(containerEl)
			.setName('Integrate with BuJo plugin')
			.setDesc('When enabled and BuJo is installed, time logs are added to BuJo daily notes.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableBuJoIntegration)
					.onChange(async val => {
						this.plugin.settings.enableBuJoIntegration = val;
						await this.plugin.saveSettings();
						this.display(); // Re-render to show/hide conditional settings
					});
			});

		if (this.plugin.settings.enableBuJoIntegration) {
			new Setting(containerEl)
				.setName('BuJo daily note path override')
				.setDesc('Leave empty to auto-detect from BuJo settings.')
				.addText(text => {
					text.setPlaceholder('Auto-detect')
						.setValue(this.plugin.settings.buJoDailyNotePathOverride)
						.onChange(async val => {
							this.plugin.settings.buJoDailyNotePathOverride = val;
							await this.plugin.saveSettings();
						});
				});

			// ── Reference picker sub-section (only when BuJo integration is enabled) ──
			const bujoAvailable = this.plugin.bujoBridge.isAvailable();
			const jiraEnabled = this.plugin.bujoBridge.isJiraEnabled();

			containerEl.createEl('h4', {
				text: 'Topic / JIRA References',
				cls: 'time-tracker-settings-subheading',
			});
			const statusLine = containerEl.createEl('p', { cls: 'setting-item-description' });
			statusLine.setText(
				bujoAvailable
					? (jiraEnabled
						? 'BuJo detected. JIRA enrichment available.'
						: 'BuJo detected. JIRA enrichment is disabled in BuJo settings — Topics will still work.')
					: 'BuJo plugin not detected. These options take effect once BuJo is active.'
			);

			new Setting(containerEl)
				.setName('Prompt for reference when starting timer')
				.setDesc('Open the picker before the timer starts. A dedicated command that always prompts is also available.')
				.addToggle(toggle => {
					toggle.setValue(this.plugin.settings.bujoPromptOnStart)
						.setDisabled(!bujoAvailable)
						.onChange(async val => {
							this.plugin.settings.bujoPromptOnStart = val;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Prompt for reference when stopping timer')
				.setDesc('If the running timer has no reference yet, open a skippable picker before writing the log.')
				.addToggle(toggle => {
					toggle.setValue(this.plugin.settings.bujoPromptOnStop)
						.setDisabled(!bujoAvailable)
						.onChange(async val => {
							this.plugin.settings.bujoPromptOnStop = val;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Enrich JIRA keys in reports')
				.setDesc('Fetch issue title and status from JIRA via BuJo and show them next to the key. Markdown stores only the raw key.')
				.addToggle(toggle => {
					toggle.setValue(this.plugin.settings.enableJiraEnrichment)
						.setDisabled(!bujoAvailable)
						.onChange(async val => {
							this.plugin.settings.enableJiraEnrichment = val;
							await this.plugin.saveSettings();
						});
				});

			new Setting(containerEl)
				.setName('Remember last-used reference')
				.setDesc('Pre-seed the picker with the most recently chosen Topic/JIRA.')
				.addToggle(toggle => {
					toggle.setValue(this.plugin.settings.rememberLastReference)
						.setDisabled(!bujoAvailable)
						.onChange(async val => {
							this.plugin.settings.rememberLastReference = val;
							await this.plugin.saveSettings();
						});
				});
		}

		new Setting(containerEl)
			.setName('Standalone daily note path')
			.setDesc('Used when BuJo integration is disabled or BuJo is not installed.')
			.addText(text => {
				text.setValue(this.plugin.settings.standaloneDailyNotePath)
					.setPlaceholder('TimeTracking/Daily')
					.onChange(async val => {
						this.plugin.settings.standaloneDailyNotePath = val;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Time log section heading')
			.setDesc('The markdown heading used for the time log section in daily notes.')
			.addText(text => {
				text.setValue(this.plugin.settings.timeLogHeading)
					.setPlaceholder('## Time Log')
					.onChange(async val => {
						this.plugin.settings.timeLogHeading = val;
						await this.plugin.saveSettings();
					});
			});

		// ── Categories ──
		containerEl.createEl('h3', { text: 'Categories' });

		new Setting(containerEl)
			.setName('Project categories')
			.setDesc('Comma-separated list of categories shown as suggestions when logging time.')
			.addTextArea(text => {
				text.setValue(this.plugin.settings.categories.join(', '))
					.setPlaceholder('Deep Work, Meetings, Admin, Review, Learning')
					.onChange(async val => {
						this.plugin.settings.categories = val
							.split(',')
							.map(s => s.trim())
							.filter(s => s.length > 0);
						await this.plugin.saveSettings();
					});
				text.inputEl.rows = 3;
				text.inputEl.style.width = '100%';
			});

		new Setting(containerEl)
			.setName('Allow free-text categories')
			.setDesc('When enabled, you can type any category, not just those in the list above.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.allowFreeTextCategories)
					.onChange(async val => {
						this.plugin.settings.allowFreeTextCategories = val;
						await this.plugin.saveSettings();
					});
			});

		// ── Timer Display ──
		containerEl.createEl('h3', { text: 'Timer Display' });

		new Setting(containerEl)
			.setName('Show status bar widget')
			.setDesc('Display the timer widget in the Obsidian status bar.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.showStatusBar)
					.onChange(async val => {
						this.plugin.settings.showStatusBar = val;
						await this.plugin.saveSettings();
						this.plugin.updateStatusBarVisibility();
					});
			});

		new Setting(containerEl)
			.setName('Show seconds')
			.setDesc('Show seconds in the elapsed time display.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.showSeconds)
					.onChange(async val => {
						this.plugin.settings.showSeconds = val;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Time format')
			.setDesc('Format for displaying times.')
			.addDropdown(dropdown => {
				dropdown.addOption('24h', '24-hour')
					.addOption('12h', '12-hour')
					.setValue(this.plugin.settings.timeFormat)
					.onChange(async val => {
						this.plugin.settings.timeFormat = val as '24h' | '12h';
						await this.plugin.saveSettings();
					});
			});

		// ── Reminders ──
		containerEl.createEl('h3', { text: 'Reminders' });

		containerEl.createEl('h4', {
			text: 'Idle Nudges',
			cls: 'time-tracker-settings-subheading',
		});
		containerEl.createEl('p', {
			text: 'Nudge you to start tracking when no timer is running.',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Enable idle nudges')
			.setDesc('Periodically remind you to track your time when no timer is running.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableIdleReminders)
					.onChange(async val => {
						this.plugin.settings.enableIdleReminders = val;
						await this.plugin.saveSettings();
						this.plugin.reminderService.restartIdleNudges();
						this.display();
					});
			});

		if (this.plugin.settings.enableIdleReminders) {
			new Setting(containerEl)
				.setName('Idle nudge interval (minutes)')
				.setDesc('How often to nudge when no timer is running.')
				.addText(text => {
					text.setValue(String(this.plugin.settings.idleReminderIntervalMinutes))
						.setPlaceholder('30')
						.onChange(async val => {
							const num = parseInt(val);
							if (!isNaN(num) && num > 0) {
								this.plugin.settings.idleReminderIntervalMinutes = num;
								await this.plugin.saveSettings();
								this.plugin.reminderService.restartIdleNudges();
							}
						});
					text.inputEl.type = 'number';
					text.inputEl.min = '1';
					text.inputEl.style.width = '80px';
				});

			new Setting(containerEl)
				.setName('Idle nudge message')
				.setDesc('Message shown when you haven\'t started a timer.')
				.addText(text => {
					text.setValue(this.plugin.settings.idleReminderMessage)
						.setPlaceholder('Are you tracking your time?')
						.onChange(async val => {
							this.plugin.settings.idleReminderMessage = val;
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '100%';
				});
		}

		containerEl.createEl('h4', {
			text: 'Active Timer Reminders',
			cls: 'time-tracker-settings-subheading',
		});
		containerEl.createEl('p', {
			text: 'Reminders while a timer is running (e.g., check-in on progress).',
			cls: 'setting-item-description',
		});

		new Setting(containerEl)
			.setName('Active reminder mode')
			.setDesc('How reminders are triggered while the timer is running.')
			.addDropdown(dropdown => {
				dropdown.addOption(ReminderMode.Off, 'Off')
					.addOption(ReminderMode.Interval, 'Every N minutes')
					.addOption(ReminderMode.Schedule, 'At specific times')
					.setValue(this.plugin.settings.reminderMode)
					.onChange(async val => {
						this.plugin.settings.reminderMode = val as ReminderMode;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.reminderMode === ReminderMode.Interval) {
			new Setting(containerEl)
				.setName('Active reminder interval (minutes)')
				.setDesc('How often to show a reminder while the timer is running.')
				.addText(text => {
					text.setValue(String(this.plugin.settings.reminderIntervalMinutes))
						.setPlaceholder('30')
						.onChange(async val => {
							const num = parseInt(val);
							if (!isNaN(num) && num > 0) {
								this.plugin.settings.reminderIntervalMinutes = num;
								await this.plugin.saveSettings();
							}
						});
					text.inputEl.type = 'number';
					text.inputEl.min = '1';
					text.inputEl.style.width = '80px';
				});
		}

		if (this.plugin.settings.reminderMode === ReminderMode.Schedule) {
			new Setting(containerEl)
				.setName('Scheduled times')
				.setDesc('Comma-separated HH:MM times to show reminders (e.g., 09:00, 12:00, 15:00, 17:00).')
				.addText(text => {
					text.setValue(this.plugin.settings.reminderScheduledTimes.join(', '))
						.setPlaceholder('09:00, 12:00, 15:00, 17:00')
						.onChange(async val => {
							this.plugin.settings.reminderScheduledTimes = val
								.split(',')
								.map(s => s.trim())
								.filter(s => /^\d{1,2}:\d{2}$/.test(s));
							await this.plugin.saveSettings();
						});
					text.inputEl.style.width = '100%';
				});
		}

		new Setting(containerEl)
			.setName('Active reminder message')
			.setDesc('Message template. Use {elapsed} for elapsed time and {task} for task description.')
			.addText(text => {
				text.setValue(this.plugin.settings.reminderMessage)
					.setPlaceholder('Time check: {elapsed} on "{task}"')
					.onChange(async val => {
						this.plugin.settings.reminderMessage = val;
						await this.plugin.saveSettings();
					});
				text.inputEl.style.width = '100%';
			});

		// ── Reports ──
		containerEl.createEl('h3', { text: 'Reports' });

		new Setting(containerEl)
			.setName('Week start day')
			.setDesc('The first day of the week for weekly summaries.')
			.addDropdown(dropdown => {
				const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
				days.forEach((day, i) => dropdown.addOption(String(i), day));
				dropdown.setValue(String(this.plugin.settings.weekStartDay))
					.onChange(async val => {
						this.plugin.settings.weekStartDay = parseInt(val);
						await this.plugin.saveSettings();
					});
			});

		// ── Work Days & Holidays ──
		containerEl.createEl('h3', { text: 'Work Days & Holidays' });

		new Setting(containerEl)
			.setName('Exclude non-working days from statistics')
			.setDesc('Weekends and holidays won\'t break streaks or affect averages in reports.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.excludeNonWorkingDays)
					.onChange(async val => {
						this.plugin.settings.excludeNonWorkingDays = val;
						await this.plugin.saveSettings();
					});
			});

		const holidayCount = this.plugin.settings.holidays.length;
		const currentYear = new Date().getFullYear();
		const thisYearCount = this.plugin.settings.holidays.filter(
			h => h.date.startsWith(`${currentYear}-`)
		).length;

		new Setting(containerEl)
			.setName('Manage holidays')
			.setDesc(`${holidayCount} holiday${holidayCount !== 1 ? 's' : ''} configured (${thisYearCount} for ${currentYear}).`)
			.addButton(btn => {
				btn.setButtonText('Manage Holidays...')
					.onClick(() => {
						new HolidayManagerModal(this.plugin).open();
					});
			});

		// ── Goals ──
		containerEl.createEl('h3', { text: 'Goals' });

		new Setting(containerEl)
			.setName('Enable daily goals')
			.setDesc('Track progress towards a daily time goal.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableGoals)
					.onChange(async val => {
						this.plugin.settings.enableGoals = val;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.enableGoals) {
			new Setting(containerEl)
				.setName('Daily goal (hours)')
				.setDesc('Target number of hours per day.')
				.addText(text => {
					text.setValue(String(this.plugin.settings.dailyGoalHours))
						.setPlaceholder('8')
						.onChange(async val => {
							const num = parseFloat(val);
							if (!isNaN(num) && num > 0) {
								this.plugin.settings.dailyGoalHours = num;
								await this.plugin.saveSettings();
							}
						});
					text.inputEl.type = 'number';
					text.inputEl.min = '0.5';
					text.inputEl.step = '0.5';
					text.inputEl.style.width = '80px';
				});
		}

		// ── Appearance ──
		containerEl.createEl('h3', { text: 'Appearance' });

		new Setting(containerEl)
			.setName('Heatmap color scheme')
			.setDesc('Color scheme for the calendar heatmap visualization.')
			.addDropdown(dropdown => {
				dropdown.addOption('green', 'Green')
					.addOption('blue', 'Blue')
					.addOption('purple', 'Purple')
					.addOption('accent', 'Theme Accent')
					.setValue(this.plugin.settings.heatmapColorScheme)
					.onChange(async val => {
						this.plugin.settings.heatmapColorScheme = val as HeatmapColorScheme;
						await this.plugin.saveSettings();
					});
			});

		// ── Safety nets ──
		containerEl.createEl('h3', { text: 'Safety Nets' });

		new Setting(containerEl)
			.setName('Warn on overlapping entries')
			.setDesc('Show a confirmation when a new or edited log overlaps an existing row on the same date.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.warnOnOverlap)
					.onChange(async val => {
						this.plugin.settings.warnOnOverlap = val;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Detect unlogged time gaps')
			.setDesc('When starting a timer after a break, suggest logging the missed time. Also surfaces gaps in the Daily Summary.')
			.addToggle(toggle => {
				toggle.setValue(this.plugin.settings.enableGapDetection)
					.onChange(async val => {
						this.plugin.settings.enableGapDetection = val;
						await this.plugin.saveSettings();
						this.display();
					});
			});

		if (this.plugin.settings.enableGapDetection) {
			new Setting(containerEl)
				.setName('Minimum gap (minutes)')
				.setDesc('Gaps shorter than this are ignored. Avoids flagging normal 2–3 min context switches.')
				.addText(text => {
					text.setValue(String(this.plugin.settings.gapDetectionMinutes))
						.setPlaceholder('15')
						.onChange(async val => {
							const n = parseInt(val);
							if (!isNaN(n) && n > 0) {
								this.plugin.settings.gapDetectionMinutes = n;
								await this.plugin.saveSettings();
							}
						});
					text.inputEl.type = 'number';
					text.inputEl.min = '1';
					text.inputEl.style.width = '80px';
				});
		}

		// ── Time Rounding ──
		containerEl.createEl('h3', { text: 'Time Rounding' });

		new Setting(containerEl)
			.setName('Rounding mode')
			.setDesc('Round end times to the nearest interval when editing time logs.')
			.addDropdown(dropdown => {
				dropdown.addOption('none', 'None')
					.addOption('5min', '5 minutes')
					.addOption('15min', '15 minutes')
					.addOption('30min', '30 minutes')
					.setValue(this.plugin.settings.roundingMode)
					.onChange(async val => {
						this.plugin.settings.roundingMode = val;
						await this.plugin.saveSettings();
					});
			});

		// ── Template Tasks ──
		containerEl.createEl('h3', { text: 'Template Tasks' });

		new Setting(containerEl)
			.setName('Quick-start templates')
			.setDesc('JSON array of template tasks. Each: {"name":"Label","description":"Task","category":"Cat"}')
			.addTextArea(text => {
				text.setValue(JSON.stringify(this.plugin.settings.templateTasks, null, 2) || '[]')
					.setPlaceholder('[{"name":"Standup","description":"Daily standup","category":"Meetings"}]')
					.onChange(async val => {
						try {
							const parsed = JSON.parse(val);
							if (Array.isArray(parsed)) {
								this.plugin.settings.templateTasks = parsed;
								await this.plugin.saveSettings();
							}
						} catch {
							// Invalid JSON — ignore until valid
						}
					});
				text.inputEl.rows = 5;
				text.inputEl.style.width = '100%';
				text.inputEl.style.fontFamily = 'monospace';
			});
	}
}
