/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerTerminalAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';

const w = window as any;
if ('documentPictureInPicture' in w) {
	registerTerminalAction({
		id: TerminalCommandId.PictureInPicture,
		title: 'Picture In Picture',
		run: (c, _, args) => {
			const terminalElement = document.querySelector('.integrated-terminal');
			const terminalParent = terminalElement?.parentElement;
			if (!terminalElement || !terminalParent) {
				return;
			}

			w.documentPictureInPicture.requestWindow();
			const pip = w.documentPictureInPicture.window;
			const pipWindow = pip.window as Window;
			pipWindow.document.body.append(terminalElement);

			// Copy style sheets over from the initial document
			// so that the player looks the same.
			[...document.styleSheets].forEach((styleSheet) => {
				try {
					const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
					const style = document.createElement('style');

					style.textContent = cssRules;
					pipWindow.document.head.appendChild(style);
				} catch (e) {
					const link = document.createElement('link');

					link.rel = 'stylesheet';
					link.type = styleSheet.type;
					(link as any).media = styleSheet.media;
					(link as any).href = styleSheet.href;
					pipWindow.document.head.appendChild(link);
				}
			});

			// Move the player back when the Picture-in-Picture window closes.
			pipWindow.addEventListener('pagehide', (event) => {
				terminalParent.append(terminalElement);
			});
		}
	});
}
