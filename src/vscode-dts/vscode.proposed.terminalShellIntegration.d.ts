/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// https://github.com/microsoft/vscode/issues/145234

	export interface TerminalShellExecution {
		/**
		 * The {@link Terminal} the command was executed in.
		 */
		terminal: Terminal;

		/**
		 * The full command line that was executed, including both the command and the arguments.
		 */
		commandLine: string | undefined;

		/**
		 * The current working directory that was reported by the shell. This will be a {@link Uri}
		 * if the string reported by the shell can reliably be mapped to the connected machine.
		 */
		cwd: Uri | string | undefined;

		/**
		 * The exit code reported by the shell.
		 */
		exitCode: Thenable<number | undefined>;

		/**
		 * The output of the command when it has finished executing. This is the plain text shown in
		 * the terminal buffer and does not include raw escape sequences. Depending on the shell
		 * setup, this may include the command line as part of the output.
		 *
		 * *Note* This will be rejected if the terminal is determined to not have shell integration
		 * activated.
		 */
		// output: Thenable<string>;
		// TODO: TBD based on terminal buffer exploration.

		/**
		 * A per-extension stream of raw data (including escape sequences) that is written to the
		 * terminal. This will only include data that was written after `stream` was called for the
		 * first time, ie. you must call `stream` immediately after the command is executed via
		 * {@link executeCommand} or {@link onDidStartTerminalShellExecution}`to not miss any data.
		 */
		dataStream: AsyncIterator<TerminalShellExecutionData>;
	}

	export interface TerminalShellExecutionData {
		/**
		 * The data that was written to the terminal.
		 */
		data: string;

		/**
		 * The number of characters that were truncated. This can happen when the process writes a
		 * large amount of data very quickly. If this is non-zero, the data will be the empty
		 * string.
		 */
		truncatedCount: number;
	}

	export interface TerminalShellExecutionOptions {
		// TODO: These could be split into 2 separate interfaces, or 2 separate option interfaces?
		/**
		 * The command line to use.
		 */
		commandLine: string | {
			/**
			 * An executable to use.
			 */
			executable: string;
			/**
			 * Arguments to launch the executable with which will be automatically escaped based on
			 * the executable type.
			 */
			args: string[];
		}
	}

	export interface Terminal {
		shellIntegration?: TerminalShellIntegration;
	}

	export interface TerminalShellIntegration {
		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * *Note* This is not guaranteed to work as [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)
		 * must be activated. Check whether {@link TerminalShellExecution.exitCode} is rejected to
		 * verify whether it was successful.
		 *
		 * @param options The options to use for the command.
		 *
		 * @example
		 * const command = term.executeCommand({
		 *   commandLine: 'echo "Hello world"'
		 * });
		 * // Fallback to sendText on possible failure
		 * command.exitCode
		 *   .catch(() => term.sendText('echo "Hello world"'));
		 */
		executeCommand(options: TerminalShellExecutionOptions): TerminalShellExecution;
	}

	export interface TerminalShellIntegrationEvent {
		/**
		 * The terminal that shell integration has been activated in.
		 */
		terminal: Terminal;
		/**
		 * The shell integration object.
		 */
		shellIntegration: TerminalShellIntegration;
	}

	export namespace window {
		/**
		 * Fires when shell integration activates in a terminal
		 */
		export const onDidActivateTerminalShellIntegration: Event<TerminalShellIntegrationEvent>;

		/**
		 * This will be fired when a terminal command is started. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidStartTerminalShellExecution: Event<TerminalShellExecution>;

		/**
		 * This will be fired when a terminal command is ended. This event will fire only when
		 * [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration) is
		 * activated for the terminal.
		 */
		export const onDidEndTerminalShellExecution: Event<TerminalShellExecution>;
	}
}
