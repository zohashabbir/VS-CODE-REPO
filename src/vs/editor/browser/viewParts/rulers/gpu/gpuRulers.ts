/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { GPULifecycle } from 'vs/editor/browser/view/gpu/gpuDisposable';
import { observeDevicePixelDimensions } from 'vs/editor/browser/view/gpu/gpuUtils';
import type { RenderingContext, RestrictedRenderingContext } from 'vs/editor/browser/view/renderingContext';
import { ViewPart } from 'vs/editor/browser/view/viewPart';
import { EditorOption, type IRulerOption } from 'vs/editor/common/config/editorOptions';
import * as viewEvents from 'vs/editor/common/viewEvents';
import type { ViewContext } from 'vs/editor/common/viewModel/viewContext';

const enum BindingId {
	Uniforms,
	Rulers,
}

const wgsl =/* wgsl */ `
struct Uniforms {
	canvasDimensions: vec2f,
};

struct Ruler {
	position: vec2f,
};

struct Vertex {
	@location(0) position: vec2f,
};

struct VSOutput {
	@builtin(position) position: vec4f,
};

@group(0) @binding(${BindingId.Uniforms}) var<uniform> uniforms: Uniforms;
@group(0) @binding(${BindingId.Rulers}) var<storage, read> rulers: array<Ruler>;

@vertex fn vs(
	vert: Vertex,
	@builtin(instance_index) instanceIndex: u32,
	@builtin(vertex_index) vertexIndex : u32
) -> VSOutput {
	let ruler = rulers[instanceIndex];
	var vsOut: VSOutput;
	// Multiple vert.position by 2,-2 to get it into clipspace which ranged from -1 to 1
	vsOut.position = vec4f(
		((vert.position * vec2f(2, -2)) * 100 / uniforms.canvasDimensions),
		0.0,
		1.0
	);
	return vsOut;
}

@fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
	return vec4f(1.0, 0.0, 0.0, 1.0);
}
`;

export class GpuRulers extends ViewPart {

	private _device!: GPUDevice;
	private _pipeline!: GPURenderPipeline;
	private _bindGroup!: GPUBindGroup;
	private _renderPassDescriptor!: GPURenderPassDescriptor;
	private _renderPassColorAttachment!: GPURenderPassColorAttachment;
	private _rulersBuffer!: GPUBuffer;

	private _quadBuffer!: GPUBuffer;
	private _quadVertices!: { vertexData: Float32Array; numVertices: number };

	private _initialized = false;

	private _rulers: IRulerOption[];
	private _typicalHalfwidthCharacterWidth: number;

	constructor(context: ViewContext) {
		super(context);
		// this._renderedRulers = [];
		const options = this._context.configuration.options;
		this._rulers = options.get(EditorOption.rulers);
		this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;

		this.initWebgpu();
	}

	public override dispose(): void {
		super.dispose();
	}

