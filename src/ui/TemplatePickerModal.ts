import { SuggestModal } from 'obsidian';
import type TimeTrackerPlugin from '../main';
import { TemplateTask } from '../types';

export class TemplatePickerModal extends SuggestModal<TemplateTask> {
	constructor(private plugin: TimeTrackerPlugin) {
		super(plugin.app);
		this.setPlaceholder('Pick a template task...');
	}

	getSuggestions(query: string): TemplateTask[] {
		const lower = query.toLowerCase();
		return this.plugin.settings.templateTasks.filter(t =>
			t.name.toLowerCase().includes(lower) ||
			t.description.toLowerCase().includes(lower) ||
			t.category.toLowerCase().includes(lower)
		);
	}

	renderSuggestion(task: TemplateTask, el: HTMLElement): void {
		el.createEl('div', { text: task.name, cls: 'suggestion-title' });
		const desc = task.category
			? `${task.category} - ${task.description}`
			: task.description;
		el.createEl('small', { text: desc, cls: 'suggestion-note' });
	}

	onChooseSuggestion(task: TemplateTask): void {
		this.plugin.startTimer(task.description, task.category || null);
	}
}
