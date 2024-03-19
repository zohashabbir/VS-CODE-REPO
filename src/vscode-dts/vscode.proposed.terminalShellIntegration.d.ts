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
		 * first time, ie. you must call `dataStream` immediately after the command is executed via
		 * {@link executeCommand} or {@link onDidStartTerminalShellExecution} to not miss any data.
		 *
		 * @example
		 * // Log all data written to the terminal for a command
		 * const command = term.shellIntegration.executeCommand({ commandLine: 'echo "Hello world"' });
		 * for await (const e of command.dataStream) {
		 *   console.log(e.data);
		 *   if (e.truncatedCount) {
		 *     console.warn(`Data was truncated by ${e.truncatedCount} characters`);
		 *   }
		 * }
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

	export interface Terminal {
		/**
		 * An object that contains [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)-powered
		 * features for the terminal. This will always be undefined immediately after the terminal
		 * is created. Listen to {@link window.onDidActivateTerminalShellIntegration} to be notified
		 * when shell integration is activated for a terminal.
		 */
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
		 * @param commandLine The command line to execute, this is the exact text that will be sent
		 * to the terminal.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidActivateTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const command = shellIntegration.executeCommand('echo "Hello world"');
		 *     const code = await command.exitCode;
		 *     console.log(`Command exited with code ${code}`);
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const command = term.shellIntegration.executeCommand({ commandLine });
		 *   const code = await command.exitCode;
		 *   console.log(`Command exited with code ${code}`);
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(commandLine: string): TerminalShellExecution;


		/**
		 * Execute a command, sending ^C as necessary to interrupt any running command if needed.
		 *
		 * *Note* This is not guaranteed to work as [shell integration](https://code.visualstudio.com/docs/terminal/shell-integration)
		 * must be activated. Check whether {@link TerminalShellExecution.exitCode} is rejected to
		 * verify whether it was successful.
		 *
		 * @param command A command to run.
		 * @param args Arguments to launch the executable with which will be automatically escaped
		 * based on the executable type.
		 *
		 * @example
		 * // Execute a command in a terminal immediately after being created
		 * const myTerm = window.createTerminal();
		 * window.onDidActivateTerminalShellIntegration(async ({ terminal, shellIntegration }) => {
		 *   if (terminal === myTerm) {
		 *     const command = shellIntegration.executeCommand({
		 *       command: 'echo',
		 *       args: ['Hello world']
		 *     });
		 *     const code = await command.exitCode;
		 *     console.log(`Command exited with code ${code}`);
		 *   }
		 * }));
		 * // Fallback to sendText if there is no shell integration within 3 seconds of launching
		 * setTimeout(() => {
		 *   if (!myTerm.shellIntegration) {
		 *     myTerm.sendText('echo "Hello world"');
		 *     // Without shell integration, we can't know when the command has finished or what the
		 *     // exit code was.
		 *   }
		 * }, 3000);
		 *
		 * @example
		 * // Send command to terminal that has been alive for a while
		 * const commandLine = 'echo "Hello world"';
		 * if (term.shellIntegration) {
		 *   const command = term.shellIntegration.executeCommand({
		 *     command: 'echo',
		 *     args: ['Hello world']
		 *   });
		 *   const code = await command.exitCode;
		 *   console.log(`Command exited with code ${code}`);
		 * } else {
		 *   term.sendText(commandLine);
		 *   // Without shell integration, we can't know when the command has finished or what the
		 *   // exit code was.
		 * }
		 */
		executeCommand(executable: string, args: string[]): TerminalShellExecution;
	}

	export interface TerminalShellIntegrationActivationEvent {
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
		 * Fires when shell integration activates or changes in a terminal.
		 */
		export const onDidChangeTerminalShellIntegration: Event<TerminalShellIntegrationActivationEvent>;

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
