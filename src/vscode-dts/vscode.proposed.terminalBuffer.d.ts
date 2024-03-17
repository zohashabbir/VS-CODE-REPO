/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {
	export interface Terminal {
		readonly buffers: TerminalBuffers;
	}

	export interface TerminalBuffers {
		readonly active: TerminalBuffer;
		readonly normal: TerminalBuffer;
		readonly alternate: TerminalBuffer;
	}

	export interface TerminalBuffer {
		readonly type: TerminalBufferType;

		/**
		 * The number of lines that have been trimmed from the scrollback.
		 */
		readonly trimmedLineCount: number;

		/**
		 * The length of the buffer. This does not include trimmed lines.
		 */
		readonly length: number;

		// TODO: Can we omit cursor x, y, base y, viewport y?

		// NOTE: Throws when line isn't valid or is trimmed
		lineAt(line: number): TerminalBufferLine;
	}

	export enum TerminalBufferType {
		Normal,
		Alternate
	}

	export interface TerminalBufferRange {
		// TODO: Could we just share Position here?
		start: Position;
		end: Position;
	}

	/**
	 * TerminalBufferLine objects are __immutable__. When a {@link TerminalBuffer buffer}'s content
	 * changes, previously retrieved lines will not represent the latest state.
	 */
	export interface TerminalBufferLine {
		/**
		 * The zero-based line number.
		 */
		readonly lineNumber: number;

		/**
		 * The text of this line without the line separator characters.
		 */
		readonly text: string;

		/**
		 * The range this line covers. This includes "whitespace" at the end of
		 * the line if the terminal cells were written to.
		 */
		readonly range: TerminalBufferRange;

		/**
		 * The offset of the first character which is not a whitespace character as defined
		 * by `/\s/`. **Note** that if a line is all whitespace the length of the line is returned.
		 */
		readonly firstNonWhitespaceCharacterIndex: number;

		/**
		 * Whether this line is whitespace only, shorthand
		 * for {@link TerminalBufferLine.firstNonWhitespaceCharacterIndex} === {@link TerminalBufferLine.text TerminalBufferLine.text.length}.
		 */
		readonly isEmptyOrWhitespace: boolean;
	}

	export namespace window {
		export const onDidChangeTerminalBuffer: Event<TerminalBufferChangeEvent>;
	}

	export interface TerminalBufferChangeEvent {
		terminal: Terminal;
		activeBuffer: TerminalBuffer;
	}
}
