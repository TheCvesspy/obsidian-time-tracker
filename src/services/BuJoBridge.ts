import { App, TFile, EventRef } from 'obsidian';
import { PluginSettings } from '../types';
import { BUJO_PLUGIN_ID, JIRA_KEY_REGEX } from '../constants';

/** Summary of a BuJo Topic, normalised for Time Tracker use. */
export interface TopicSummary {
	title: string;
	filePath: string;
	status?: string;
	jira: string[];
	priority?: string;
}

/** JIRA enrichment snapshot sourced from BuJo's JiraService cache. */
export interface JiraDisplay {
	key: string;
	title: string | null;
	status: string | null;
	/** True if the cache already has a resolved value; false means request is pending. */
	loaded: boolean;
}

/**
 * Loosely-typed shape of the BuJo plugin instance. We intentionally avoid importing
 * concrete types from the sibling plugin to keep the two repos independent.
 */
interface BuJoPluginLike {
	settings?: {
		sprintTopicsPath?: string;
		dailyNotePath?: string;
		jiraEnabled?: boolean;
	};
	scanner?: {
		getAllTopics?: () => TopicSummary[] | unknown[];
	};
	jiraService?: {
		isEnabled?: () => boolean;
		getCached?: (key: string) => { summary?: string; status?: string } | null;
		ensureFetched?: (key: string) => Promise<unknown>;
		prefetchMany?: (keys: string[]) => Promise<void>;
		on?: (listener: () => void) => void;
		off?: (listener: () => void) => void;
	};
}

/**
 * Thin bridge that lets the Time Tracker plugin read BuJo state without a
 * direct code dependency. Every lookup is lazy and tolerates BuJo being
 * absent, disabled, or at a slightly different version than expected.
 */
export class BuJoBridge {
	private readyListeners = new Set<() => void>();
	private jiraListener: (() => void) | null = null;
	private jiraSubscribedOn: BuJoPluginLike['jiraService'] | null = null;
	private layoutChangeRef: EventRef | null = null;

	constructor(
		private app: App,
		private getSettings: () => PluginSettings
	) {
		// Re-fire ready listeners when plugins toggle on/off so UIs can refresh.
		this.layoutChangeRef = this.app.workspace.on('layout-change', () => {
			this.fireReady();
			this.ensureJiraSubscription();
		});
		this.ensureJiraSubscription();
	}

	dispose(): void {
		if (this.layoutChangeRef) {
			this.app.workspace.offref(this.layoutChangeRef);
			this.layoutChangeRef = null;
		}
		if (this.jiraSubscribedOn && this.jiraListener && this.jiraSubscribedOn.off) {
			try { this.jiraSubscribedOn.off(this.jiraListener); } catch { /* ignore */ }
		}
		this.jiraSubscribedOn = null;
		this.jiraListener = null;
		this.readyListeners.clear();
	}

	/** True only when BuJo is installed, enabled, and integration is turned on. */
	isAvailable(): boolean {
		if (!this.getSettings().enableBuJoIntegration) return false;
		return this.getPlugin() != null;
	}

	/** Raw BuJo plugin instance (or null). Callers should duck-type defensively. */
	getPlugin(): BuJoPluginLike | null {
		const plugins = (this.app as unknown as { plugins?: { getPlugin?: (id: string) => unknown } }).plugins;
		const plugin = plugins?.getPlugin?.(BUJO_PLUGIN_ID) as BuJoPluginLike | undefined;
		return plugin ?? null;
	}

	/** True when BuJo's JIRA integration is configured and turned on. */
	isJiraEnabled(): boolean {
		const plugin = this.getPlugin();
		try {
			return !!plugin?.jiraService?.isEnabled?.();
		} catch {
			return false;
		}
	}

