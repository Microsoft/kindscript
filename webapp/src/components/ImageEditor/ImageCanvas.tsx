import * as React from 'react';
import { connect } from 'react-redux';

import { ImageEditorStore, ImageEditorTool, AnimationState, TilemapState, TileDrawingMode } from './store/imageReducer';
import { dispatchImageEdit, dispatchLayerEdit, dispatchChangeZoom, dispatchChangeCursorLocation } from "./actions/dispatch";
import { GestureTarget, ClientCoordinates, bindGestureEvents } from './util';

import { Edit, EditState, getEdit, getEditState, ToolCursor, tools } from './toolDefinitions';


export interface ImageCanvasProps {
    dispatchImageEdit: (state: pxt.sprite.ImageState) => void;
    dispatchLayerEdit: (index: number, data: pxt.sprite.BitmapData) => void;
    dispatchChangeZoom: (zoom: number) => void;
    dispatchChangeCursorLocation: (loc: [number, number]) => void;
    selectedColor: number;
    backgroundColor: number;
    tool: ImageEditorTool;
    toolWidth: number;
    zoomDelta: number;
    onionSkinEnabled: boolean;
    isTilemap: boolean;
    drawingMode: TileDrawingMode;

    colors: string[];
    tilemapState?: TilemapState;
    imageState?: pxt.sprite.ImageState;
    prevFrame?: pxt.sprite.ImageState;
}

/**
 * This is a scaling factor for all of the pixels in the canvas. Scaling is not needed for browsers
 * that support "image-rendering: pixelated," so only scale for Microsoft Edge and Chrome on MacOS.
 *
 * Chrome on MacOS should be fixed in the next release: https://bugs.chromium.org/p/chromium/issues/detail?id=134040
 */
const SCALE = pxt.BrowserUtils.isEdge() ? 25 : 1;

class ImageCanvasImpl extends React.Component<ImageCanvasProps, {}> implements GestureTarget {
    protected canvas: HTMLCanvasElement;

    protected imageWidth: number;
    protected imageHeight: number;

    protected background: HTMLCanvasElement;
    protected floatingLayer: HTMLDivElement;
    protected canvasLayers: HTMLCanvasElement[];
    protected cellWidth: number;

    protected edit: Edit;
    protected editState: EditState;
    protected cursorLocation: [number, number];
    protected cursor: ToolCursor | string = ToolCursor.Crosshair;
    protected zoom = 2.5;
    protected panX = 0;
    protected panY = 0;

    protected lastPanX: number;
    protected lastPanY: number;

    protected tileCache: HTMLCanvasElement[] = [];

    render() {
        const imageState = this.getImageState();
        const isPortrait = !imageState || (imageState.bitmap.height > imageState.bitmap.width);

        return <div ref="canvas-bounds" className={`image-editor-canvas ${isPortrait ? "portrait" : "landscape"}`} onContextMenu={this.preventContextMenu}>
            <div className="paint-container">
                <canvas ref="paint-surface-bg" className="paint-surface" />
                <canvas ref="paint-surface" className="paint-surface" />
                <canvas ref="paint-surface-layer" className="paint-surface overlay" />
                <div ref="floating-layer-border" className="image-editor-floating-layer" />
            </div>
        </div>
    }

    componentDidMount() {
        this.cellWidth = this.props.isTilemap ? this.props.tilemapState.tileset.tileWidth : SCALE;
        this.canvas = this.refs["paint-surface"] as HTMLCanvasElement;
        this.background = this.refs["paint-surface-bg"] as HTMLCanvasElement;
        this.floatingLayer = this.refs["floating-layer-border"] as HTMLDivElement;
        this.canvasLayers = [this.refs["paint-surface-layer"] as HTMLCanvasElement];
        bindGestureEvents(this.refs["canvas-bounds"] as HTMLDivElement, this);
        // bindGestureEvents(this.floatingLayer, this);

        const canvasBounds = this.refs["canvas-bounds"] as HTMLDivElement;

        canvasBounds.addEventListener("wheel", ev => {
            this.updateZoom(ev.deltaY / 30, ev.clientX, ev.clientY);
            ev.preventDefault();
        });

        canvasBounds.addEventListener("mousemove", ev => {
            if (!this.edit) this.updateCursorLocation(ev);
        });

        canvasBounds.addEventListener("mouseout", ev => {
            if (!this.edit) this.updateCursorLocation(null);
        });

        const imageState = this.getImageState();
        this.editState = getEditState(imageState, this.props.isTilemap, this.props.drawingMode);

        this.redraw();
        this.updateBackground();
    }

