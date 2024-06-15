/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

class PathTrieNode<T> {
	prev: PathTrieNode<T> | undefined;
	next: Map<string, PathTrieNode<T>> | undefined;
	data: T | undefined;
}

export class PathTrie<T> {

	private readonly root = new PathTrieNode<T>();

	private toSegments(path: string): string[] {
		return path.split(/[\\/]/).filter(path => !!path);
	}

	set(path: string, data: T): void {
		this.ensureNode(path).data = data;
	}

	private ensureNode(path: string): PathTrieNode<T> {
		const segments = this.toSegments(path);

		let cur = this.root;
		for (const segment of segments) {
			let child = cur.next?.get(segment);
			if (!child) {
				child = new PathTrieNode<T>();
				child.prev = cur;
				if (!cur.next) {
					cur.next = new Map<string, PathTrieNode<T>>();
				}
				cur.next.set(segment, child);
			}
			cur = child;
		}

		return cur;
	}

	get(path: string): T | undefined {
		return this.findNode(path)?.data;
	}

	private findNode(path: string): PathTrieNode<T> | undefined {
		const segments = this.toSegments(path);

		let cur = this.root;
		for (const segment of segments) {
			const child = cur.next?.get(segment);
			if (!child) {
				return undefined;
			}
			cur = child;
		}

		return cur;
	}

	delete(path: string): void {
		const segments = this.toSegments(path);

		let cur = this.root;
		for (const segment of segments) {
			const child = cur.next?.get(segment);
			if (!child) {
				return undefined;
			}
			cur = child;
		}

		cur.prev?.next?.delete(segments[segments.length - 1]);
	}

	* findSubstr(path: string) {
		const segments = this.toSegments(path);

		let cur = this.root;
		for (const segment of segments) {
			const child = cur.next?.get(segment);
			if (!child) {
				return;
			}
			cur = child;
			if (cur.data) {
				yield cur.data;
			}
		}
	}

	* findSuperstr(path: string) {
		const segments = this.toSegments(path);

		let cur = this.root;
		for (const segment of segments) {
			const child = cur.next?.get(segment);
			if (!child) {
				return;
			}
			cur = child;
		}

		const node = this.findNode(path);
		if (node) {
			yield* this.visitAll(cur);
		}
	}

	private * visitAll(node: PathTrieNode<T>): Iterable<T> {
		if (node.data) {
			yield node.data;
		}

		if (node.next) {
			for (const child of node.next.values()) {
				yield* this.visitAll(child);
			}
		}
	}
}
