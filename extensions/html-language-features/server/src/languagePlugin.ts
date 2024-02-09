import type { LanguagePlugin, VirtualCode } from '@volar/language-server';
import type * as ts from 'typescript';
import { getLanguageService } from 'vscode-html-languageservice';
import { getDocumentRegions } from './modes/embeddedSupport';

const htmlLanguageService = getLanguageService();

export const htmlLanguagePlugin: LanguagePlugin = {
	createVirtualCode(_fileId, languageId, snapshot) {
		if (languageId === 'html') {
			return createHtmlVirtualCode(snapshot);
		}
		return undefined;
	},
	updateVirtualCode(_fileId, _virtualCode, newSnapshot) {
		return createHtmlVirtualCode(newSnapshot);
	},
}

function createHtmlVirtualCode(snapshot: ts.IScriptSnapshot): VirtualCode {
	const root: VirtualCode = {
		id: 'root',
		languageId: 'html',
		snapshot,
		mappings: [{
			sourceOffsets: [0],
			generatedOffsets: [0],
			lengths: [snapshot.getLength()],
			data: {
				verification: true,
				completion: true,
				semantic: true,
				navigation: true,
				structure: true,
				format: true,
			},
		}],
		embeddedCodes: [],
	};
	const documentRegions = getDocumentRegions(htmlLanguageService, snapshot.getText(0, snapshot.getLength()));
	const languageIdIndexes: Record<string, number> = {};
	for (const documentRegion of documentRegions.getEmbeddedRegions()) {
		if (!documentRegion.languageId) {
			continue;
		}
		languageIdIndexes[documentRegion.languageId] ??= 0;
		root.embeddedCodes.push({
			languageId: documentRegion.languageId,
			id: documentRegion.languageId + '_' + languageIdIndexes[documentRegion.languageId],
			snapshot: {
				getText(start, end) {
					return documentRegion.content.substring(start, end);
				},
				getLength() {
					return documentRegion.content.length;
				},
				getChangeRange() {
					return undefined;
				},
			},
			mappings: [{
				sourceOffsets: [documentRegion.start],
				generatedOffsets: [documentRegion.generatedStart],
				lengths: [documentRegion.length],
				data: documentRegion.attributeValue ? {
					verification: false,
					completion: true,
					semantic: true,
					navigation: true,
					structure: false,
					format: false,
				} : {
					verification: true,
					completion: true,
					semantic: true,
					navigation: true,
					structure: true,
					format: false,
				},
			}],
			embeddedCodes: [],
		});
		languageIdIndexes[documentRegion.languageId]++;
	}
	return root;
}