    componentDidUpdate() {
        if (!this.edit || !this.editState) {
            const imageState = this.getImageState();
            this.editState = getEditState(imageState, this.props.isTilemap, this.props.drawingMode);
        }

        this.cellWidth = this.props.isTilemap ? SCALE * this.props.tilemapState.tileset.tileWidth : SCALE;

        if (this.props.zoomDelta || this.props.zoomDelta === 0) {
            // This is a total hack. Ideally, the zoom should be part of the global state but because
            // the mousewheel events fire very quickly it's much more performant to make it local state.
            // So, for buttons outside this component to change the zoom they have to set the zoom delta
            // which is applied here and then set back to null

            if (this.props.zoomDelta === 0) {
                this.zoomToCanvas();
            }
            else {
                this.updateZoom(this.props.zoomDelta)
            }
            this.props.dispatchChangeZoom(null);
            return;
        }

        this.redraw();
        this.updateBackground();
    }

    componentWillUnmount() {
        this.tileCache = [];
    }

    onClick(coord: ClientCoordinates, isRightClick?: boolean): void {
        if (this.isPanning()) return;

        this.updateCursorLocation(coord);

        if (!this.inBounds(this.cursorLocation[0], this.cursorLocation[1])) return;

        this.startEdit(!!isRightClick);
        this.updateEdit(this.cursorLocation[0], this.cursorLocation[1]);
        this.commitEdit();
    }

    onDragStart(coord: ClientCoordinates, isRightClick?: boolean): void {
        if (this.isPanning()) {
            this.lastPanX = coord.clientX;
            this.lastPanY = coord.clientY;
            this.updateCursor(true, false);
        }
        else {
            this.updateCursorLocation(coord);
            this.startEdit(!!isRightClick);
        }
    }

    onDragMove(coord: ClientCoordinates): void {
        if (this.isPanning() && this.lastPanX != undefined && this.lastPanY != undefined) {
            this.panX += this.lastPanX - coord.clientX;
            this.panY += this.lastPanY - coord.clientY;
            this.lastPanX = coord.clientX;
            this.lastPanY = coord.clientY;

            this.updateCursor(true, false);
        }
        else if (!this.edit) return;
        else if (this.updateCursorLocation(coord)) {
            this.updateEdit(this.cursorLocation[0], this.cursorLocation[1]);
        }
    }

    onDragEnd(coord: ClientCoordinates): void {
        if (this.isPanning() && this.lastPanX != undefined && this.lastPanY != undefined) {
            this.panX += this.lastPanX - coord.clientX;
            this.panY += this.lastPanY - coord.clientY;
            this.lastPanX = undefined;
            this.lastPanY = undefined;

            this.updateCursor(false, false);
        }
        else {
            if (!this.edit) return;
            if (this.updateCursorLocation(coord))
                this.updateEdit(this.cursorLocation[0], this.cursorLocation[1]);

            this.commitEdit();
        }
    }

    protected updateCursorLocation(coord: ClientCoordinates): boolean {
        if (!coord) {
            if (this.cursorLocation) {
                this.cursorLocation = null;
                this.props.dispatchChangeCursorLocation(null);
                if (!this.edit) this.redraw();
            }
            return false;
        }

        if (this.canvas) {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.floor(((coord.clientX - rect.left) / rect.width) * this.imageWidth);
            const y = Math.floor(((coord.clientY - rect.top) / rect.height) * this.imageHeight);

            if (!this.cursorLocation || x !== this.cursorLocation[0] || y !== this.cursorLocation[1]) {
                this.cursorLocation = [x, y];

                this.props.dispatchChangeCursorLocation((x < 0 || y < 0 || x >= this.imageWidth || y >= this.imageHeight) ? null : this.cursorLocation);

                if (!this.edit) this.redraw();

                this.updateCursor(!!this.edit, this.editState.inFloatingLayer(x, y));
                return true;
            }

            return false;
        }

        this.cursorLocation = [0, 0];
        return false;
    }

