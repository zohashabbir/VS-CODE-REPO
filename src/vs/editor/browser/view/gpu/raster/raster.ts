/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IBoundingBox {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

export interface IRasterizedGlyph {
	source: OffscreenCanvas;
	/**
	 * The bounding box of the glyph within {@link source}.
	 */
	boundingBox: IBoundingBox;
	originOffset: { x: number; y: number };
}
