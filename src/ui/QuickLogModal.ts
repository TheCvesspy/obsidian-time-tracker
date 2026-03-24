import { Modal, Setting, TextComponent } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { TimeEntry } from '../types';
import { addCategorySuggest } from './CategorySuggest';
import { formatDateISO } from '../utils';

export class QuickLogModal extends Modal {
	private date = '';
	private startTime = '';
	private endTime = '';
	private description = '';
	private category = '';
	private durationEl: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		// Default date to today
		const now = new Date();
		this.date = formatDateISO(now);
		// Default start time to current hour
		this.startTime = `${String(now.getHours()).padStart(2, '0')}:00`;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Log Time' });

		new Setting(contentEl)
			.setName('Date')
			.addText(text => {
				text.setValue(this.date)
					.setPlaceholder('YYYY-MM-DD')
					.onChange(val => { this.date = val; });
				text.inputEl.type = 'date';
			});

		new Setting(contentEl)
			.setName('Start time')
			.addText(text => {
				text.setValue(this.startTime)
					.setPlaceholder('HH:MM')
					.onChange(val => {
						this.startTime = val;
						this.updateDuration();
					});
				text.inputEl.type = 'time';
			});

		new Setting(contentEl)
			.setName('End time')
			.addText(text => {
				text.setPlaceholder('HH:MM')
					.onChange(val => {
						this.endTime = val;
						this.updateDuration();
					});
				text.inputEl.type = 'time';
			});

		// Duration display
		const durationSetting = new Setting(contentEl)
			.setName('Duration');
		this.durationEl = durationSetting.controlEl.createSpan({
			cls: 'time-tracker-duration-display',
			text: '-',
		});

		let descInput: TextComponent;

		new Setting(contentEl)
			.setName('Description')
			.addText(text => {
				descInput = text;
				text.setPlaceholder('What did you work on?')
					.onChange(val => { this.description = val; });
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
			});

		new Setting(contentEl)
			.setName('Category')
			.addText(text => {
				text.setPlaceholder('Category (optional)')
					.onChange(val => { this.category = val; });
				addCategorySuggest(text, this.plugin.settings.categories, 'time-tracker-cat-quick');
			});

		new Setting(contentEl)
			.addButton(btn => {
				btn.setButtonText('Save')
					.setCta()
					.onClick(() => this.submit());
			});

		setTimeout(() => descInput!.inputEl.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private updateDuration(): void {
		if (!this.durationEl || !this.startTime || !this.endTime) {
			if (this.durationEl) this.durationEl.textContent = '-';
			return;
		}

		const hours = this.computeDuration(this.startTime, this.endTime);
		if (hours !== null && hours > 0) {
			this.durationEl.textContent = `${Math.round(hours * 100) / 100}h`;
		} else {
			this.durationEl.textContent = '-';
		}
	}

	private computeDuration(start: string, end: string): number | null {
		const [sh, sm] = start.split(':').map(Number);
		const [eh, em] = end.split(':').map(Number);
		if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return null;

		const startMin = sh * 60 + sm;
		const endMin = eh * 60 + em;
		if (endMin <= startMin) return null;

		return (endMin - startMin) / 60;
	}

	private submit(): void {
		if (!this.description.trim() || !this.startTime || !this.endTime || !this.date) {
			return;
		}

		const durationHours = this.computeDuration(this.startTime, this.endTime);
		if (!durationHours || durationHours <= 0) return;

		const entry: TimeEntry = {
			id: `${this.date}:${this.startTime}`,
			date: this.date,
			startTime: this.startTime,
			endTime: this.endTime,
			durationHours: Math.round(durationHours * 100) / 100,
			description: this.description.trim(),
			category: this.category.trim() || null,
		};

		this.close();
		this.plugin.addManualEntry(entry);
	}

}