    protected updateCursor(isDown: boolean, inLayer: boolean) {
        const { tool } = this.props;
        const def = tools.find(td => td.tool === tool);

        if (!def) this.updateCursorCore(ToolCursor.Default)
        else if (inLayer) {
            if (isDown) {
                this.updateCursorCore(def.downLayerCursor || def.hoverLayerCursor || def.downCursor || def.hoverCursor);
            }
            else {
                this.updateCursorCore(def.hoverLayerCursor || def.hoverCursor);
            }
        }
        else if (isDown) {
            this.updateCursorCore(def.downCursor || def.hoverCursor);
        }
        else {
            this.updateCursorCore(def.hoverCursor);
        }
    }

    protected updateCursorCore(cursor: ToolCursor | string) {
        this.cursor = cursor || ToolCursor.Default;

        this.updateBackground();
    }

    protected startEdit(isRightClick: boolean) {
        const { tool, toolWidth, selectedColor, backgroundColor } = this.props;

        const [x, y] = this.cursorLocation;

        if (this.inBounds(x, y)) {
            this.edit = getEdit(tool, this.editState, isRightClick ? backgroundColor : selectedColor, toolWidth);
            this.edit.start(this.cursorLocation[0], this.cursorLocation[1], this.editState);
        }
    }

    protected updateEdit(x: number, y: number) {
        if (this.edit && this.edit.inBounds(x, y)) {
            this.edit.update(x, y);

            this.redraw();
        }
    }

    protected commitEdit() {
        const { dispatchImageEdit, dispatchLayerEdit, drawingMode } = this.props;
        const imageState = this.getImageState();

        if (this.edit) {
            this.editState = getEditState(imageState, this.props.isTilemap, this.props.drawingMode);
            this.edit.doEdit(this.editState);
            this.edit = undefined;

            if (drawingMode == TileDrawingMode.Wall) {
                dispatchLayerEdit(0, this.editState.overlayLayers[0].data());
            } else {
                dispatchImageEdit({
                    bitmap: this.editState.image.data(),
                    layerOffsetX: this.editState.layerOffsetX,
                    layerOffsetY: this.editState.layerOffsetY,
                    floatingLayer: this.editState.floatingLayer && this.editState.floatingLayer.data(),
                    overlayLayers: this.editState.overlayLayers.map(el => el.data())
                });
            }
        }
    }

    protected redraw() {
        const { prevFrame: nextFrame, onionSkinEnabled, selectedColor, toolWidth, drawingMode } = this.props;
        const imageState = this.getImageState();

        if (this.canvas) {
            this.imageWidth = imageState.bitmap.width;
            this.imageHeight = imageState.bitmap.height;

            this.canvas.width = imageState.bitmap.width * this.cellWidth;
            this.canvas.height = imageState.bitmap.height * this.cellWidth;
            this.canvasLayers[0].width = imageState.bitmap.width * this.cellWidth;
            this.canvasLayers[0].height = imageState.bitmap.height * this.cellWidth;

            if (onionSkinEnabled && nextFrame) {
                const next = getEditState(nextFrame, this.props.isTilemap, this.props.drawingMode);
                const context = this.canvas.getContext("2d");

                context.globalAlpha = 0.5;

                this.drawImage(next.image);
                if (next.floatingLayer) {
                    this.drawImage(next.floatingLayer, next.layerOffsetX, next.layerOffsetY, true);
                }

                context.globalAlpha = 1;
            }

            if (this.edit) {
                const clone = this.editState.copy();
                clone.setActiveLayer(this.props.drawingMode);
                this.edit.doEdit(clone);
                this.drawImage(clone.image);
                if (this.editState.overlayLayers && this.editState.overlayLayers[0]) this.drawBitmap(clone.overlayLayers[0], 0, 0, true, this.cellWidth, this.canvasLayers[0]);
                this.redrawFloatingLayer(clone);
            }
            else {
                this.drawImage(this.editState.image);
                if (this.editState.overlayLayers && this.editState.overlayLayers[0]) this.drawBitmap(this.editState.overlayLayers[0], 0, 0, true, this.cellWidth, this.canvasLayers[0]);
                this.redrawFloatingLayer(this.editState);

                if (this.cursorLocation && this.shouldDrawCursor()) {
                    // TODO switch cursor for wall mode
                    this.drawCursor(this.cursorLocation[0] - (toolWidth >> 1), this.cursorLocation[1] - (toolWidth >> 1), toolWidth, selectedColor );
                }
            }

            // Only redraw checkerboard if the image size has changed
            if (this.background.width != this.canvas.width << 1 || this.background.height != this.canvas.height << 1) {
                this.background.width = this.canvas.width << 1;
                this.background.height = this.canvas.height << 1;

                const ctx = this.background.getContext("2d");
                ctx.imageSmoothingEnabled = false;
                ctx.fillStyle = "#aeaeae";
                ctx.fillRect(0, 0, this.background.width, this.background.height);

                ctx.fillStyle = "#dedede";

                const bh = this.imageHeight << 1;
                const bw = this.imageWidth << 1;

                for (let x = 0; x < bw; x++) {
                    for (let y = 0; y < bh; y++) {
                        if ((x + y) & 1) {
                            ctx.fillRect(x * this.cellWidth, y * this.cellWidth, this.cellWidth, this.cellWidth);
                        }
                    }
                }
            }
        }
    }

