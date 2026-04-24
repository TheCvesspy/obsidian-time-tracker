import { App } from 'obsidian';
import { TimeEntry, WorklogReference } from '../types';
import { BuJoBridge } from '../services/BuJoBridge';

/**
 * Result of rendering a reference for display — the shape that view code uses
 * to build a link/pill element.
 */
export interface FormattedReference {
	/** Main label shown to the user (e.g. `PROJ-123 — Fix login bug` or topic title). */
	label: string;
	/** Optional hover text (e.g. JIRA status, topic file path). */
	tooltip?: string;
	/** Topic file path for Obsidian's openLinkText, when the reference is a Topic. */
	topicLink?: string;
	/** Raw JIRA key when the reference is a JIRA issue (useful for styling a chip). */
	jiraKey?: string;
	/** Current JIRA status (e.g. "In Progress"), when enrichment is loaded. */
	status?: string;
}

/**
 * Produce a displayable representation of a WorklogReference. Falls back
 * cleanly when enrichment is disabled, BuJo is unavailable, or the JIRA cache
 * hasn't resolved yet.
 */
export function formatReferenceForDisplay(
	ref: WorklogReference | undefined,
	bridge: BuJoBridge
): FormattedReference | null {
	if (!ref) return null;

	if (ref.kind === 'topic') {
		return {
			label: ref.value,
			tooltip: ref.topicPath,
			topicLink: ref.topicPath ?? ref.value,
		};
	}

	// JIRA reference — consult the bridge for an enriched label.
	const key = ref.value;
	const display = bridge.getJiraDisplay(key);
	if (display.title) {
		return {
			label: `${key} — ${display.title}`,
			tooltip: display.status ?? undefined,
			jiraKey: key,
			status: display.status ?? undefined,
		};
	}
	return {
		label: key,
		tooltip: display.loaded ? undefined : 'Loading JIRA details…',
		jiraKey: key,
	};
}

/**
 * Render a formatted reference into an HTMLElement as a compact pill. Clicking
 * a topic reference opens the topic file via Obsidian's link handler.
 */
export function renderReferencePill(
	parent: HTMLElement,
	ref: WorklogReference | undefined,
	bridge: BuJoBridge,
	app: App
): HTMLElement {
	const formatted = formatReferenceForDisplay(ref, bridge);
	const pill = parent.createSpan({ cls: 'time-tracker-ref-pill' });
	if (!formatted) {
		pill.addClass('time-tracker-ref-empty');
		pill.setText('—');
		return pill;
	}

	if (formatted.topicLink) {
		pill.addClass('time-tracker-ref-topic');
		const link = pill.createEl('a', { text: formatted.label, cls: 'internal-link' });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			app.workspace.openLinkText(formatted.topicLink!, '', false);
		});
	} else {
		pill.addClass('time-tracker-ref-jira');
		pill.setText(formatted.label);
	}

	if (formatted.tooltip) pill.setAttr('title', formatted.tooltip);
	if (formatted.status) {
		pill.createSpan({
			cls: 'time-tracker-ref-status',
			text: formatted.status,
		});
	}
	return pill;
}

/** A single row in a Topic/JIRA rollup. */
export interface ReferenceRollupEntry {
	/** Canonical reference used as the dedup key. */
	reference: WorklogReference;
	/** Total hours across all entries that carried this reference. */
	hours: number;
}

/**
 * Group entries by their `reference` and sum durations. Entries without a
 * reference are omitted. Results are sorted by total hours descending.
 */
export function aggregateByReference(entries: TimeEntry[]): ReferenceRollupEntry[] {
	const buckets = new Map<string, ReferenceRollupEntry>();
	for (const entry of entries) {
		const ref = entry.reference;
		if (!ref) continue;
		const key = `${ref.kind}:${ref.value.toUpperCase()}`;
		const existing = buckets.get(key);
		const hours = entry.durationHours ?? 0;
		if (existing) {
			existing.hours += hours;
		} else {
			buckets.set(key, { reference: ref, hours });
		}
	}
	return [...buckets.values()].sort((a, b) => b.hours - a.hours);
}

