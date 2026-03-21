import { Modal, Setting, TextComponent } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { addCategorySuggest } from './CategorySuggest';

export class TimerModal extends Modal {
	private description = '';
	private category = '';

	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
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

	private submit(): void {
		if (!this.description.trim()) {
			return;
		}
		const cat = this.category.trim() || null;
		this.close();
		this.plugin.startTimer(this.description.trim(), cat);
	}
}