    protected drawImage(bitmap: pxt.sprite.Bitmap, x0 = 0, y0 = 0, transparent = true) {
        if (this.props.isTilemap) this.drawTilemap(bitmap, x0, y0, transparent);
        else this.drawBitmap(bitmap, x0, y0, transparent);
    }

    protected redrawFloatingLayer(state: EditState, skipImage = false) {
        const floatingRect = this.refs["floating-layer-border"] as HTMLDivElement;
        if (state.floatingLayer) {
            if (!skipImage) this.drawImage(state.floatingLayer, state.layerOffsetX, state.layerOffsetY, true);

            const rect = this.canvas.getBoundingClientRect();

            const left = Math.max(state.layerOffsetX, 0)
            const top = Math.max(state.layerOffsetY, 0)
            const right = Math.min(state.layerOffsetX + state.floatingLayer.width, state.width);
            const bottom = Math.min(state.layerOffsetY + state.floatingLayer.height, state.height);

            const xScale = rect.width / state.width;
            const yScale = rect.height / state.height;

            floatingRect.style.display = ""

            if (right - left < 1 || bottom - top < 1) floatingRect.style.display = "none";

            floatingRect.style.left = (-this.panX + xScale * left) + "px";
            floatingRect.style.top = (-this.panY + yScale * top) + "px";
            floatingRect.style.width = (xScale * (right - left)) + "px";
            floatingRect.style.height = (yScale * (bottom - top)) + "px";

            floatingRect.style.borderLeft = left >= 0 ? "" : "none";
            floatingRect.style.borderTop = top >= 0 ? "" : "none";
            floatingRect.style.borderRight = right < state.width ? "" : "none";
            floatingRect.style.borderBottom = bottom < state.height ? "" : "none";
        }
        else {
            floatingRect.style.display = "none"
        }
    }

    protected drawBitmap(bitmap: pxt.sprite.Bitmap, x0 = 0, y0 = 0, transparent = true, cellWidth = this.cellWidth, target = this.canvas) {
        const { colors } = this.props;

        const context = target.getContext("2d");
        context.imageSmoothingEnabled = false;
        for (let x = 0; x < bitmap.width; x++) {
            for (let y = 0; y < bitmap.height; y++) {
                const index = bitmap.get(x, y);

                if (index) {
                    context.fillStyle = colors[index];
                    context.fillRect((x + x0) * cellWidth, (y + y0) * cellWidth, cellWidth, cellWidth);
                }
                else {
                    if (!transparent) context.clearRect((x + x0) * cellWidth, (y + y0) * cellWidth, cellWidth, cellWidth);
                }
            }
        }
    }

    protected generateTile(index: number, tileset: pxt.sprite.TileSet) {
        const tileImage = document.createElement("canvas");
        tileImage.width = tileset.tileWidth;
        tileImage.height = tileset.tileWidth;
        this.drawBitmap(pxt.sprite.Bitmap.fromData(tileset.tiles[index].data), 0, 0, true, 1, tileImage);
        this.tileCache[index] = tileImage;
        return tileImage;
    }

