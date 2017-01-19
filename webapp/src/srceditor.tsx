import * as pkg from "./package";
import * as core from "./core";
import * as data from "./data";
import * as app from "./app";
import * as React from "react";


export type ViewState = any;
export type ProjectView = app.ProjectView;

export interface ParentProps {
    parent: ProjectView;
}

export class Editor {
    protected currSource: string;
    isVisible = false;
    constructor(public parent: ProjectView) {
    }
    changeCallback = () => { };
    setVisible(v: boolean) {
        this.isVisible = v;
    }

    /*******************************
     Methods called before loadFile
      this.editor may be undefined
      Always check that this.editor exists
    *******************************/

    acceptsFile(file: pkg.File) {
        return false
    }

    getId() {
        return "editor"
    }

    displayOuter() {
        return (
            <div className='full-abs' key={this.getId() } id={this.getId() } style={{ display: this.isVisible ? "block" : "none" }}>
                {this.display() }
            </div>
        )
    }
    display(): JSX.Element {
        return null
    }

    isReady = false;
    prepare() {
        this.isReady = true;
    }

    resize(e?: Event) { }

    snapshotState(): any {
        return null
    }
    unloadFile() { }

    isIncomplete() {
        return false
    }

    /*******************************
     loadFile
    *******************************/

    loadFile(file: pkg.File): void {
        this.currSource = file.content
        this.setDiagnostics(file, this.snapshotState())
    }

    /*******************************
     Methods called after loadFile
      this.editor != undefined
    *******************************/

    getViewState(): ViewState {
        return {}
    }
    getCurrentSource(): string {
        return this.currSource
    }

    domUpdate() { }

    setDiagnostics(file: pkg.File, snapshot: any): void { }
    setViewState(view: ViewState): void { }

    hasUndo() { return true; }
    hasRedo() { return true; }
    undo() { }
    redo() { }

    zoomIn() { }
    zoomOut() { }

    saveToTypeScript(): string {
        return null
    }

    beforeCompile() { }
    highlightStatement(brk: pxtc.LocationInfo) { }

    filterToolbox(blockSubset?: { [index: string]: number }, showCategories: boolean = true, showToolboxButtons: boolean = true): Element {
        return null
    }
}
