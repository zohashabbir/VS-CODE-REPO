/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener } from '../../../base/browser/dom.js';
import { DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { localize } from '../../../nls.js';

export async function getScreenshotAsVariable(): Promise<IScreenshotVariableEntry | undefined> {
	const screenshot = await generateFocusedWindowScreenshot();
	if (!screenshot) {
		return;
	}

	return {
		id: 'screenshot-focused-window',
		name: localize('screenshot', 'Screenshot'),
		value: new Uint8Array(screenshot),
		isImage: true,
		isDynamic: true
	};
}

export async function generateFocusedWindowScreenshot(): Promise<ArrayBuffer | undefined> {
	try {
		return takeScreenshotOfDisplay();
	} catch (err) {
		console.error('Error taking screenshot:', err);
		return undefined;
	}
}
async function takeScreenshotOfDisplay(): Promise<ArrayBuffer | undefined> {
	const store = new DisposableStore();

	// Create a video element to play the captured screen or window source
	const video = document.createElement('video');
	store.add(toDisposable(() => video.remove()));
	let stream: MediaStream | undefined;

	try {
		// Capture the display or window without audio
		stream = await navigator.mediaDevices.getDisplayMedia({
			audio: false,
			video: true
		});

		// Set the stream as the source of the video element
		video.srcObject = stream;
		video.play();

		// Wait for the video to load properly before capturing the screenshot
		await Promise.all([
			new Promise<void>(r => store.add(addDisposableListener(video, 'loadedmetadata', () => r()))),
			new Promise<void>(r => store.add(addDisposableListener(video, 'canplaythrough', () => r())))
		]);

		// Create a canvas element with the size of the captured video
		const canvas = document.createElement('canvas');

		// Use videoWidth and videoHeight to get the actual size of the video stream
		canvas.width = video.videoWidth;
		canvas.height = video.videoHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) {
			return undefined;
		}

		// Draw the entire video frame into the canvas
		ctx.drawImage(video,
			0, 0, video.videoWidth, video.videoHeight,  // Source (entire video)
			0, 0, video.videoWidth, video.videoHeight   // Destination (entire canvas)
		);

		// Convert the canvas to a Blob (JPEG format), use .95 for quality
		const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.95));
		if (!blob) {
			throw new Error('Failed to create blob from canvas');
		}

		// Convert the Blob to an ArrayBuffer
		return blob.arrayBuffer();

	} catch (error) {
		console.error('Error taking screenshot:', error);
		return undefined;
	} finally {
		store.dispose();
		if (stream) {
			for (const track of stream.getTracks()) {
				track.stop();
			}
		}
	}
}

interface IScreenshotVariableEntry {
	id: string;
	name: string;
	value: Uint8Array;
	isDynamic?: boolean;
	isImage?: boolean;
}
