import { Modal, Setting, TextComponent } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { TimeEntry, WorklogReference } from '../types';
import { addCategorySuggest } from './CategorySuggest';
import { ReferenceSuggestModal } from './ReferenceSuggestModal';
import { formatReferenceForDisplay, renderReferencePill } from './formatReference';
import { formatDateISO, roundEndTime, notify } from '../utils';

/**
 * Two-phase modal:
 *  1. Show entries for a selected date as a selectable list
 *  2. Once an entry is selected, show an edit form
 */
export class EditEntryModal extends Modal {
	private entries: TimeEntry[] = [];
	private selectedEntry: TimeEntry | null = null;
	private date: string;

	// Edit form state
	private startTime = '';
	private endTime = '';
	private description = '';
	private category = '';
	private reference: WorklogReference | null = null;
	private durationEl: HTMLElement | null = null;
	private referenceDisplayEl: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.date = formatDateISO(new Date());
	}

	async onOpen(): Promise<void> {
		await this.renderDateView();
	}

	private async renderDateView(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Edit Time Log' });

		new Setting(contentEl)
			.setName('Date')
			.addText(text => {
				text.setValue(this.date)
					.setPlaceholder('YYYY-MM-DD')
					.onChange(async val => {
						this.date = val;
						await this.loadEntries();
					});
				text.inputEl.type = 'date';
			});

		await this.loadEntries();
	}

	private async loadEntries(): Promise<void> {
		this.entries = await this.plugin.timeEntryService.getEntriesForDate(this.date);

		// Remove old entry list if present, keep the header and date picker
		const { contentEl } = this;
		const oldList = contentEl.querySelector('.time-tracker-entry-list');
		if (oldList) oldList.remove();
		const oldEmpty = contentEl.querySelector('.time-tracker-no-entries');
		if (oldEmpty) oldEmpty.remove();

		if (this.entries.length === 0) {
			contentEl.createEl('p', { text: 'No time logs for this date.', cls: 'time-tracker-no-entries' });
			return;
		}

		this.renderEntryList();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderEntryList(): void {
		const { contentEl } = this;
		const listEl = contentEl.createDiv({ cls: 'time-tracker-entry-list' });

		for (const entry of this.entries) {
			const row = listEl.createDiv({ cls: 'time-tracker-log-row' });

			const main = row.createDiv({ cls: 'time-tracker-log-main' });

			const header = main.createDiv({ cls: 'time-tracker-log-header' });
			header.createSpan({
				cls: 'time-tracker-log-time',
				text: `${entry.startTime} – ${entry.endTime}`,
			});
			header.createSpan({
				cls: 'time-tracker-log-duration',
				text: `${entry.durationHours}h`,
			});

			const desc = main.createDiv({ cls: 'time-tracker-log-desc' });
			if (entry.category) {
				desc.createSpan({ cls: 'time-tracker-log-category', text: entry.category });
				desc.appendText(' · ');
			}
			desc.appendText(entry.description);

			if (entry.reference) {
				const refWrap = main.createDiv({ cls: 'time-tracker-log-ref' });
				renderReferencePill(refWrap, entry.reference, this.plugin.bujoBridge, this.app);
			}

			const actions = row.createDiv({ cls: 'time-tracker-log-actions' });
			const editBtn = actions.createEl('button', {
				text: 'Edit',
				cls: 'time-tracker-log-btn',
			});
			editBtn.addEventListener('click', () => this.showEditForm(entry));

			const deleteBtn = actions.createEl('button', {
				text: 'Delete',
				cls: 'time-tracker-log-btn mod-warning',
			});
			deleteBtn.addEventListener('click', () => this.confirmDelete(entry));
		}
	}

	private showEditForm(entry: TimeEntry): void {
		this.selectedEntry = entry;
		this.startTime = entry.startTime;
		this.endTime = entry.endTime ?? '';
		this.description = entry.description;
		this.category = entry.category ?? '';
		this.reference = entry.reference ?? null;

		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Edit Time Log' });

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
		const durationSetting = new Setting(contentEl).setName('Duration');
		this.durationEl = durationSetting.controlEl.createSpan({
			cls: 'time-tracker-duration-display',
		});
		this.updateDuration();

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
						this.submitEdit();
					}
				});
			});

		new Setting(contentEl)
			.setName('Category')
			.addText(text => {
				text.setValue(this.category)
					.setPlaceholder('Category (optional)')
					.onChange(val => { this.category = val; });
				addCategorySuggest(text, this.plugin.settings.categories, 'time-tracker-cat-edit');
			});

		// Reference field — only when BuJo bridge is available; editing preserves
		// any existing reference even when BuJo is currently disabled.
		if (this.plugin.bujoBridge.isAvailable() || this.reference) {
			const refSetting = new Setting(contentEl)
				.setName('Reference')
				.setDesc('Optional Topic or JIRA ticket.');
			this.referenceDisplayEl = refSetting.controlEl.createSpan({
				cls: 'time-tracker-ref-display',
			});
			this.renderReferenceDisplay();

			if (this.plugin.bujoBridge.isAvailable()) {
				refSetting.addButton(btn => {
					btn.setButtonText('Pick…')
						.onClick(() => this.openReferencePicker());
				});
			}
			refSetting.addButton(btn => {
				btn.setButtonText('Clear')
					.onClick(() => {
						this.reference = null;
						this.renderReferenceDisplay();
					});
			});
		}

		const btnRow = new Setting(contentEl);
		btnRow.addButton(btn => {
			btn.setButtonText('Save')
				.setCta()
				.onClick(() => this.submitEdit());
		});
		btnRow.addButton(btn => {
			btn.setButtonText('Cancel')
				.onClick(() => this.close());
		});

		setTimeout(() => descInput!.inputEl.focus(), 50);
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
			const rounded = roundEndTime(this.startTime, this.endTime, this.plugin.settings.roundingMode);
			this.durationEl.textContent = `${rounded.durationHours}h`;
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

	private async submitEdit(): Promise<void> {
		if (!this.selectedEntry || !this.description.trim() || !this.startTime || !this.endTime) return;

		const durationHours = this.computeDuration(this.startTime, this.endTime);
		if (!durationHours || durationHours <= 0) return;

		const rounded = roundEndTime(this.startTime, this.endTime, this.plugin.settings.roundingMode);

		const updated: TimeEntry = {
			id: `${this.selectedEntry.date}:${this.startTime}`,
			date: this.selectedEntry.date,
			startTime: this.startTime,
			endTime: rounded.endTime,
			durationHours: rounded.durationHours,
			description: this.description.trim(),
			category: this.category.trim() || null,
			...(this.reference ? { reference: this.reference } : {}),
		};

		// Overlap check — exclude the row being edited so it doesn't match itself.
		if (!await this.plugin.confirmNoOverlaps(updated, this.selectedEntry.startTime)) {
			return; // user cancelled; keep the edit form open so they can adjust times
		}

		this.close();
		await this.plugin.timeEntryService.updateEntry(
			this.selectedEntry.date,
			this.selectedEntry.startTime,
			updated
		);
		this.plugin.refreshStatusBar();
		notify(`Updated log: ${updated.durationHours}h - ${updated.description}`, 'success');
	}

	private async confirmDelete(entry: TimeEntry): Promise<void> {
		const label = entry.category
			? `${entry.category} - ${entry.description}`
			: entry.description;

		// Show a simple confirmation by replacing the list with a confirm prompt
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Delete Time Log' });
		contentEl.createEl('p', {
			text: `Are you sure you want to delete "${label}" (${entry.startTime} - ${entry.endTime})?`,
		});

		const btnRow = new Setting(contentEl);
		btnRow.addButton(btn => {
			btn.setButtonText('Delete')
				.setWarning()
				.onClick(async () => {
					this.close();
					await this.plugin.timeEntryService.deleteEntry(entry.date, entry.startTime);
					this.plugin.refreshStatusBar();
					notify(`Deleted log: ${label}`, 'success');
				});
		});
		btnRow.addButton(btn => {
			btn.setButtonText('Cancel')
				.onClick(() => this.renderDateView());
		});
	}
}
