/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { Disposable } from 'vs/base/common/lifecycle';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import type { IBoundingBox, IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/raster';
import { StringBuilder } from 'vs/editor/common/core/stringBuilder';
import { FontStyle, MetadataConsts, TokenMetadata } from 'vs/editor/common/encodedTokenAttributes';

const $rasterizedGlyph: IRasterizedGlyph = {
	source: null!,
	boundingBox: {
		left: 0,
		bottom: 0,
		right: 0,
		top: 0,
	},
	originOffset: {
		x: 0,
		y: 0,
	}
};
const $bbox = $rasterizedGlyph.boundingBox;

let nextId = 0;

export class GlyphRasterizer extends Disposable {
	/**
	 * A unique identifier for this rasterizer.
	 */
	public readonly id = nextId++;

	private _canvas: OffscreenCanvas;
	// A temporary context that glyphs are drawn to before being transfered to the atlas.
	private _ctx: OffscreenCanvasRenderingContext2D;

	constructor(
		private readonly _fontSize: number,
		private readonly _fontFamily: string,
	) {
		super();

		this._canvas = new OffscreenCanvas(this._fontSize * 3, this._fontSize * 3);
		this._ctx = ensureNonNullable(this._canvas.getContext('2d', {
			willReadFrequently: true
		}));
		this._ctx.textBaseline = 'top';
		this._ctx.fillStyle = '#FFFFFF';
	}

	// TODO: Support drawing multiple fonts and sizes
	// TODO: Should pull in the font size from config instead of random dom node
	/**
	 * Rasterizes a glyph. Note that the returned object is reused across different glyphs and
	 * therefore is only safe for synchronous access.
	 */
	public rasterizeGlyph(
		chars: string,
		metadata: number,
		colorMap: string[],
	): Readonly<IRasterizedGlyph> {
		metadata |= MetadataConsts.UNDERLINE_MASK;
		const fontStyle = TokenMetadata.getFontStyle(metadata);

		// TODO: Support workbench.fontAliasing
		const bgColor = colorMap[TokenMetadata.getBackground(metadata)];
		const fgColor = colorMap[TokenMetadata.getForeground(metadata)];

		this._ctx.fillStyle = bgColor;
		if (bgColor) {
			this._ctx.fillRect(0, 0, this._canvas.width, this._canvas.height);
		} else {
			this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
		}

		if (fontStyle & FontStyle.Underline) {
			this._ctx.fillStyle = fgColor;
			this._rasterizeUnderline();
		}

		const fontSb = new StringBuilder(200);
		if (fontStyle & FontStyle.Italic) {
			fontSb.appendString('italic ');
		}
		if (fontStyle & FontStyle.Bold) {
			fontSb.appendString('bold ');
		}
		fontSb.appendString(`${this._fontSize}px ${this._fontFamily}`);
		this._ctx.font = fontSb.build();

		// TODO: Support FontStyle.Strikethrough and FontStyle.Underline text decorations, these
		//       need to be drawn manually to the canvas. See xterm.js for "dodging" the text for
		//       underlines.

		// TODO: Draw in middle using alphabetical baseline
		const originX = this._fontSize;
		const originY = this._fontSize;


		if (fontStyle & FontStyle.Underline && this._fontSize >= 12 && bgColor) {
			this._ctx.save();
			this._ctx.lineWidth = getActiveWindow().devicePixelRatio * 3;
			this._ctx.strokeStyle = bgColor;
			this._ctx.strokeText(chars, originX, originY);
			this._ctx.restore();
		}





		this._ctx.fillStyle = fgColor;
		// TODO: This might actually be slower
		// const textMetrics = this._ctx.measureText(chars);
		this._ctx.fillText(chars, originX, originY);


		const imageData = this._ctx.getImageData(0, 0, this._canvas.width, this._canvas.height);
		function clearColor(imageData: ImageData, r: number, g: number, b: number, a: number) {
			console.log('clear', r, g, b, a);
			for (let i = 0; i < imageData.data.length; i += 4) {
				if (
					imageData.data[i + 0] === r &&
					imageData.data[i + 1] === g &&
					imageData.data[i + 2] === b &&
					imageData.data[i + 3] === a
				) {
					imageData.data[i + 0] = 0;
					imageData.data[i + 1] = 0;
					imageData.data[i + 2] = 0;
					imageData.data[i + 3] = 0;
				}
			}
		}
		if (bgColor) {
			const matchGroups = bgColor.match(/(?<r>[0-9a-f]{2})(?<g>[0-9a-f]{2})(?<b>[0-9a-f]{2})(?<a>[0-9a-f]{2})?/i)?.groups;
			if (matchGroups) {
				clearColor(imageData,
					parseInt(matchGroups.r, 16),
					parseInt(matchGroups.g, 16),
					parseInt(matchGroups.b, 16),
					matchGroups.a === undefined ? 0xFF : parseInt(matchGroups.a, 16)
				);
			}
		}

		this._ctx.putImageData(imageData, 0, 0);
		this._findGlyphBoundingBox(imageData, $rasterizedGlyph.boundingBox);
		// const offset = {
		// 	x: textMetrics.actualBoundingBoxLeft,
		// 	y: textMetrics.actualBoundingBoxAscent
		// };
		// const size = {
		// 	w: textMetrics.actualBoundingBoxRight + textMetrics.actualBoundingBoxLeft,
		// 	y: textMetrics.actualBoundingBoxDescent + textMetrics.actualBoundingBoxAscent,
		// 	wInt: Math.ceil(textMetrics.actualBoundingBoxRight + textMetrics.actualBoundingBoxLeft),
		// 	yInt: Math.ceil(textMetrics.actualBoundingBoxDescent + textMetrics.actualBoundingBoxAscent),
		// };
		// console.log(`${chars}_${fg}`, textMetrics, boundingBox, originX, originY, { width: boundingBox.right - boundingBox.left, height: boundingBox.bottom - boundingBox.top });
		$rasterizedGlyph.source = this._canvas;
		$rasterizedGlyph.originOffset.x = $bbox.left - originX;
		$rasterizedGlyph.originOffset.y = $bbox.top - originY;

		// const result2: IRasterizedGlyph = {
		// 	source: this._canvas,
		// 	boundingBox: {
		// 		left: Math.floor(originX - textMetrics.actualBoundingBoxLeft),
		// 		right: Math.ceil(originX + textMetrics.actualBoundingBoxRight),
		// 		top: Math.floor(originY - textMetrics.actualBoundingBoxAscent),
		// 		bottom: Math.ceil(originY + textMetrics.actualBoundingBoxDescent),
		// 	},
		// 	originOffset: {
		// 		x: Math.floor(boundingBox.left - originX),
		// 		y: Math.floor(boundingBox.top - originY)
		// 	}
		// };

		// DEBUG: Show image data in console
		// (console as any).image(imageData);

		// TODO: Verify result 1 and 2 are the same

		// if (result2.boundingBox.left > result.boundingBox.left) {
		// 	debugger;
		// }
		// if (result2.boundingBox.top > result.boundingBox.top) {
		// 	debugger;
		// }
		// if (result2.boundingBox.right < result.boundingBox.right) {
		// 	debugger;
		// }
		// if (result2.boundingBox.bottom < result.boundingBox.bottom) {
		// 	debugger;
		// }
		// if (JSON.stringify(result2.originOffset) !== JSON.stringify(result.originOffset)) {
		// 	debugger;
		// }

		return $rasterizedGlyph;
	}

	private _rasterizeUnderline(): void {
		this._ctx.fillRect(this._fontSize, this._fontSize * 2 - 2, this._fontSize, 1);
	}

	// TODO: Does this even need to happen when measure text is used?
	// TODO: Pass back origin offset
	private _findGlyphBoundingBox(imageData: ImageData, outBoundingBox: IBoundingBox) {
		// TODO: This could be optimized to be aware of the font size padding on all sides
		const height = this._canvas.height;
		const width = this._canvas.width;
		let found = false;
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.top = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.left = 0;
		found = false;
		for (let x = 0; x < width; x++) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.left = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.right = width;
		found = false;
		for (let x = width - 1; x >= outBoundingBox.left; x--) {
			for (let y = 0; y < height; y++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.right = x;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
		outBoundingBox.bottom = outBoundingBox.top;
		found = false;
		for (let y = height - 1; y >= 0; y--) {
			for (let x = 0; x < width; x++) {
				const alphaOffset = y * width * 4 + x * 4 + 3;
				if (imageData.data[alphaOffset] !== 0) {
					outBoundingBox.bottom = y;
					found = true;
					break;
				}
			}
			if (found) {
				break;
			}
		}
	}
}
