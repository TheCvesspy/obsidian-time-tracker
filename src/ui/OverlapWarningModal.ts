import { App, Modal, Setting } from 'obsidian';
import { TimeEntry } from '../types';

/**
 * Confirmation dialog shown when a new or edited entry overlaps existing rows
 * on the same date. Resolves the promise with `true` when the user confirms,
 * `false` when they cancel or dismiss the modal.
 */
export class OverlapWarningModal extends Modal {
	private decided = false;

	constructor(
		app: App,
		private candidate: TimeEntry,
		private overlaps: TimeEntry[],
		private onDecide: (proceed: boolean) => void
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass('time-tracker-modal');
		contentEl.createEl('h3', { text: 'Overlapping time log' });

		contentEl.createEl('p', {
			text: `Your ${this.candidate.startTime}–${this.candidate.endTime} entry overlaps with ${this.overlaps.length === 1 ? 'another log' : `${this.overlaps.length} other logs`}:`,
		});

		const list = contentEl.createEl('ul', { cls: 'time-tracker-overlap-list' });
		for (const other of this.overlaps) {
			const label = other.category
				? `${other.startTime}–${other.endTime}  ·  ${other.category} – ${other.description}`
				: `${other.startTime}–${other.endTime}  ·  ${other.description}`;
			list.createEl('li', { text: label });
		}

		contentEl.createEl('p', {
			cls: 'setting-item-description',
			text: 'Saving will keep both rows — the table will show overlapping time. Cancel to adjust the times first.',
		});

		const row = new Setting(contentEl);
		row.addButton(btn => {
			btn.setButtonText('Save anyway')
				.setWarning()
				.onClick(() => this.decide(true));
		});
		row.addButton(btn => {
			btn.setButtonText('Cancel')
				.setCta()
				.onClick(() => this.decide(false));
		});
	}

	onClose(): void {
		this.contentEl.empty();
		// If the user dismissed the modal without clicking either button,
		// treat that as a cancel — never silently save on dismissal.
		if (!this.decided) this.onDecide(false);
	}

	private decide(proceed: boolean): void {
		this.decided = true;
		this.onDecide(proceed);
		this.close();
	}
}
