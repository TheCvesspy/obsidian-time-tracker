import { Modal, Setting, TextComponent } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { WorklogReference } from '../types';
import { addCategorySuggest } from './CategorySuggest';
import { ReferenceSuggestModal } from './ReferenceSuggestModal';
import { formatReferenceForDisplay } from './formatReference';

export class TimerModal extends Modal {
	private description = '';
	private category = '';
	private reference: WorklogReference | null = null;
	private referenceDisplayEl: HTMLElement | null = null;

	constructor(private plugin: TimeTrackerPlugin, initialReference?: WorklogReference | null) {
		super(plugin.app);
		if (initialReference !== undefined) {
			this.reference = initialReference;
		} else if (plugin.settings.rememberLastReference) {
			this.reference = plugin.lastUsedReference ?? null;
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Start Timer' });

		let descInput: TextComponent;

		new Setting(contentEl)
			.setName('Task description')
			.addText(text => {
				descInput = text;
				text.setPlaceholder('What are you working on?')
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
			.setDesc('Select or type a category')
			.addText(text => {
				text.setPlaceholder('Category (optional)')
					.onChange(val => { this.category = val; });
				addCategorySuggest(text, this.plugin.settings.categories, 'time-tracker-cat-timer');
				text.inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						this.submit();
					}
				});
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
				btn.setButtonText('Start Timer')
					.setCta()
					.onClick(() => this.submit());
			});

		// Auto-focus the description input
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

	private submit(): void {
		if (!this.description.trim()) {
			return;
		}
		const cat = this.category.trim() || null;
		this.close();
		if (this.reference && this.plugin.settings.rememberLastReference) {
			this.plugin.lastUsedReference = this.reference;
		}
		this.plugin.startTimer(this.description.trim(), cat, this.reference);
	}
}
