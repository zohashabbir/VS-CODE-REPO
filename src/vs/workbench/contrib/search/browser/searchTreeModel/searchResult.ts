/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, PauseableEmitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { NotebookEditorWidget } from '../../../notebook/browser/notebookEditorWidget.js';
import { INotebookEditorService } from '../../../notebook/browser/services/notebookEditorService.js';
import { IFileMatch, ISearchComplete, ITextQuery } from '../../../../services/search/common/search.js';
import { AI_TEXT_SEARCH_RESULT_ID, arrayContainsElementOrParent, IChangeEvent, IFileInstanceMatch, IFolderMatch, IPlainTextSearchHeading, ISearchModel, ISearchResult, isFileInstanceMatch, isFolderMatch, isFolderMatchWithResource, isSearchMatch, isTextSearchHeading, ITextSearchHeading, mergeSearchResultEvents, PLAIN_TEXT_SEARCH__RESULT_ID, RenderableMatch } from './searchTreeCommon.js';

import { RangeHighlightDecorations } from './rangeDecorations.js';
import { PlainTextSearchHeadingImpl, TextSearchHeadingImpl } from './textSearchHeading.js';


export class SearchResultImpl extends Disposable implements ISearchResult {

	private _onChange = this._register(new PauseableEmitter<IChangeEvent>({
		merge: mergeSearchResultEvents
	}));
	readonly onChange: Event<IChangeEvent> = this._onChange.event;
	private _onWillChangeModelListener: IDisposable | undefined;
	private _onDidChangeModelListener: IDisposable | undefined;
	private _plainTextSearchResult: IPlainTextSearchHeading;
	private _aiTextSearchResult: ITextSearchHeading;

	constructor(
		public readonly searchModel: ISearchModel,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IModelService private readonly modelService: IModelService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super();
		this._plainTextSearchResult = this._register(this.instantiationService.createInstance(PlainTextSearchHeadingImpl, true, this, PLAIN_TEXT_SEARCH__RESULT_ID));
		this._aiTextSearchResult = this._register(this.instantiationService.createInstance(TextSearchHeadingImpl, true, this, AI_TEXT_SEARCH_RESULT_ID));

		this._register(this._plainTextSearchResult.onChange((e) => this._onChange.fire(e)));
		this._register(this._aiTextSearchResult.onChange((e) => this._onChange.fire(e)));

		this.modelService.getModels().forEach(model => this.onModelAdded(model));
		this._register(this.modelService.onModelAdded(model => this.onModelAdded(model)));

		this._register(this.notebookEditorService.onDidAddNotebookEditor(widget => {
			if (widget instanceof NotebookEditorWidget) {
				this.onDidAddNotebookEditorWidget(<NotebookEditorWidget>widget);
			}
		}));

	}

	get plainTextSearchResult(): IPlainTextSearchHeading {
		return this._plainTextSearchResult;
	}

	get aiTextSearchResult(): ITextSearchHeading {
		return this._aiTextSearchResult;
	}

	get children() {
		return this.textSearchResults;
	}

	get hasChildren(): boolean {
		return true; // should always have a Text Search Result for plain results.
	}
	get textSearchResults(): ITextSearchHeading[] {
		return [this._plainTextSearchResult, this._aiTextSearchResult];
	}

	async batchReplace(elementsToReplace: RenderableMatch[]) {
		try {
			this._onChange.pause();
			await Promise.all(elementsToReplace.map(async (elem) => {
				const parent = elem.parent();

				if ((isFolderMatch(parent) || isFileInstanceMatch(parent)) && arrayContainsElementOrParent(parent, elementsToReplace)) {
					// skip any children who have parents in the array
					return;
				}

				if (isFileInstanceMatch(elem)) {
					await elem.parent().replace(elem);
				} else if (isSearchMatch(elem)) {
					await elem.parent().replace(elem);
				} else if (isFolderMatch(elem)) {
					await elem.replaceAll();
				}
			}));
		} finally {
			this._onChange.resume();
		}
	}

	batchRemove(elementsToRemove: RenderableMatch[]) {
		// need to check that we aren't trying to remove elements twice
		const removedElems: RenderableMatch[] = [];

		try {
			this._onChange.pause();
			elementsToRemove.forEach((currentElement) => {
				if (!arrayContainsElementOrParent(currentElement, removedElems)) {
					if (isTextSearchHeading(currentElement)) {
						currentElement.hide();
					} else if (!isFolderMatch(currentElement) || isFolderMatchWithResource(currentElement)) {
						// const elemParent = (<IFileInstanceMatch>currentElement).parent();
						// currentElement.parent().remove(currentElement);
						removedElems.push(currentElement);
					}
				}
			}
			);
		} finally {
			this._onChange.resume();
		}
	}

	get isDirty(): boolean {
		return this._aiTextSearchResult.isDirty || this._plainTextSearchResult.isDirty;
	}

