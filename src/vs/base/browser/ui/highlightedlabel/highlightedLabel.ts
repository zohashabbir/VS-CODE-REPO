/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from 'vs/base/browser/dom';
import { renderLabelWithIcons } from 'vs/base/browser/ui/iconLabel/iconLabels';
import { IDisposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';

/**
 * A range to be highlighted.
 */
export interface IHighlight {
	start: number;
	end: number;
	readonly extraClasses?: readonly string[];
}

export interface IHighlightedLabelOptions {

	/**
	 * Whether the label supports rendering icons.
	 */
	readonly supportIcons?: boolean;
}

declare class Highlight {
	constructor();
	add(range: AbstractRange): void;
	delete(highlight: StaticRange): void;
	clear(): void;
	priority: number;
}

interface CSSHighlights {
	set(rule: string, highlight: Highlight): void;
	get(rule: string): Highlight | undefined;
}
declare namespace CSS {
	let highlights: CSSHighlights | undefined;
}

// TODO: figure out where to put this
const cssHighlight = new Highlight();
CSS.highlights?.set('label-highlight', cssHighlight);

/**
 * A widget which can render a label with substring highlights, often
 * originating from a filter function like the fuzzy matcher.
 */
export class HighlightedLabel implements IDisposable {

	private readonly domNode: HTMLElement;
	private text: string = '';
	private title: string = '';
	private highlights: readonly IHighlight[] = [];
	private supportIcons: boolean;
	private didEverRender: boolean = false;

	/**
	 * Create a new {@link HighlightedLabel}.
	 *
	 * @param container The parent container to append to.
	 */
	constructor(container: HTMLElement, options?: IHighlightedLabelOptions) {
		this.supportIcons = options?.supportIcons ?? false;
		this.domNode = dom.append(container, dom.$('span.monaco-highlighted-label'));
	}

	dispose(): void {
		// TODO: This is not actually be disposed of properly by all owners
		// Also we should explore if there's a nicer way to clean up highlights for a given dom node
		this.clearHighlights();
	}

	/**
	 * The label's DOM node.
	 */
	get element(): HTMLElement {
		return this.domNode;
	}

	/**
	 * Set the label and highlights.
	 *
	 * @param text The label to display.
	 * @param highlights The ranges to highlight.
	 * @param title An optional title for the hover tooltip.
	 * @param escapeNewLines Whether to escape new lines.
	 * @returns
	 */
	set(text: string | undefined, highlights: readonly IHighlight[] = [], title: string = '', escapeNewLines?: boolean) {
		if (!text) {
			text = '';
		}

		if (escapeNewLines) {
			// adjusts highlights inplace
			text = HighlightedLabel.escapeNewLines(text, highlights);
		}

		if (this.didEverRender && this.text === text && this.title === title && objects.equals(this.highlights, highlights)) {
			return;
		}

		this.text = text;
		this.title = title;
		this.highlights = highlights;
		this.render();
	}

	private renderedText?: string;
	private currentHighlightRanges: StaticRange[] = [];

	private render(): void {
		if (CSS.highlights) {
			if (this.renderedText !== this.text) {
				dom.reset(this.domNode, ...this.supportIcons ? renderLabelWithIcons(this.text) : [this.text]);
				this.renderedText = this.text;
			}

			this.clearHighlights();

			// TODO: this does not support labels with icons correctly as the ranges are incorrect
			const el = this.domNode.firstChild;
			for (const highlight of this.highlights) {
				if (!el) {
					break;
				}

				if (highlight.end === highlight.start) {
					continue;
				}

				const range = new StaticRange({
					startContainer: el,
					startOffset: highlight.start,
					endContainer: el,
					endOffset: highlight.end,
				});
				this.currentHighlightRanges.push(range);
				cssHighlight.add(range);
			}
		} else {
			const children: Array<HTMLSpanElement | string> = [];
			let pos = 0;

			for (const highlight of this.highlights) {
				if (highlight.end === highlight.start) {
					continue;
				}

				if (pos < highlight.start) {
					const substring = this.text.substring(pos, highlight.start);
					if (this.supportIcons) {
						children.push(...renderLabelWithIcons(substring));
					} else {
						children.push(substring);
					}
					pos = highlight.start;
				}

				const substring = this.text.substring(pos, highlight.end);
				const element = dom.$('span.highlight', undefined, ...this.supportIcons ? renderLabelWithIcons(substring) : [substring]);

				if (highlight.extraClasses) {
					element.classList.add(...highlight.extraClasses);
				}

				children.push(element);
				pos = highlight.end;
			}

			if (pos < this.text.length) {
				const substring = this.text.substring(pos,);
				if (this.supportIcons) {
					children.push(...renderLabelWithIcons(substring));
				} else {
					children.push(substring);
				}
			}

			dom.reset(this.domNode, ...children);
		}

		if (this.title) {
			this.domNode.title = this.title;
		} else {
			this.domNode.removeAttribute('title');
		}

		this.didEverRender = true;
	}

	clearHighlights() {
		if (CSS.highlights) {
			for (const highlight of this.currentHighlightRanges) {
				cssHighlight.delete(highlight);
			}
			this.currentHighlightRanges = [];
		}
	}

	static escapeNewLines(text: string, highlights: readonly IHighlight[]): string {
		let total = 0;
		let extra = 0;

		return text.replace(/\r\n|\r|\n/g, (match, offset) => {
			extra = match === '\r\n' ? -1 : 0;
			offset += total;

			for (const highlight of highlights) {
				if (highlight.end <= offset) {
					continue;
				}
				if (highlight.start >= offset) {
					highlight.start += extra;
				}
				if (highlight.end >= offset) {
					highlight.end += extra;
				}
			}

			total += extra;
			return '\u23CE';
		});
	}
}
