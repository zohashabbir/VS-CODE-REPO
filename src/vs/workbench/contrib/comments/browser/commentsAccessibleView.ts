/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { MarshalledId } from 'vs/base/common/marshallingIds';
import { ServicesAccessor } from 'vs/editor/browser/editorExtensions';
import { AccessibleViewProviderId, AccessibleViewType, IAccessibleViewService } from 'vs/platform/accessibility/browser/accessibleView';
import { IAccessibleViewImplentation } from 'vs/platform/accessibility/browser/accessibleViewRegistry';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { AccessibilityVerbositySettingId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { COMMENTS_VIEW_ID, CommentsMenus } from 'vs/workbench/contrib/comments/browser/commentsTreeViewer';
import { CommentsPanel, CONTEXT_KEY_HAS_COMMENTS } from 'vs/workbench/contrib/comments/browser/commentsView';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export class CommentsAccessibleView extends Disposable implements IAccessibleViewImplentation {
	readonly priority = 90;
	readonly name = 'comment';
	readonly when = CONTEXT_KEY_HAS_COMMENTS;
	readonly type = AccessibleViewType.View;
	implementation(accessor: ServicesAccessor) {
		const accessibleViewService = accessor.get(IAccessibleViewService);
		const contextKeyService = accessor.get(IContextKeyService);
		const viewsService = accessor.get(IViewsService);
		const menuService = accessor.get(IMenuService);
		const commentsView = viewsService.getActiveViewWithId<CommentsPanel>(COMMENTS_VIEW_ID);
		if (!commentsView) {
			return false;
		}
		const menus = this._register(new CommentsMenus(menuService));
		menus.setContextKeyService(contextKeyService);

		function renderAccessibleView() {
			if (!commentsView) {
				return false;
			}

			const commentNode = commentsView.focusedCommentNode;
			const content = commentsView.focusedCommentInfo?.toString();
			if (!commentNode || !content) {
				return false;
			}
			const menuActions = [...menus.getResourceContextActions(commentNode)].filter(i => i.enabled);
			const actions = menuActions.map(action => {
				return {
					...action,
					run: () => {
						commentsView.focus();
						action.run({
							thread: commentNode.thread,
							$mid: MarshalledId.CommentThread,
							commentControlHandle: commentNode.controllerHandle,
							commentThreadHandle: commentNode.threadHandle,
						});
					}
				};
			});
			accessibleViewService.show({
				id: AccessibleViewProviderId.Notification,
				provideContent: () => {
					return content;
				},
				onClose(): void {
					commentsView.focus();
				},
				next(): void {
					commentsView.focus();
					commentsView.focusNextNode();
					renderAccessibleView();
				},
				previous(): void {
					commentsView.focus();
					commentsView.focusPreviousNode();
					renderAccessibleView();
				},
				verbositySettingKey: AccessibilityVerbositySettingId.Comments,
				options: { type: AccessibleViewType.View },
				actions
			});
			return true;
		}
		return renderAccessibleView();
	}
	constructor() {
		super();
	}
}
