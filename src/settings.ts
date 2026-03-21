import { App, PluginSettingTab, Setting } from 'obsidian';
import type TimeTrackerPlugin from './main';
import { ReminderMode } from './types';

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
			.setDesc('When enabled and BuJo is installed, time entries are added to BuJo daily notes.')
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
	}
}
