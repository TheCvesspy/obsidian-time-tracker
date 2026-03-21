import { TextComponent } from 'obsidian';

/**
 * Adds a datalist-based autocomplete to a TextComponent for category suggestions.
 * Falls back gracefully if the browser doesn't support datalist.
 */
export function addCategorySuggest(
	textComponent: TextComponent,
	categories: string[],
	id: string = 'time-tracker-categories'
): void {
	const inputEl = textComponent.inputEl;

	// Remove existing datalist if any
	const existing = inputEl.ownerDocument.getElementById(id);
	if (existing) existing.remove();

	// Create datalist element
	const datalist = inputEl.ownerDocument.createElement('datalist');
	datalist.id = id;

	for (const cat of categories) {
		const option = inputEl.ownerDocument.createElement('option');
		option.value = cat;
		datalist.appendChild(option);
	}

	inputEl.parentElement?.appendChild(datalist);
	inputEl.setAttribute('list', id);
}
