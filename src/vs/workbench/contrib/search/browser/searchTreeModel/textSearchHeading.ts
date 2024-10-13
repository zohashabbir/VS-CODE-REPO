/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { TernarySearchTree } from '../../../../../base/common/ternarySearchTree.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress, IProgressStep } from '../../../../../platform/progress/common/progress.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IReplaceService } from '../replace.js';
import { IFileMatch, ISearchComplete, ITextQuery } from '../../../../services/search/common/search.js';
import { RangeHighlightDecorations } from './rangeDecorations.js';
import { FolderMatchNoRootImpl, FolderMatchWorkspaceRootImpl } from './folderMatch.js';
import { AI_TEXT_SEARCH_RESULT_ID, IChangeEvent, IFileInstanceMatch, IFolderMatch, IFolderMatchWithResource, IFolderMatchWorkspaceRoot, IPlainTextSearchHeading, ISearchResult, isFileInstanceMatch, isFolderMatch, ITextSearchHeading, ISearchMatch } from './searchTreeCommon.js';
import { isNotebookFileMatch } from '../notebookSearch/notebookSearchModelBase.js';


export class TextSearchHeadingImpl extends Disposable implements ITextSearchHeading {
	private _onChange = this._register(new Emitter<IChangeEvent>());
	readonly onChange: Event<IChangeEvent> = this._onChange.event;
	private _isDirty = false;
	private _showHighlights: boolean = false;

	private _query: ITextQuery | null = null;
	private _rangeHighlightDecorations: RangeHighlightDecorations;
	private disposePastResults: () => Promise<void> = () => Promise.resolve();

	private _folderMatches: IFolderMatchWorkspaceRoot[] = [];
	private _otherFilesMatch: IFolderMatch | null = null;
	private _folderMatchesMap: TernarySearchTree<URI, IFolderMatchWithResource> = TernarySearchTree.forUris<IFolderMatchWorkspaceRoot>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
	public resource = null;
	public hidden = false;

	public cachedSearchComplete: ISearchComplete | undefined;

	constructor(
		private _allowOtherResults: boolean,
		private _parent: ISearchResult,
		private _id: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService
	) {
		super();
		this._rangeHighlightDecorations = this.instantiationService.createInstance(RangeHighlightDecorations);

		this._register(this.onChange(e => {
			if (e.removed) {
				this._isDirty = !this.isEmpty();
			}
		}));
	}

	hide() {
		this.hidden = true;
		this.clear();
	}

	get isAIContributed() {
		return this.id() === AI_TEXT_SEARCH_RESULT_ID;
	}

	id() {
		return this._id;
	}
	parent() {
		return this._parent;
	}

	get hasChildren(): boolean {
		return this._folderMatches.length > 0;
	}

	name(): string {
		return this.isAIContributed ? 'AI' : 'Text';
	}

	get isDirty(): boolean {
		return this._isDirty;
	}

	public getFolderMatch(resource: URI): IFolderMatch | undefined {
		const folderMatch = this._folderMatchesMap.findSubstr(resource);

		if (!folderMatch && this._allowOtherResults && this._otherFilesMatch) {
			return this._otherFilesMatch;
		}
		return folderMatch;
	}

	add(allRaw: IFileMatch[], searchInstanceID: string, ai: boolean, silent: boolean = false): void {
		// Split up raw into a list per folder so we can do a batch add per folder.

		const { byFolder, other } = this.groupFilesByFolder(allRaw);
		byFolder.forEach(raw => {
			if (!raw.length) {
				return;
			}

			// ai results go into the respective folder
			const folderMatch = this.getFolderMatch(raw[0].resource);
			folderMatch?.addFileMatch(raw, silent, searchInstanceID, this.isAIContributed);
		});

		if (!ai) {
			this._otherFilesMatch?.addFileMatch(other, silent, searchInstanceID, false);
		}
		this.disposePastResults();
	}

	remove(matches: IFileInstanceMatch | IFolderMatch | (IFileInstanceMatch | IFolderMatch)[], ai = false): void {
		if (!Array.isArray(matches)) {
			matches = [matches];
		}

		matches.forEach(m => {
			if (isFolderMatch(m)) {
				m.clear();
			}
		});

		const fileMatches: IFileInstanceMatch[] = matches.filter(m => isFileInstanceMatch(m)) as IFileInstanceMatch[];

		const { byFolder, other } = this.groupFilesByFolder(fileMatches);
		byFolder.forEach(matches => {
			if (!matches.length) {
				return;
			}

			this.getFolderMatch(matches[0].resource)?.remove(matches);
		});

		if (other.length) {
			this.getFolderMatch(other[0].resource)?.remove(<IFileInstanceMatch[]>other);
		}
	}

	groupFilesByFolder<FileMatch extends IFileMatch>(fileMatches: FileMatch[]): { byFolder: ResourceMap<FileMatch[]>; other: FileMatch[] } {
		const rawPerFolder = new ResourceMap<FileMatch[]>();
		const otherFileMatches: FileMatch[] = [];
		this._folderMatches.forEach(fm => rawPerFolder.set(fm.resource, []));

		fileMatches.forEach(rawFileMatch => {
			const folderMatch = this.getFolderMatch(rawFileMatch.resource);
			if (!folderMatch) {
				// foldermatch was previously removed by user or disposed for some reason
				return;
			}

			const resource = folderMatch.resource;
			if (resource) {
				rawPerFolder.get(resource)!.push(rawFileMatch);
			} else {
				otherFileMatches.push(rawFileMatch);
			}
		});

		return {
			byFolder: rawPerFolder,
			other: otherFileMatches
		};
	}
	isEmpty(): boolean {
		return this.folderMatches().every((folderMatch) => folderMatch.isEmpty());
	}