	get query(): ITextQuery | null {
		return this._plainTextSearchResult.query;
	}

	set query(query: ITextQuery | null) {
		this._plainTextSearchResult.query = query;
		this._aiTextSearchResult.query = query;
	}

	private onDidAddNotebookEditorWidget(widget: NotebookEditorWidget): void {

		this._onWillChangeModelListener?.dispose();
		this._onWillChangeModelListener = widget.onWillChangeModel(
			(model) => {
				if (model) {
					this.onNotebookEditorWidgetRemoved(widget, model?.uri);
				}
			}
		);

		this._onDidChangeModelListener?.dispose();
		// listen to view model change as we are searching on both inputs and outputs
		this._onDidChangeModelListener = widget.onDidAttachViewModel(
			() => {
				if (widget.hasModel()) {
					this.onNotebookEditorWidgetAdded(widget, widget.textModel.uri);
				}
			}
		);
	}

	folderMatches(ai: boolean = false): IFolderMatch[] {
		if (ai) {
			return this._aiTextSearchResult.folderMatches();
		}
		return this._plainTextSearchResult.folderMatches();
	}

	private onModelAdded(model: ITextModel): void {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(model.uri);
		folderMatch?.bindModel(model);
	}

	private async onNotebookEditorWidgetAdded(editor: NotebookEditorWidget, resource: URI): Promise<void> {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(resource);
		await folderMatch?.bindNotebookEditorWidget(editor, resource);
	}

	private onNotebookEditorWidgetRemoved(editor: NotebookEditorWidget, resource: URI): void {
		const folderMatch = this._plainTextSearchResult.findFolderSubstr(resource);
		folderMatch?.unbindNotebookEditorWidget(editor, resource);
	}


	add(allRaw: IFileMatch[], searchInstanceID: string, ai: boolean, silent: boolean = false): void {
		this._plainTextSearchResult.hidden = false;
		this._aiTextSearchResult.hidden = false;

		if (ai) {
			this._aiTextSearchResult.add(allRaw, searchInstanceID, ai, silent);
		} else {
			this._plainTextSearchResult.add(allRaw, searchInstanceID, ai, silent);
		}
	}

	clear(): void {
		this._aiTextSearchResult.clear();
		this._plainTextSearchResult.clear();
	}

	remove(matches: IFileInstanceMatch | IFolderMatch | (IFileInstanceMatch | IFolderMatch)[], ai = false): void {
		if (ai) {
			this._aiTextSearchResult.remove(matches, ai);
		}
		this._plainTextSearchResult.remove(matches, ai);

	}

	replace(match: IFileInstanceMatch): Promise<any> {
		return this._plainTextSearchResult.replace(match);
	}

	matches(ai?: boolean): IFileInstanceMatch[] {
		if (ai === undefined) {
			return this._plainTextSearchResult.matches().concat(this._aiTextSearchResult.matches());
		} else if (ai === true) {
			return this._aiTextSearchResult.matches();
		}
		return this._plainTextSearchResult.matches();
	}

	isEmpty(): boolean {
		return this._plainTextSearchResult.isEmpty() && this._aiTextSearchResult.isEmpty();
	}

	fileCount(): number {
		return this._plainTextSearchResult.fileCount() + this._aiTextSearchResult.fileCount();
	}

	count(): number {
		return this._plainTextSearchResult.count() + this._aiTextSearchResult.count();
	}

	setCachedSearchComplete(cachedSearchComplete: ISearchComplete | undefined, ai: boolean) {
		if (ai) {
			this._aiTextSearchResult.cachedSearchComplete = cachedSearchComplete;
		} else {
			this._plainTextSearchResult.cachedSearchComplete = cachedSearchComplete;
		}
	}

	getCachedSearchComplete(ai: boolean): ISearchComplete | undefined {
		if (ai) {
			return this._aiTextSearchResult.cachedSearchComplete;
		}
		return this._plainTextSearchResult.cachedSearchComplete;
	}

	toggleHighlights(value: boolean, ai: boolean = false): void {
		if (ai) {
			this._aiTextSearchResult.toggleHighlights(value);
		} else {
			this._plainTextSearchResult.toggleHighlights(value);
		}
	}

	getRangeHighlightDecorations(ai: boolean = false): RangeHighlightDecorations {
		if (ai) {
			return this._aiTextSearchResult.rangeHighlightDecorations;
		}
		return this._plainTextSearchResult.rangeHighlightDecorations;
	}

	replaceAll(progress: IProgress<IProgressStep>): Promise<any> {
		return this._plainTextSearchResult.replaceAll(progress);
	}

	override async dispose(): Promise<void> {
		this._aiTextSearchResult?.dispose();
		this._plainTextSearchResult?.dispose();
		this._onWillChangeModelListener?.dispose();
		this._onDidChangeModelListener?.dispose();
		super.dispose();
	}
}
