import { App, FuzzyMatch, FuzzySuggestModal, setIcon, prepareFuzzySearch } from 'obsidian';
import { BuJoBridge, TopicSummary, JiraDisplay } from '../services/BuJoBridge';
import { WorklogReference } from '../types';
import { JIRA_KEY_REGEX } from '../constants';

/** An item in the unified Topic + JIRA picker. */
export type ReferenceItem =
	| { kind: 'none' }
	| { kind: 'topic'; topic: TopicSummary }
	| { kind: 'jira'; key: string; display: JiraDisplay }
	| { kind: 'freeform'; key: string };

export interface ReferenceSuggestOptions {
	/** Pre-seeded reference to recall on open (not used for result selection). */
	initial?: WorklogReference | null;
	/** If true, show a "Skip" action that returns `null`. */
	skippable?: boolean;
	/** Header text shown above the suggestions (e.g. "Attach to timer"). */
	title?: string;
}

/**
 * Unified fuzzy picker for Topics + JIRA keys + free-form JIRA input. Returns
 * the chosen WorklogReference (or null when the user picks "no reference"
 * / presses Escape in skippable mode).
 */
export class ReferenceSuggestModal extends FuzzySuggestModal<ReferenceItem> {
	private topics: TopicSummary[] = [];
	private jiraKeys: string[] = [];
	private readyDispose: (() => void) | null = null;
	private submitted = false;

	constructor(
		app: App,
		private bridge: BuJoBridge,
		private onChoose: (ref: WorklogReference | null) => void,
		private options: ReferenceSuggestOptions = {}
	) {
		super(app);
		this.setPlaceholder(
			this.options.skippable
				? 'Pick a Topic or JIRA key — or press Esc to skip'
				: 'Pick a Topic or JIRA key'
		);
	}

	async onOpen(): Promise<void> {
		super.onOpen();

		// Render the header title (if provided) above the input.
		if (this.options.title) {
			const header = this.modalEl.createDiv({ cls: 'time-tracker-ref-picker-title' });
			header.setText(this.options.title);
			this.modalEl.insertBefore(header, this.modalEl.firstChild);
		}

		// Skip button for flows that should write a row even without a reference.
		if (this.options.skippable) {
			const footer = this.modalEl.createDiv({ cls: 'time-tracker-ref-picker-footer' });
			const skipBtn = footer.createEl('button', { text: 'Skip', cls: 'mod-cta-secondary' });
			skipBtn.addEventListener('click', () => {
				this.submitted = true;
				this.onChoose(null);
				this.close();
			});
		}

		// Load topics + JIRA keys. Kick off JIRA prefetch so titles stream in.
		this.topics = await this.bridge.getTopics();
		this.jiraKeys = await this.bridge.getAggregatedJiraKeys();
		void this.bridge.prefetchJira(this.jiraKeys);

		// Re-render suggestions when the JIRA cache fills in.
		this.readyDispose = this.bridge.onReady(() => {
			// Refresh displayed JIRA titles.
			this.inputEl.dispatchEvent(new Event('input'));
		});

		// Trigger initial render.
		this.inputEl.dispatchEvent(new Event('input'));
	}

	onClose(): void {
		super.onClose();
		if (this.readyDispose) {
			this.readyDispose();
			this.readyDispose = null;
		}
		// If the modal closed without a selection (e.g. Esc in skippable mode),
		// treat it as "no reference chosen". Non-skippable mode leaves state untouched.
		if (!this.submitted && this.options.skippable) {
			this.onChoose(null);
		}
	}

	getItems(): ReferenceItem[] {
		const items: ReferenceItem[] = [{ kind: 'none' }];
		for (const t of this.topics) {
			items.push({ kind: 'topic', topic: t });
		}
		for (const k of this.jiraKeys) {
			items.push({ kind: 'jira', key: k, display: this.bridge.getJiraDisplay(k) });
		}
		return items;
	}

	getItemText(item: ReferenceItem): string {
		switch (item.kind) {
			case 'none': return '— no reference';
			case 'topic': return `${item.topic.title} ${item.topic.jira.join(' ')}`;
			case 'jira': {
				const d = this.bridge.getJiraDisplay(item.key);
				return `${item.key} ${d.title ?? ''}`;
			}
			case 'freeform': return item.key;
		}
	}

	/**
	 * Extend the default fuzzy-match set with a synthetic "free-form" entry when the
	 * query is a valid JIRA key absent from the aggregated list — so the user can
	 * always attach a ticket that isn't yet referenced by any Topic.
	 */
	getSuggestions(query: string): FuzzyMatch<ReferenceItem>[] {
		const base = super.getSuggestions(query);
		const trimmed = query.trim().toUpperCase();
		if (JIRA_KEY_REGEX.test(trimmed) && !this.jiraKeys.includes(trimmed)) {
			const prepared = prepareFuzzySearch(query);
			const syntheticText = `${trimmed} (use as reference)`;
			const match = prepared(syntheticText) ?? { score: 0, matches: [] };
			const synthetic: FuzzyMatch<ReferenceItem> = {
				item: { kind: 'freeform', key: trimmed },
				match,
			};
			return [synthetic, ...base];
		}
		return base;
	}

	renderSuggestion(match: FuzzyMatch<ReferenceItem>, el: HTMLElement): void {
		el.addClass('time-tracker-ref-suggestion');
		const icon = el.createSpan({ cls: 'time-tracker-ref-icon' });
		const body = el.createDiv({ cls: 'time-tracker-ref-body' });
		const titleEl = body.createDiv({ cls: 'time-tracker-ref-title' });
		const subEl = body.createDiv({ cls: 'time-tracker-ref-subtitle' });

		const item = match.item;
		switch (item.kind) {
			case 'none':
				setIcon(icon, 'circle-slash');
				titleEl.setText('— no reference');
				subEl.setText('Leave this log untagged');
				break;
			case 'topic':
				setIcon(icon, 'bookmark');
				titleEl.setText(item.topic.title);
				subEl.setText(this.topicSubtitle(item.topic));
				break;
			case 'jira': {
				setIcon(icon, 'ticket');
				const d = this.bridge.getJiraDisplay(item.key);
				titleEl.setText(d.title ? `${item.key} — ${d.title}` : item.key);
				subEl.setText(d.status ?? (d.loaded ? 'JIRA' : 'loading…'));
				break;
			}
			case 'freeform':
				setIcon(icon, 'plus-circle');
				titleEl.setText(`${item.key}`);
				subEl.setText('Use this JIRA key as the reference');
				break;
		}
	}

	onChooseItem(item: ReferenceItem): void {
		this.submitted = true;
		switch (item.kind) {
			case 'none':
				this.onChoose(null);
				break;
			case 'topic':
				this.onChoose({ kind: 'topic', value: item.topic.title, topicPath: item.topic.filePath });
				break;
			case 'jira':
			case 'freeform':
				this.onChoose({ kind: 'jira', value: item.key.toUpperCase() });
				break;
		}
	}

	private topicSubtitle(topic: TopicSummary): string {
		const parts: string[] = [];
		if (topic.status) parts.push(topic.status);
		if (topic.jira.length > 0) {
			parts.push(topic.jira.slice(0, 3).join(', ') + (topic.jira.length > 3 ? '…' : ''));
		}
		return parts.join(' · ');
	}
}
