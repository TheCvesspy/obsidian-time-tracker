import { Modal, Setting, TextComponent } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { TimeEntry, WorklogReference } from '../types';
import { addCategorySuggest } from './CategorySuggest';
import { ReferenceSuggestModal } from './ReferenceSuggestModal';
import { formatReferenceForDisplay } from './formatReference';
import { formatDateISO } from '../utils';

export class QuickLogModal extends Modal {
	private date = '';
	private startTime = '';
	private endTime = '';
	private description = '';
	private category = '';
	private reference: WorklogReference | null = null;
	private durationEl: HTMLElement | null = null;
	private referenceDisplayEl: HTMLElement | null = null;

	constructor(
		private plugin: TimeTrackerPlugin,
		prefill?: { date?: string; startTime?: string; endTime?: string; description?: string; category?: string }
	) {
		super(plugin.app);
		// Default date to today
		const now = new Date();
		this.date = prefill?.date ?? formatDateISO(now);
		// Default start time to current hour
		this.startTime = prefill?.startTime ?? `${String(now.getHours()).padStart(2, '0')}:00`;
		if (prefill?.endTime) this.endTime = prefill.endTime;
		if (prefill?.description) this.description = prefill.description;
		if (prefill?.category) this.category = prefill.category;
		// Pre-seed with the last-used reference when enabled.
		if (plugin.settings.rememberLastReference) {
			this.reference = plugin.lastUsedReference ?? null;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Log Work' });

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
				text.setValue(this.endTime)
					.setPlaceholder('HH:MM')
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
				text.setValue(this.description)
					.setPlaceholder('What did you work on?')
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
				text.setValue(this.category)
					.setPlaceholder('Category (optional)')
					.onChange(val => { this.category = val; });
				addCategorySuggest(text, this.plugin.settings.categories, 'time-tracker-cat-quick');
			});

		// Reference field — only exposed when BuJo bridge is available.
		if (this.plugin.bujoBridge.isAvailable()) {
			const refSetting = new Setting(contentEl)
				.setName('Reference')
				.setDesc('Optional Topic or JIRA ticket.');
			this.referenceDisplayEl = refSetting.controlEl.createSpan({
				cls: 'time-tracker-ref-display',
			});
			this.renderReferenceDisplay();

			refSetting.addButton(btn => {
				btn.setButtonText('Pick…')
					.onClick(() => this.openReferencePicker());
			});
			refSetting.addButton(btn => {
				btn.setButtonText('Clear')
					.onClick(() => {
						this.reference = null;
						this.renderReferenceDisplay();
					});
			});
		}

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

	private openReferencePicker(): void {
		new ReferenceSuggestModal(
			this.app,
			this.plugin.bujoBridge,
			(ref) => {
				this.reference = ref;
				this.renderReferenceDisplay();
			},
			{ initial: this.reference, title: 'Attach a reference' }
		).open();
	}

	private renderReferenceDisplay(): void {
		if (!this.referenceDisplayEl) return;
		this.referenceDisplayEl.empty();
		const formatted = formatReferenceForDisplay(this.reference ?? undefined, this.plugin.bujoBridge);
		if (!formatted) {
			this.referenceDisplayEl.addClass('time-tracker-ref-empty');
			this.referenceDisplayEl.setText('none');
			return;
		}
		this.referenceDisplayEl.removeClass('time-tracker-ref-empty');
		this.referenceDisplayEl.setText(formatted.label);
		if (formatted.tooltip) this.referenceDisplayEl.setAttr('title', formatted.tooltip);
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
			...(this.reference ? { reference: this.reference } : {}),
		};

		this.close();
		if (this.reference && this.plugin.settings.rememberLastReference) {
			this.plugin.lastUsedReference = this.reference;
		}
		this.plugin.addManualEntry(entry);
	}

}
