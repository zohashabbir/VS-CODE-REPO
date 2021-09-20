/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/sidebarpart';
import { localize } from 'vs/nls';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { IWorkbenchLayoutService, Parts } from 'vs/workbench/services/layout/browser/layoutService';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IPaneCompositeService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { ViewContainerLocation } from 'vs/workbench/common/views';

export class FocusSideBarAction extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.focusSideBar',
			title: { value: localize('focusSideBar', "Focus into Side Bar"), original: 'Focus into Side Bar' },
			category: CATEGORIES.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				when: null,
				primary: KeyMod.CtrlCmd | KeyCode.KEY_0
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const layoutService = accessor.get(IWorkbenchLayoutService);
		const paneCompositeService = accessor.get(IPaneCompositeService);

		// Show side bar
		if (!layoutService.isVisible(Parts.SIDEBAR_PART)) {
			layoutService.setSideBarHidden(false);
			return;
		}

		// Focus into active viewlet
		const viewlet = paneCompositeService.getActivePaneComposite(ViewContainerLocation.Sidebar);
		if (viewlet) {
			viewlet.focus();
		}
	}
}

registerAction2(FocusSideBarAction);