    protected drawTilemap(tilemap: pxt.sprite.Bitmap, x0 = 0, y0 = 0, transparent = true, target = this.canvas) {
        const { tilemapState: { tileset } } = this.props;

        const context = target.getContext("2d");
        let index: number;
        let tileImage: HTMLCanvasElement;

        context.imageSmoothingEnabled = false;
        for (let x = 0; x < tilemap.width; x++) {
            for (let y = 0; y < tilemap.height; y++) {
                index = tilemap.get(x, y);
                if (index) {
                    tileImage = this.tileCache[index];

                    if (!tileImage) {
                        tileImage = this.generateTile(index, tileset);
                    }

                    context.drawImage(tileImage,  (x + x0) * this.cellWidth,  (y + y0) * this.cellWidth);
                }
                else {
                    if (!transparent) context.clearRect((x + x0) * this.cellWidth, (y + y0) * this.cellWidth, this.cellWidth, this.cellWidth);
                }
            }
        }
    }

    protected drawCursor(left: number, top: number, width: number, color: number) {
        const context = this.canvas.getContext("2d");
        context.imageSmoothingEnabled = false;

        if (color) {
            if (this.props.isTilemap) {
                let tileImage = this.tileCache[color];
                if (!tileImage) {
                    tileImage = this.generateTile(color, this.props.tilemapState.tileset);
                }
                context.drawImage(tileImage,  left * this.cellWidth,  top * this.cellWidth);
            }
            else {
                context.fillStyle = this.props.colors[color]
                context.fillRect(left * this.cellWidth, top * this.cellWidth, width * this.cellWidth, width * this.cellWidth);
            }
        }
        else {
            context.clearRect(left * this.cellWidth, top * this.cellWidth, width * this.cellWidth, width * this.cellWidth);
        }
    }

    protected updateBackground() {
        (this.refs["canvas-bounds"] as HTMLDivElement).style.cursor = this.cursor;
        this.canvas.style.cursor = this.cursor;
        this.updateZoom(0);
    }

    protected updateZoom(delta: number, anchorX?: number, anchorY?: number) {
        const outer = this.refs["canvas-bounds"] as HTMLDivElement;
        if (this.canvas && outer) {
            const bounds = outer.getBoundingClientRect();

            anchorX = anchorX === undefined ? bounds.left + (bounds.width >> 1) : anchorX;
            anchorY = anchorY === undefined ? bounds.top + (bounds.height >> 1) : anchorY;

            const { canvasX: oldX, canvasY: oldY } = this.clientToCanvas(anchorX, anchorY, bounds);

            this.zoom = Math.max(this.zoom + delta, 2.5);

            const unit = this.getCanvasUnit(bounds);

            const { canvasX, canvasY } = this.clientToCanvas(anchorX, anchorY, bounds);

            if (isNaN(canvasX) || isNaN(canvasY) || isNaN(oldX) || isNaN(oldY)) {
                return;
            }

            this.panX += (oldX - canvasX) * unit;
            this.panY += (oldY - canvasY) * unit;

            this.applyZoom();
        }
    }

    protected zoomToCanvas() {
        this.zoom = 10;
        const outer = this.refs["canvas-bounds"] as HTMLDivElement;

        this.applyZoom();
        if (this.canvas && outer) {
            const bounds = outer.getBoundingClientRect();
            const canvasBounds = this.canvas.getBoundingClientRect();

            if (canvasBounds.width < bounds.width) {
                this.panX = -((bounds.width >> 1) - (canvasBounds.width >> 1));
            }

            if (canvasBounds.height < bounds.height) {
                this.panY = -((bounds.height >> 1) - (canvasBounds.height >> 1));
            }

        }
        this.applyZoom();
    }