	/**
	 * Return all Topics known to BuJo, normalised to `TopicSummary`.
	 * Primary path: duck-type on `plugin.scanner.getAllTopics()`.
	 * Fallback: scan the topics folder and read frontmatter via the metadata cache.
	 */
	async getTopics(): Promise<TopicSummary[]> {
		const plugin = this.getPlugin();
		if (!plugin) return [];

		// Primary: scanner (private but duck-typeable)
		try {
			const raw = plugin.scanner?.getAllTopics?.();
			if (Array.isArray(raw) && raw.length > 0) {
				return raw.map(t => this.normaliseTopic(t as Record<string, unknown>)).filter(t => !!t.title);
			}
		} catch {
			// fall through to filesystem scan
		}

		// Fallback: read topic markdown files from the configured folder.
		const root = (plugin.settings?.sprintTopicsPath ?? 'BuJo/Sprints/Topics').replace(/\/+$/, '');
		const files = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(root + '/') || f.path === root + '.md');
		const topics: TopicSummary[] = [];
		for (const file of files) {
			const topic = this.parseTopicFromFile(file);
			if (topic && topic.title) topics.push(topic);
		}
		return topics;
	}

	/** Union of JIRA keys across all topics, deduplicated, preserving first-seen order. */
	async getAggregatedJiraKeys(): Promise<string[]> {
		const topics = await this.getTopics();
		const seen = new Set<string>();
		const ordered: string[] = [];
		for (const t of topics) {
			for (const k of t.jira) {
				const up = k.toUpperCase();
				if (!seen.has(up) && JIRA_KEY_REGEX.test(up)) {
					seen.add(up);
					ordered.push(up);
				}
			}
		}
		return ordered;
	}

	/**
	 * Non-blocking read of the JIRA cache plus a fire-and-forget refresh.
	 * Subscribe via `onReady` to re-render when the value arrives.
	 */
	getJiraDisplay(key: string): JiraDisplay {
		const upper = key.toUpperCase();
		if (!this.getSettings().enableJiraEnrichment) {
			return { key: upper, title: null, status: null, loaded: false };
		}
		const svc = this.getPlugin()?.jiraService;
		if (!svc) return { key: upper, title: null, status: null, loaded: false };

		let cached: { summary?: string; status?: string } | null = null;
		try { cached = svc.getCached?.(upper) ?? null; } catch { cached = null; }

		if (!cached && svc.ensureFetched) {
			// Fire and forget — the JiraService will notify via `on(...)` when done.
			Promise.resolve(svc.ensureFetched(upper)).catch(() => { /* swallow */ });
		}

		return {
			key: upper,
			title: cached?.summary ?? null,
			status: cached?.status ?? null,
			loaded: cached != null,
		};
	}

	/** Warm BuJo's JIRA cache for a batch of keys (used when opening the picker). */
	async prefetchJira(keys: string[]): Promise<void> {
		if (!this.getSettings().enableJiraEnrichment) return;
		const svc = this.getPlugin()?.jiraService;
		if (!svc?.prefetchMany) return;
		try {
			await svc.prefetchMany(keys.filter(k => JIRA_KEY_REGEX.test(k)));
		} catch {
			/* swallow */
		}
	}

	/** Subscribe to `bridge-ready` events (BuJo enabled/disabled, JIRA cache updated). */
	onReady(cb: () => void): () => void {
		this.readyListeners.add(cb);
		return () => { this.readyListeners.delete(cb); };
	}

	// ── internals ──────────────────────────────────────────────────────

	private fireReady(): void {
		for (const cb of this.readyListeners) {
			try { cb(); } catch { /* swallow */ }
		}
	}

	private ensureJiraSubscription(): void {
		const svc = this.getPlugin()?.jiraService ?? null;
		if (svc === this.jiraSubscribedOn) return;

		// Unsubscribe from the previous instance (plugin may have reloaded).
		if (this.jiraSubscribedOn && this.jiraListener && this.jiraSubscribedOn.off) {
			try { this.jiraSubscribedOn.off(this.jiraListener); } catch { /* ignore */ }
		}

		this.jiraSubscribedOn = svc;
		if (!svc || !svc.on) {
			this.jiraListener = null;
			return;
		}

		this.jiraListener = () => this.fireReady();
		try { svc.on(this.jiraListener); } catch { this.jiraListener = null; }
	}

	/** Best-effort normalisation of whatever shape BuJo's scanner returns. */
	private normaliseTopic(t: Record<string, unknown>): TopicSummary {
		const title = typeof t.title === 'string' ? t.title : '';
		const filePath = typeof t.filePath === 'string' ? t.filePath : '';
		const status = typeof t.status === 'string' ? t.status : undefined;
		const priority = typeof t.priority === 'string' ? t.priority : undefined;
		const jira = this.parseJiraField(t.jira);
		return { title, filePath, status, priority, jira };
	}

	/** Read a topic markdown file's frontmatter via the metadata cache. */
	private parseTopicFromFile(file: TFile): TopicSummary | null {
		const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!fm) return null;
		// Prefer first H1 heading as title when available; fall back to filename.
		const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
		const h1 = headings.find(h => h.level === 1);
		const title = h1?.heading?.trim() || file.basename;
		return {
			title,
			filePath: file.path,
			status: typeof fm.status === 'string' ? fm.status : undefined,
			priority: typeof fm.priority === 'string' ? fm.priority : undefined,
			jira: this.parseJiraField(fm.jira),
		};
	}

	/**
	 * BuJo writes the `jira` frontmatter key loosely: as a YAML list, a comma-separated
	 * string, or a whitespace-separated string. Accept any of those, extract uppercase
	 * keys, dedupe while preserving first-seen order.
	 */
	private parseJiraField(raw: unknown): string[] {
		if (raw == null) return [];
		const tokens: string[] = [];
		if (Array.isArray(raw)) {
			for (const item of raw) {
				if (typeof item === 'string') tokens.push(...item.split(/[,;\s]+/));
				else if (item != null) tokens.push(String(item));
			}
		} else if (typeof raw === 'string') {
			tokens.push(...raw.split(/[,;\s]+/));
		} else {
			return [];
		}
		const seen = new Set<string>();
		const out: string[] = [];
		for (const tok of tokens) {
			const upper = tok.trim().toUpperCase();
			if (upper && JIRA_KEY_REGEX.test(upper) && !seen.has(upper)) {
				seen.add(upper);
				out.push(upper);
			}
		}
		return out;
	}
}
