/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { PathTrie } from 'vs/base/common/pathTrie';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Path Trie', () => {
	let trie: PathTrie<number>;

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		trie = new PathTrie<number>();
	});

	test('get / delete', () => {
		trie.set('/Users/name/Desktop/test-ts/package.json', 1);
		trie.set('/Users/name/Desktop/test-ts', 2);
		trie.set('/Users/name/Desktop', 3);
		trie.set('/Users/name', 4);

		assert.strictEqual(trie.get('/Users/name/Desktop/test-ts/package.json'), 1);
		assert.strictEqual(trie.get('/Users/name/Desktop/test-ts'), 2);
		assert.strictEqual(trie.get('/Users/name/Desktop'), 3);
		assert.strictEqual(trie.get('/Users/name'), 4);
		assert.strictEqual(trie.get('/Users'), undefined);

		trie.delete('/Users/name/Desktop/test-ts/package.json');
		assert.strictEqual(trie.get('/Users/name/Desktop/test-ts/package.json'), undefined);
		trie.delete('/Users/name/Desktop/test-ts');
		assert.strictEqual(trie.get('/Users/name/Desktop/test-ts'), undefined);
		trie.delete('/Users/name/Desktop');
		assert.strictEqual(trie.get('/Users/name/Desktop'), undefined);
		trie.delete('/Users/name');
		assert.strictEqual(trie.get('/Users/name'), undefined);

		trie.set('C:\\Users\\name\\Desktop\\test-ts\\package.json', 1);
		trie.set('C:\\Users\\name\\Desktop\\test-ts', 2);
		trie.set('C:\\Users\\name\\Desktop', 3);
		trie.set('C:\\Users\\name', 4);

		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop\\test-ts\\package.json'), 1);
		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop\\test-ts'), 2);
		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop'), 3);
		assert.strictEqual(trie.get('C:\\Users\\name'), 4);
		assert.strictEqual(trie.get('/Users'), undefined);

		trie.delete('C:\\Users\\name\\Desktop\\test-ts\\package.json');
		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop\\test-ts\\package.json'), undefined);
		trie.delete('C:\\Users\\name\\Desktop\\test-ts');
		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop\\test-ts'), undefined);
		trie.delete('C:\\Users\\name\\Desktop');
		assert.strictEqual(trie.get('C:\\Users\\name\\Desktop'), undefined);
		trie.delete('C:\\Users\\name');
		assert.strictEqual(trie.get('C:\\Users\\name'), undefined);
	});

	test('findSubstr', () => {
		trie.set('/Users/name/Desktop/test-ts/package.json', 1);
		trie.set('/Users/name/Desktop/test-ts', 2);
		trie.set('/Users/name/Desktop', 3);
		trie.set('/Users/name', 4);

		let set = new Set<number>();
		for (const id of trie.findSubstr('/Users/name/Desktop/test-ts/package.json')) {
			set.add(id);
		}

		assert.strictEqual(set.size, 4);
		assert.ok(set.has(1));
		assert.ok(set.has(2));
		assert.ok(set.has(3));
		assert.ok(set.has(4));

		assert.strictEqual(trie.findSubstr('/Users2/name/Desktop/test-ts/package.json').next().value, undefined);

		trie = new PathTrie<number>();

		trie.set('C:\\Users\\name\\Desktop\\test-ts\\package.json', 1);
		trie.set('C:\\Users\\name\\Desktop\\test-ts', 2);
		trie.set('C:\\Users\\name\\Desktop', 3);
		trie.set('C:\\Users\\name', 4);

		set = new Set<number>();
		for (const id of trie.findSubstr('C:\\Users\\name\\Desktop\\test-ts\\package.json')) {
			set.add(id);
		}

		assert.strictEqual(set.size, 4);
		assert.ok(set.has(1));
		assert.ok(set.has(2));
		assert.ok(set.has(3));
		assert.ok(set.has(4));

		assert.strictEqual(trie.findSubstr('C:\\Users2\\name\\Desktop\\test-ts\\package.json').next().value, undefined);
	});

	test('findSuperstr', () => {
		trie.set('/Users/name/Desktop/test-ts/package.json', 1);
		trie.set('/Users/name/Desktop/test-ts', 2);
		trie.set('/Users/name/Desktop', 3);
		trie.set('/Users/name', 4);

		let set = new Set<number>();
		for (const id of trie.findSuperstr('/Users/name')) {
			set.add(id);
		}

		assert.strictEqual(set.size, 4);
		assert.ok(set.has(1));
		assert.ok(set.has(2));
		assert.ok(set.has(3));
		assert.ok(set.has(4));

		assert.strictEqual(trie.findSuperstr('/Users/name/Desktop/test-ts/package2.json').next().value, undefined);

		trie = new PathTrie<number>();

		trie.set('C:\\Users\\name\\Desktop\\test-ts\\package.json', 1);
		trie.set('C:\\Users\\name\\Desktop\\test-ts', 2);
		trie.set('C:\\Users\\name\\Desktop', 3);
		trie.set('C:\\Users\\name', 4);

		set = new Set<number>();
		for (const id of trie.findSuperstr('C:\\Users\\name')) {
			set.add(id);
		}

		assert.strictEqual(set.size, 4);
		assert.ok(set.has(1));
		assert.ok(set.has(2));
		assert.ok(set.has(3));
		assert.ok(set.has(4));

		assert.strictEqual(trie.findSuperstr('C:\\Users\\name\\Desktop\\test-ts\\package2.json').next().value, undefined);
	});
});
