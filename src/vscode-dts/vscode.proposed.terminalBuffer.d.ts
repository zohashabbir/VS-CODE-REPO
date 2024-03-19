/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/207504
	//
	// The consequences of exposing this API will be that we must have a synchronous copy of the
	// terminal available on the extension host. This could be done in a couple of ways:
	//
	// - Send over diffs or serialized sections of the terminal periodically, this is probably
	//   harder to accomplish than it's worth.
	// - Run a parallel version of xterm.js on the extension host.
	//
	// The latter is already happening on both the renderer process and the pty host, so it's not a
	// huge deal, especially since there is a headless version of xterm.js and its memory layout is
	// quite compact; ~12 bytes per cell, so a fairly typical 160x20 viewport with 1000 scrollback
	// would use:
	//
	// 160*20*12 + 160*1000*12 bytes = 38400 + 1920000 bytes = ~1.87mb
	//
	// Similar to on the pty host this could have limited scrollback if we wanted to restrict memory
	// usage further, though that might be unexpected by extension authors and pose a challenge if
	// they want to read the entire output of a command.
	//
	// One of the niceties of doing this is that the extension host is close to the pty host, so
	// there is low latency in sending updates to the extension host, even on remote connections by
	// sending data between these processes pty host -> server -> ext host. If all data events are
	// in order then xterm.js will guarantee that they remain in sync.

	export interface Terminal {
		readonly buffers: TerminalBufferSet;
	}

	export interface TerminalBufferSet {
		/**
		 * The active buffer of the terminal. This is the buffer that is currently being displayed.
		 */
		readonly active: TerminalBuffer;

		readonly normal: TerminalBuffer;
		readonly alternate: TerminalBuffer;
	}

	export interface TerminalBuffer {
		/**
		 * The type of this buffer.
		 */
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

		/**
		 * Returns a text line denoted by the line number. Note that the returned object is *not*
		 * live and changes to the buffer are not reflected.
		 *
		 * TODO: This could be in range [0, trimmedLineCount + length (exclusive)] if we just want
		 *       to pass the empty string for empty lines.
		 * @param line A line number in [trimmedLineCount, trimmedLineCount + length (exclusive)].
		 *
		 * @throws When the line number is not valid and/or the line has been trimmed from the
		 * buffer.
		 */
		lineAt(line: number): TerminalBufferLine;

		/**
		 * Get the text of this buffer. A substring can be retrieved by providing a range. The range
		 * will be {@link TerminalBuffer.validateRange adjusted}.
		 *
		 * @param range The range to get the text for. If not provided, the entire buffer's text
		 * will be returned.
		 */
		getText(range?: TerminalBufferRange): string;

		/**
		 * Ensure a range is completely contained in this terminal.
		 *
		 * @param range A range.
		 * @returns The given range or a new, adjusted range.
		 */
		validateRange(range: TerminalBufferRange): Range;
	}

	export enum TerminalBufferType {
		/**
		 * The normal buffer of a terminal. This is the buffer that is active when the terminal
		 * is first created and features scrollback.
		 */
		Normal,
		/**
		 * The alternate buffer of a terminal. This buffer is explicitly requested by the
		 * application running in the terminal and does not feature scrollback.
		 */
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
		/**
		 * Fires when {@link Terminal} {@link TerminalBufferSet.active} changes.
		 */
		export const onDidChangeTerminalBuffer: Event<TerminalBufferChangeEvent>;
	}

	export interface TerminalBufferChangeEvent {
		terminal: Terminal;
		activeBuffer: TerminalBuffer;
	}
}