	public async initWebgpu(): Promise<void> {
		const canvas = this._context.gpuCanvas;
		const ctx = this._context.gpuCtx;
		const device = this._device = await this._context.gpuDevice;

		const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
		ctx.configure({
			device,
			format: presentationFormat,
			alphaMode: 'premultiplied',
		});

		const module = device.createShaderModule({
			label: 'Monaco viewPart/rulers shader module',
			code: wgsl,
		});

		this._pipeline = device.createRenderPipeline({
			label: 'Monaco viewPart/rulers render pipeline',
			layout: 'auto',
			vertex: {
				module,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 2 * Float32Array.BYTES_PER_ELEMENT, // 2 floats, 4 bytes each
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x2' },  // position
						],
					}
				]
			},
			fragment: {
				module,
				entryPoint: 'fs',
				targets: [
					{
						format: presentationFormat,
						blend: {
							color: {
								srcFactor: 'src-alpha',
								dstFactor: 'one-minus-src-alpha'
							},
							alpha: {
								srcFactor: 'src-alpha',
								dstFactor: 'one-minus-src-alpha'
							},
						},
					}
				],
			},
		});

		const enum UniformBufferInfo {
			FloatsPerEntry = 2,
			BytesPerEntry = UniformBufferInfo.FloatsPerEntry * 4,
			Offset_CanvasWidth = 0,
			Offset_CanvasHeight = 1
		}
		const uniformBufferValues = new Float32Array(UniformBufferInfo.FloatsPerEntry);
		// TODO: Add component label to createBuffer args
		const uniformBuffer = this._register(GPULifecycle.createBuffer(device, {
			label: 'Monaco viewPart/rulers uniform buffer',
			size: UniformBufferInfo.BytesPerEntry,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		}, () => {
			uniformBufferValues[UniformBufferInfo.Offset_CanvasWidth] = canvas.width;
			uniformBufferValues[UniformBufferInfo.Offset_CanvasHeight] = canvas.height;
			return uniformBufferValues;
		})).value;
		this._register(observeDevicePixelDimensions(canvas, getActiveWindow(), (width, height) => {
			uniformBufferValues[UniformBufferInfo.Offset_CanvasWidth] = width;
			uniformBufferValues[UniformBufferInfo.Offset_CanvasHeight] = height;
			device.queue.writeBuffer(uniformBuffer, 0, uniformBufferValues);
		}));

		const enum RulerStorageBufferInfo {
			FloatsPerEntry = 2,
			BytesPerEntry = RulerStorageBufferInfo.FloatsPerEntry * 4,
			Offset_Position = 0,
		}
		this._rulersBuffer = this._register(GPULifecycle.createBuffer(device, {
			label: 'Monaco viewPart/rulers ruler storage buffer',
			size: RulerStorageBufferInfo.BytesPerEntry * 5/* TODO: Dynamic max? */,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		})).value;
		this._device.queue.writeBuffer(this._rulersBuffer, 0, new Float32Array([100, 100, 0, 0, 0, 0, 0, 0, 0, 0]));

		this._quadVertices = {
			vertexData: new Float32Array([
				1, 0,
				1, 1,
				0, 1,
				0, 0,
				0, 1,
				1, 0,
			]),
			numVertices: 6
		};
		this._quadBuffer = this._register(GPULifecycle.createBuffer(this._device, {
			label: 'Monaco viewPart/rulers quad vertex buffer',
			size: this._quadVertices.vertexData.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
		}, this._quadVertices.vertexData)).value;

		this._bindGroup = this._device.createBindGroup({
			label: 'Monaco viewPart/rulers bind group',
			layout: this._pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: BindingId.Uniforms, resource: { buffer: uniformBuffer } },
				{ binding: BindingId.Rulers, resource: { buffer: this._rulersBuffer } },
			],
		});

		this._renderPassColorAttachment = {
			view: null!, // Will be filled at render time
			loadOp: 'load',
			storeOp: 'store',
		};
		this._renderPassDescriptor = {
			label: 'Monaco viewPart/rulers render pass',
			colorAttachments: [this._renderPassColorAttachment],
		};

		this._initialized = true;
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		this._rulers = options.get(EditorOption.rulers);
		this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollHeightChanged;
	}

	// --- end event handlers

	public override prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		console.log('render gpuRulers');
		if (!this._initialized) {
			return;
		}
		// TODO: Write correct values
		this._device.queue.writeBuffer(this._rulersBuffer, 0, new Float32Array([100, 100, 0, 0, 0, 0, 0, 0, 0, 0]));

		// for (let i = 0, len = this._rulers.length; i < len; i++) {
		// 	// const node = this._renderedRulers[i];
		// 	// const ruler = this._rulers[i];

		// 	// node.setBoxShadow(ruler.color ? `1px 0 0 0 ${ruler.color} inset` : ``);
		// 	// node.setHeight(Math.min(ctx.scrollHeight, 1000000));
		// 	// node.setLeft(ruler.column * this._typicalHalfwidthCharacterWidth);
		// }

		const encoder = this._context.gpuEncoder!;// this._device.createCommandEncoder({ label: 'Monaco command encoder' });

		this._renderPassColorAttachment.view = this._context.gpuCtx.getCurrentTexture().createView({ label: 'Monaco viewPart/rulers canvas texture view' });
		const pass = encoder.beginRenderPass(this._renderPassDescriptor);
		pass.setPipeline(this._pipeline);
		pass.setVertexBuffer(0, this._quadBuffer);

		pass.setBindGroup(0, this._bindGroup);
		pass.draw(this._quadVertices.numVertices, 1);

		pass.end();

		const commandBuffer = encoder.finish();

		this._device.queue.submit([commandBuffer]);
	}
}