    protected applyZoom(bounds?: ClientRect) {
        const outer = this.refs["canvas-bounds"] as HTMLDivElement;
        if (this.canvas && outer) {
            bounds = bounds || outer.getBoundingClientRect();

            const unit = this.getCanvasUnit(bounds);
            const newWidth = unit * this.imageWidth;
            const newHeight = unit * this.imageHeight;
            const minimumVisible = this.imageWidth > 1 && this.imageHeight > 1 ? unit * 2 : unit >> 1;

            this.panX = Math.max(Math.min(this.panX, newWidth - minimumVisible), -(bounds.width - minimumVisible));
            this.panY = Math.max(Math.min(this.panY, newHeight - minimumVisible), -(bounds.height - minimumVisible));

            this.canvas.style.position = "fixed"
            this.canvas.style.width = `${newWidth}px`;
            this.canvas.style.height = `${newHeight}px`;
            this.canvas.style.left = `${-this.panX}px`
            this.canvas.style.top = `${-this.panY}px`

            this.canvas.style.clipPath =  `polygon(${this.panX}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY + bounds.height}px, ${this.panX}px ${this.panY + bounds.height}px)`;
            // this.canvas.style.imageRendering = "pixelated"

            this.background.style.position = this.canvas.style.position;
            this.background.style.width = this.canvas.style.width;
            this.background.style.height = this.canvas.style.height;
            this.background.style.left = this.canvas.style.left;
            this.background.style.top = this.canvas.style.top;
            this.background.style.clipPath =  `polygon(${this.panX}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY + bounds.height}px, ${this.panX}px ${this.panY + bounds.height}px)`;

            // todo generalize
            this.canvasLayers[0].style.position = "fixed"
            this.canvasLayers[0].style.width = `${newWidth}px`;
            this.canvasLayers[0].style.height = `${newHeight}px`;
            this.canvasLayers[0].style.left = `${-this.panX}px`;
            this.canvasLayers[0].style.top = `${-this.panY}px`;
            this.canvasLayers[0].style.clipPath =  `polygon(${this.panX}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY}px, ${this.panX + bounds.width}px ${this.panY + bounds.height}px, ${this.panX}px ${this.panY + bounds.height}px)`;
            
            this.redrawFloatingLayer(this.editState, true);
        }
    }

    protected clientToCanvas(clientX: number, clientY: number, bounds: ClientRect) {
        const unit = this.getCanvasUnit(bounds);

        return {
            canvasX: ((clientX - bounds.left + this.panX) / unit),
            canvasY: ((clientY - bounds.top + this.panY) / unit)
        }
    }

    /**
     * Gets the pixel side-length for canvas to fit in the bounds at a zoom of 1
     * @param bounds The bounds in which the canvas is contained
     */
    protected getCanvasUnit(bounds: ClientRect) {
        const boundsRatio = bounds.width / bounds.height;
        const imageRatio = this.imageWidth / this.imageHeight;
        const zm = Math.pow(this.zoom / 10, 2);

        if (boundsRatio > imageRatio) {
            return zm * (bounds.height / this.imageHeight);
        }
        else {
            return zm * (bounds.width / this.imageWidth);
        }
    }

    protected inBounds(x: number, y: number) {
        return x >= 0 && x < this.imageWidth && y >= 0 && y < this.imageHeight;
    }

    protected isPanning() {
        return this.props.tool === ImageEditorTool.Pan;
    }

    protected preventContextMenu = (ev: React.MouseEvent<any>) => ev.preventDefault();

    protected shouldDrawCursor() {
        switch (this.props.tool) {
            case ImageEditorTool.Fill:
            case ImageEditorTool.Marquee:
            case ImageEditorTool.Pan:
            case ImageEditorTool.ColorSelect:
                return false;
            default:
                return true;
        }
    }

    protected getImageState(): pxt.sprite.ImageState {
        return this.props.isTilemap ? this.props.tilemapState.tilemap : this.props.imageState;
    }
}


function mapStateToProps({ store: { present }, editor }: ImageEditorStore, ownProps: any) {
    if (editor.isTilemap) {
        let state = (present as TilemapState);
        if (!state) return {};
        return {
            selectedColor: editor.selectedColor,
            tilemapState: state,
            tool: editor.tool,
            toolWidth: editor.cursorSize,
            zoomDelta: editor.zoomDelta,
            onionSkinEnabled: false,
            backgroundColor: editor.backgroundColor,
            colors: state.colors,
            isTilemap: editor.isTilemap,
            drawingMode: editor.drawingMode
        };
    }

    let state = (present as AnimationState);
    if (!state) return {};

    return {
        selectedColor: editor.selectedColor,
        colors: state.colors,
        imageState: state.frames[state.currentFrame],
        tool: editor.tool,
        toolWidth: editor.cursorSize,
        zoomDelta: editor.zoomDelta,
        onionSkinEnabled: editor.onionSkinEnabled,
        backgroundColor: editor.backgroundColor,
        prevFrame: state.frames[state.currentFrame - 1],
        isTilemap: editor.isTilemap
    };
}

const mapDispatchToProps = {
    dispatchImageEdit,
    dispatchLayerEdit,
    dispatchChangeCursorLocation,
    dispatchChangeZoom
};

export const ImageCanvas = connect(mapStateToProps, mapDispatchToProps)(ImageCanvasImpl);
