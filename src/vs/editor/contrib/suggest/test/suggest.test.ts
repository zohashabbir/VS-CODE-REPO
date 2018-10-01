/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { IDisposable } from 'vs/base/common/lifecycle';
import { SuggestRegistry, SuggestionKind } from 'vs/editor/common/modes';
import { provideSuggestionItems } from 'vs/editor/contrib/suggest/suggest';
import { Position } from 'vs/editor/common/core/position';
import { TextModel } from 'vs/editor/common/model/textModel';


suite('Suggest', function () {

	let model: TextModel;
	let registration: IDisposable;

	setup(function () {

		model = TextModel.createFromString('FOO\nbar\BAR\nfoo', undefined, undefined, URI.parse('foo:bar/path'));
		registration = SuggestRegistry.register({ pattern: 'bar/path', scheme: 'foo' }, {
			provideCompletionItems() {
				return {
					incomplete: false,
					suggestions: [{
						label: 'aaa',
						kind: SuggestionKind.Snippet,
						insertText: 'aaa'
					}, {
						label: 'zzz',
						kind: SuggestionKind.Snippet,
						insertText: 'zzz'
					}, {
						label: 'fff',
						kind: SuggestionKind.Property,
						insertText: 'fff'
					}]
				};
			}
		});
	});

	teardown(() => {
		registration.dispose();
		model.dispose();
	});

	test('sort - snippet inline', function () {
		return provideSuggestionItems(model, new Position(1, 1), 'inline').then(items => {
			assert.equal(items.length, 3);
			assert.equal(items[0].suggestion.label, 'aaa');
			assert.equal(items[1].suggestion.label, 'fff');
			assert.equal(items[2].suggestion.label, 'zzz');
		});
	});

	test('sort - snippet top', function () {
		return provideSuggestionItems(model, new Position(1, 1), 'top').then(items => {
			assert.equal(items.length, 3);
			assert.equal(items[0].suggestion.label, 'aaa');
			assert.equal(items[1].suggestion.label, 'zzz');
			assert.equal(items[2].suggestion.label, 'fff');
		});
	});

	test('sort - snippet bottom', function () {
		return provideSuggestionItems(model, new Position(1, 1), 'bottom').then(items => {
			assert.equal(items.length, 3);
			assert.equal(items[0].suggestion.label, 'fff');
			assert.equal(items[1].suggestion.label, 'aaa');
			assert.equal(items[2].suggestion.label, 'zzz');
		});
	});

	test('sort - snippet none', function () {
		return provideSuggestionItems(model, new Position(1, 1), 'none').then(items => {
			assert.equal(items.length, 1);
			assert.equal(items[0].suggestion.label, 'fff');
		});
	});

	test('only from', function () {

		const foo: any = {
			triggerCharacters: [],
			provideCompletionItems() {
				return {
					currentWord: '',
					incomplete: false,
					suggestions: [{
						label: 'jjj',
						type: 'property',
						insertText: 'jjj'
					}]
				};
			}
		};
		const registration = SuggestRegistry.register({ pattern: 'bar/path', scheme: 'foo' }, foo);

		provideSuggestionItems(model, new Position(1, 1), undefined, [foo]).then(items => {
			registration.dispose();

			assert.equal(items.length, 1);
			assert.ok(items[0].support === foo);
		});
	});
});