	findFolderSubstr(resource: URI) {
		return this._folderMatchesMap.findSubstr(resource);
	}

	get query(): ITextQuery | null {
		return this._query;
	}

	set query(query: ITextQuery | null) {
		// When updating the query we could change the roots, so keep a reference to them to clean up when we trigger `disposePastResults`
		const oldFolderMatches = this.folderMatches();
		this.disposePastResults = async () => {
			oldFolderMatches.forEach(match => match.clear());
			oldFolderMatches.forEach(match => match.dispose());
			this._isDirty = false;
		};

		this.cachedSearchComplete = undefined;

		this._rangeHighlightDecorations.removeHighlightRange();
		this._folderMatchesMap = TernarySearchTree.forUris<IFolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));
		if (!query) {
			return;
		}

		this._folderMatches = (query && query.folderQueries || [])
			.map(fq => fq.folder)
			.map((resource, index) => <IFolderMatchWorkspaceRoot>this._createBaseFolderMatch(resource, resource.toString(), index, query, this.isAIContributed));

		this._folderMatches.forEach(fm => this._folderMatchesMap.set(fm.resource, fm));

		if (this._allowOtherResults) {
			this._otherFilesMatch = this._createBaseFolderMatch(null, 'otherFiles', this._folderMatches.length + 1, query, this.isAIContributed);
		}

		this._query = query;
	}
	private _createBaseFolderMatch(resource: URI | null, id: string, index: number, query: ITextQuery, ai: boolean): IFolderMatch {
		let folderMatch: IFolderMatch;
		if (resource) {
			folderMatch = this._register(this.instantiationService.createInstance(FolderMatchWorkspaceRootImpl, resource, id, index, query, this, ai));
		} else {
			folderMatch = this._register(this.instantiationService.createInstance(FolderMatchNoRootImpl, id, index, query, this));
		}
		const disposable = folderMatch.onChange((event) => this._onChange.fire(event));
		this._register(folderMatch.onDispose(() => disposable.dispose()));
		return folderMatch;
	}


	folderMatches(): IFolderMatch[] {
		return this._otherFilesMatch && this._allowOtherResults ?
			[
				...this._folderMatches,
				this._otherFilesMatch,
			] :
			this._folderMatches;
	}

	private disposeMatches(): void {
		this.folderMatches().forEach(folderMatch => folderMatch.dispose());

		this._folderMatches = [];

		this._folderMatchesMap = TernarySearchTree.forUris<IFolderMatchWithResource>(key => this.uriIdentityService.extUri.ignorePathCasing(key));

		this._rangeHighlightDecorations.removeHighlightRange();
	}

	matches(): IFileInstanceMatch[] {
		const matches: IFileInstanceMatch[][] = [];
		this.folderMatches().forEach(folderMatch => {
			matches.push(folderMatch.allDownstreamFileMatches());
		});

		return (<IFileInstanceMatch[]>[]).concat(...matches);
	}

	get showHighlights(): boolean {
		return this._showHighlights;
	}

	toggleHighlights(value: boolean): void {
		if (this._showHighlights === value) {
			return;
		}
		this._showHighlights = value;
		let selectedMatch: ISearchMatch | null = null;
		this.matches().forEach((fileMatch: IFileInstanceMatch) => {
			fileMatch.updateHighlights();
			if (isNotebookFileMatch(fileMatch)) {
				fileMatch.updateNotebookHighlights();
			}
			if (!selectedMatch) {
				selectedMatch = fileMatch.getSelectedMatch();
			}
		});
		if (this._showHighlights && selectedMatch) {
			// TS?
			this._rangeHighlightDecorations.highlightRange(
				(<ISearchMatch>selectedMatch).parent().resource,
				(<ISearchMatch>selectedMatch).range()
			);
		} else {
			this._rangeHighlightDecorations.removeHighlightRange();
		}
	}

	get rangeHighlightDecorations(): RangeHighlightDecorations {
		return this._rangeHighlightDecorations;
	}

	fileCount(): number {
		return this.folderMatches().reduce<number>((prev, match) => prev + match.recursiveFileCount(), 0);
	}

	count(): number {
		return this.matches().reduce<number>((prev, match) => prev + match.count(), 0);
	}

	clear(): void {
		this.folderMatches().forEach((folderMatch) => folderMatch.clear(true));
		this.disposeMatches();
		this._folderMatches = [];
		this._otherFilesMatch = null;
		this.cachedSearchComplete = undefined;
	}

	override async dispose(): Promise<void> {
		this._rangeHighlightDecorations.dispose();
		this.disposeMatches();
		super.dispose();
		await this.disposePastResults();
	}
}

export class PlainTextSearchHeadingImpl extends TextSearchHeadingImpl implements IPlainTextSearchHeading {
	constructor(
		_allowOtherResults: boolean,
		parent: ISearchResult,
		id: string,
		@IInstantiationService instantiationService: IInstantiationService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IReplaceService private readonly replaceService: IReplaceService,
	) {
		super(_allowOtherResults, parent, id, instantiationService, uriIdentityService);

	}

	replace(match: IFileInstanceMatch): Promise<any> {
		return this.getFolderMatch(match.resource)?.replace(match) ?? Promise.resolve();
	}

	override name(): string {
		return 'Text';
	}

	replaceAll(progress: IProgress<IProgressStep>): Promise<any> {
		this.replacingAll = true;

		const promise = this.replaceService.replace(this.matches(), progress);

		return promise.then(() => {
			this.replacingAll = false;
			this.clear();
		}, () => {
			this.replacingAll = false;
		});
	}

	private set replacingAll(running: boolean) {
		this.folderMatches().forEach((folderMatch) => {
			folderMatch.replacingAll = running;
		});
	}
}
