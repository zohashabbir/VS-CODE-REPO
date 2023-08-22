/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import * as DOM from 'vs/base/browser/dom';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { INotebookEditor } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { INotebookCellList } from 'vs/workbench/contrib/notebook/browser/view/notebookRenderingCommon';
import { NotebookCellOutlineProvider, OutlineEntry } from 'vs/workbench/contrib/notebook/browser/viewModel/notebookOutlineProvider';
import { CellKind } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { StandardMouseEvent } from 'vs/base/browser/mouseEvent';

export class ToggleNotebookStickyScroll extends Action2 {

	constructor() {
		super({
			id: 'notebook.action.toggleNotebookStickyScroll',
			title: {
				value: localize('toggleStickyScroll', "Toggle Notebook Sticky Scroll"),
				mnemonicTitle: localize({ key: 'mitoggleStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Toggle Notebook Sticky Scroll"),
				original: 'Toggle Notebook Sticky Scroll',
			},
			category: Categories.View,
			toggled: {
				condition: ContextKeyExpr.equals('config.notebook.stickyScroll.enabled', true),
				title: localize('notebookStickyScroll', "Notebook Sticky Scroll"),
				mnemonicTitle: localize({ key: 'miNotebookStickyScroll', comment: ['&& denotes a mnemonic'] }, "&&Notebook Sticky Scroll"),
			},
			menu: [
				{ id: MenuId.CommandPalette },
				{ id: MenuId.NotebookStickyScrollContext }
			]
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const configurationService = accessor.get(IConfigurationService);
		const newValue = !configurationService.getValue('notebook.stickyScroll.enabled');
		return configurationService.updateValue('notebook.stickyScroll.enabled', newValue);
	}
}

class NotebookStickyLine extends Disposable {
	constructor(
		public readonly element: HTMLElement,
		public readonly entry: OutlineEntry,
		public readonly notebookEditor: INotebookEditor,
	) {
		super();
		this._register(DOM.addDisposableListener(this.element, DOM.EventType.CLICK, () => {
			this.focusCell();
		}));
	}

	private focusCell() {
		this.notebookEditor.focusNotebookCell(this.entry.cell, 'container');
		const cellScrollTop = this.notebookEditor.getAbsoluteTopOfElement(this.entry.cell);
		const parentCount = this.getParentCount();
		// 1.1 addresses visible cell padding, to make sure we don't focus md cell and also render its sticky line
		this.notebookEditor.setScrollTop(cellScrollTop - (parentCount + 1.1) * 22);
	}

	private getParentCount() {
		let count = 0;
		let entry = this.entry;
		while (entry.parent) {
			count++;
			entry = entry.parent;
		}
		return count;
	}
}


export class NotebookStickyScroll extends Disposable {
	private readonly _disposables = new DisposableStore();
	private currentStickyLines = new Map<OutlineEntry, NotebookStickyLine>();

	getDomNode(): HTMLElement {
		return this.domNode;
	}

	getCurrentStickyHeight() {
		return this.currentStickyLines.size * 22;
	}

	private setCurrentStickyLines(newStickyLines: Map<OutlineEntry, NotebookStickyLine>) {
		this.currentStickyLines = newStickyLines;
	}

	constructor(
		private readonly domNode: HTMLElement,
		private readonly notebookEditor: INotebookEditor,
		private readonly notebookOutline: NotebookCellOutlineProvider,
		private readonly notebookCellList: INotebookCellList,
		@IContextMenuService private readonly _contextMenuService: IContextMenuService,
	) {
		super();

		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().stickyScroll) {
			this.init();
		}

		this._register(this.notebookEditor.notebookOptions.onDidChangeOptions((e) => {
			if (e.stickyScroll) {
				this.updateConfig();
			}
			if (e.globalToolbar) {
				this.setTop();
			}
		}));

		this._register(DOM.addDisposableListener(this.domNode, DOM.EventType.CONTEXT_MENU, async (event: MouseEvent) => {
			this.onContextMenu(event);
		}));
	}

	private onContextMenu(e: MouseEvent) {
		const event = new StandardMouseEvent(e);
		this._contextMenuService.showContextMenu({
			menuId: MenuId.NotebookStickyScrollContext,
			getAnchor: () => event,
		});
	}

	private updateConfig() {
		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().stickyScroll) {
			this.init();
		} else {
			this._disposables.clear();
			this.currentStickyLines.forEach((value) => {
				value.dispose();
			});
			DOM.clearNode(this.domNode);
			this.updateDisplay();
		}
	}

	private setTop() {
		if (this.notebookEditor.notebookOptions.getLayoutConfiguration().globalToolbar) {
			this.domNode.style.top = '26px';
		} else {
			this.domNode.style.top = '0px';
		}
	}

	private init() {
		this.notebookOutline.init();
		this.initializeContent();

		this._disposables.add(this.notebookOutline.onDidChange(() => {
			DOM.clearNode(this.domNode);
			this.disposeCurrentStickyLines();
			this.updateContent(computeContent(this.domNode, this.notebookEditor, this.notebookCellList, this.notebookOutline.entries));
		}));

		this._disposables.add(this.notebookEditor.onDidAttachViewModel(() => {
			this.notebookOutline.init();
			this.initializeContent();
		}));

		this._disposables.add(this.notebookEditor.onDidScroll(() => {
			DOM.clearNode(this.domNode);
			this.disposeCurrentStickyLines();
			this.updateContent(computeContent(this.domNode, this.notebookEditor, this.notebookCellList, this.notebookOutline.entries));
		}));
	}

	static getVisibleOutlineEntry(visibleIndex: number, notebookOutlineEntries: OutlineEntry[]): OutlineEntry | undefined {
		let left = 0;
		let right = notebookOutlineEntries.length - 1;
		let bucket = -1;

		while (left <= right) {
			const mid = Math.floor((left + right) / 2);
			if (notebookOutlineEntries[mid].index < visibleIndex) {
				bucket = mid;
				left = mid + 1;
			} else {
				right = mid - 1;
			}
		}

		if (bucket !== -1) {
			const rootEntry = notebookOutlineEntries[bucket];
			const flatList: OutlineEntry[] = [];
			rootEntry.asFlatList(flatList);
			return flatList.find(entry => entry.index === visibleIndex);
		}
		return undefined;
	}

	private initializeContent() {

		// find last code cell of section, store bottom scroll position in sectionBottom
		const visibleRange = this.notebookEditor.visibleRanges[0];
		if (!visibleRange) {
			return;
		}

		DOM.clearNode(this.domNode);
		const editorScrollTop = this.notebookEditor.scrollTop;

		let trackedEntry = undefined;
		let sectionBottom = 0;
		for (let i = visibleRange.start; i < visibleRange.end; i++) {
			if (i === 0) { // don't show headers when you're viewing the top cell
				this.updateDisplay();
				this.setCurrentStickyLines(new Map());
				return;
			}
			const cell = this.notebookEditor.cellAt(i);
			if (!cell) {
				return;
			}
			if (cell.cellKind === CellKind.Markup) {
				continue;
			}

			// if we are here, the cell is a code cell.
			// check next visible cell, if markdown, that means this is the end of the section
			const nextVisibleCell = this.notebookEditor.cellAt(i + 1);
			if (nextVisibleCell && i + 1 < visibleRange.end) {
				if (nextVisibleCell.cellKind === CellKind.Markup) {
					// this is the end of the section
					// store the bottom scroll position of this cell
					sectionBottom = this.notebookCellList.getCellViewScrollBottom(cell);
					// compute sticky scroll height
					const entry = NotebookStickyScroll.getVisibleOutlineEntry(i, this.notebookOutline.entries);
					if (!entry) {
						return;
					}
					// using 22 instead of stickyscrollheight, as we don't necessarily render each line. 22 starts rendering sticky when we have space for at least 1 of them
					const newStickyHeight = NotebookStickyScroll.computeStickyHeight(entry!);
					if (editorScrollTop + newStickyHeight < sectionBottom) {
						trackedEntry = entry;
						break;
					} else {
						// if (editorScrollTop + stickyScrollHeight > sectionBottom), then continue to next section
						continue;
					}
				}
			} else {
				// there is no next cell, so use the bottom of the editor as the sectionBottom, using scrolltop + height
				sectionBottom = this.notebookEditor.scrollTop + this.notebookEditor.getLayoutInfo().scrollHeight;
				trackedEntry = NotebookStickyScroll.getVisibleOutlineEntry(i, this.notebookOutline.entries);
				break;
			}
		} // cell loop close

		// -------------------------------------------------------------------------------------
		// we now know the cell which the sticky is determined by, and the sectionBottom value to determine how many sticky lines to render
		// compute the space available for sticky lines, and render sticky lines

		const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
		let newMap: Map<OutlineEntry, NotebookStickyLine> | undefined = new Map();
		newMap = NotebookStickyScroll.renderStickyLines(trackedEntry?.parent, this.domNode, linesToRender, newMap, this.notebookEditor);
		if (!newMap) {
			newMap = new Map();
		}
		this.setCurrentStickyLines(newMap);
		this.updateDisplay();
	}

	private updateContent(newMap: Map<OutlineEntry, NotebookStickyLine>) {
		this.setCurrentStickyLines(newMap);
		this.updateDisplay();
	}

	private updateDisplay() {
		const hasSticky = this.currentStickyLines.size > 0;
		if (!hasSticky) {
			this.domNode.style.display = 'none';
		} else {
			this.domNode.style.display = 'block';
		}
		this.setTop();
	}

	static computeStickyHeight(entry: OutlineEntry) {
		let height = 0;
		while (entry.parent) {
			height += 22;
			entry = entry.parent;
		}
		return height;
	}

	static renderStickyLines(entry: OutlineEntry | undefined, containerElement: HTMLElement, numLinesToRender: number, newMap: Map<OutlineEntry, NotebookStickyLine>, notebookEditor: INotebookEditor) {
		const partial = false;
		let currentEntry = entry;

		const elementsToRender = [];
		while (currentEntry) {
			if (currentEntry.level === 7) {
				// level 7 represents a non-header entry, which we don't want to render
				currentEntry = currentEntry.parent;
				continue;
			}
			const lineToRender = NotebookStickyScroll.createStickyElement(currentEntry, partial, notebookEditor);
			newMap.set(currentEntry, lineToRender);
			elementsToRender.unshift(lineToRender);
			currentEntry = currentEntry.parent;
		}

		// iterate over elements to render, and append to container
		// break when we reach numLinesToRender
		for (let i = 0; i < elementsToRender.length; i++) {
			if (i >= numLinesToRender) {
				break;
			}
			containerElement.append(elementsToRender[i].element);
		}

		containerElement.append(DOM.$('div', { class: 'notebook-shadow' })); // ensure we have dropShadow at base of sticky scroll
		return newMap;
	}

	static createStickyElement(entry: OutlineEntry, partial: boolean, notebookEditor: INotebookEditor) {
		const stickyElement = document.createElement('div');
		stickyElement.classList.add('notebook-sticky-scroll-line');
		stickyElement.innerText = '#'.repeat(entry.level) + ' ' + entry.label;

		// todo: partial line rendering for animation
		// if (partial) {
		// 	const partialHeight = Math.floor(remainder * 22);
		// 	stickyLine.style.height = `${partialHeight}px`;
		// }

		return new NotebookStickyLine(stickyElement, entry, notebookEditor);
	}

	private disposeCurrentStickyLines() {
		this.currentStickyLines.forEach((value) => {
			value.dispose();
		});
	}

	override dispose() {
		this._disposables.dispose();
		this.disposeCurrentStickyLines();
		super.dispose();
	}
}

export function computeContent(domNode: HTMLElement, notebookEditor: INotebookEditor, notebookCellList: INotebookCellList, notebookOutlineEntries: OutlineEntry[]): Map<OutlineEntry, NotebookStickyLine> {
	// find first code cell in visible range. this marks the start of the first section
	// find the last code cell in the first section of the visible range, store the bottom scroll position in a const sectionBottom
	// compute sticky scroll height, and check if editorScrolltop + stickyScrollHeight < sectionBottom
	// if that condition is true, break out of the loop with that cell as the tracked cell
	// if that condition is false, continue to next cell

	const editorScrollTop = notebookEditor.scrollTop;

	// find last code cell of section, store bottom scroll position in sectionBottom
	const visibleRange = notebookEditor.visibleRanges[0];
	if (!visibleRange) {
		return new Map();
	}

	let trackedEntry = undefined;
	let sectionBottom = 0;
	for (let i = visibleRange.start; i < visibleRange.end; i++) {
		if (i === 0) { // don't show headers when you're viewing the top cell
			return new Map();
		}
		const cell = notebookEditor.cellAt(i);
		if (!cell) {
			return new Map();
		}
		if (cell.cellKind === CellKind.Markup) {
			continue;
		}

		// if we are here, the cell is a code cell.
		// check next cell, if markdown, that means this is the end of the section
		const nextVisibleCell = notebookEditor.cellAt(i + 1);
		if (nextVisibleCell && i + 1 < visibleRange.end) {
			if (nextVisibleCell.cellKind === CellKind.Markup) {
				// this is the end of the section
				// store the bottom scroll position of this cell
				sectionBottom = notebookCellList.getCellViewScrollBottom(cell);
				// compute sticky scroll height
				const entry = NotebookStickyScroll.getVisibleOutlineEntry(i, notebookOutlineEntries);
				if (!entry) {
					return new Map();
				}
				// check if we can render this section of sticky
				const currentSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(entry!);
				if (editorScrollTop + currentSectionStickyHeight < sectionBottom) {
					const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
					let newMap: Map<OutlineEntry, NotebookStickyLine> | undefined = new Map();
					newMap = NotebookStickyScroll.renderStickyLines(entry?.parent, domNode, linesToRender, newMap, notebookEditor);
					if (!newMap) {
						newMap = new Map();
					}
					return newMap;
				}

				let nextSectionEntry = undefined;
				for (let j = 1; j < visibleRange.end - i; j++) {
					// find next code cell after this one
					const cellCheck = notebookEditor.cellAt(i + j);
					if (cellCheck && cellCheck.cellKind === CellKind.Code) {
						nextSectionEntry = NotebookStickyScroll.getVisibleOutlineEntry(i + j, notebookOutlineEntries);
						break;
					}
				}
				const nextSectionStickyHeight = NotebookStickyScroll.computeStickyHeight(nextSectionEntry!);

				// this block of logic cleans transitions between two sections that share a parent.
				// if the current section and the next section share a parent, then we can render the next section's sticky lines to avoid pop-in between
				if (entry?.parent?.parent === nextSectionEntry?.parent) {
					const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22) + 1;
					let newMap: Map<OutlineEntry, NotebookStickyLine> | undefined = new Map();
					newMap = NotebookStickyScroll.renderStickyLines(nextSectionEntry?.parent, domNode, linesToRender, newMap, notebookEditor);
					if (!newMap) {
						newMap = new Map();
					}
					return newMap;
				} else if (Math.abs(currentSectionStickyHeight - nextSectionStickyHeight) > 22) { // only shrink sticky
					const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);
					let newMap: Map<OutlineEntry, NotebookStickyLine> | undefined = new Map();
					newMap = NotebookStickyScroll.renderStickyLines(entry?.parent, domNode, linesToRender, newMap, notebookEditor);
					if (!newMap) {
						newMap = new Map();
					}
					return newMap;
				}
			}
		} else {
			// there is no next cell, so use the bottom of the editor as the sectionBottom, using scrolltop + height
			sectionBottom = notebookEditor.scrollTop + notebookEditor.getLayoutInfo().scrollHeight;
			trackedEntry = NotebookStickyScroll.getVisibleOutlineEntry(i, notebookOutlineEntries);
			const linesToRender = Math.floor((sectionBottom - editorScrollTop) / 22);

			let newMap: Map<OutlineEntry, NotebookStickyLine> | undefined = new Map();
			newMap = NotebookStickyScroll.renderStickyLines(trackedEntry?.parent, domNode, linesToRender, newMap, notebookEditor);
			if (!newMap) {
				newMap = new Map();
			}
			return newMap;
		}
	} // for cell loop close
	return new Map();
}

registerAction2(ToggleNotebookStickyScroll);
