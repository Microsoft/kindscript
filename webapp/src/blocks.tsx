/// <reference path="../../built/blockly.d.ts" />
/// <reference path="../../typings/jquery/jquery.d.ts" />

import * as React from "react";
import * as pkg from "./package";
import * as core from "./core";
import * as srceditor from "./srceditor"
import * as compiler from "./compiler"
import * as sui from "./sui";
import * as data from "./data";
import defaultToolbox from "./toolbox"

import Util = pxt.Util;
let lf = Util.lf

export class Editor extends srceditor.Editor {
    editor: Blockly.Workspace;
    delayLoadXml: string;
    loadingXml: boolean;
    blockInfo: pxtc.BlocksInfo;
    compilationResult: pxt.blocks.BlockCompilationResult;
    isFirstBlocklyLoad = true;
    currentCommentOrWarning: B.Comment | B.Warning;
    selectedEventGroup: string;
    currentHelpCardType: string;
    diagnosticsOutOfDate = false;

    setVisible(v: boolean) {
        super.setVisible(v);
        this.isVisible = v;
        let classes = '.blocklyToolboxDiv, .blocklyWidgetDiv, .blocklyToolboxDiv';
        if (this.isVisible) {
            $(classes).show();
            // Fire a resize event since the toolbox may have changed width and height.
            this.parent.fireResize();
        }
        else $(classes).hide();
    }

    saveToTypeScript(): string {
        this.editor.getAllBlocks().filter(b => !b.disabled).forEach(b => b.setWarningText(null));
        this.diagnosticsOutOfDate = false;

        try {
            this.compilationResult = pxt.blocks.compile(this.editor, this.blockInfo);
            return this.compilationResult.source;
        } catch (e) {
            pxt.reportException(e)
            core.errorNotification(lf("Sorry, we were not able to convert this program."))
            return '';
        }
    }

    domUpdate() {
        if (this.delayLoadXml) {
            if (this.loadingXml) return
            this.loadingXml = true

            let loading = document.createElement("div");
            loading.className = "ui inverted loading";
            let editorArea = document.getElementById('blocksArea');
            let editorDiv = document.getElementById("blocksEditor");
            editorDiv.appendChild(loading);

            let promise = compiler.getBlocksAsync()
                .finally(() => { this.loadingXml = false })
                .then(bi => {
                    this.blockInfo = bi;
                    let tb = pxt.blocks.initBlocks(this.blockInfo, this.editor, defaultToolbox.documentElement)
                    pxt.blocks.initToolboxButtons($(".blocklyToolboxDiv").get(0), 'blocklyToolboxButtons',
                        (pxt.appTarget.cloud.packages && !this.parent.getSandboxMode() ?
                            (() => {
                                this.parent.addPackage();
                            }) : null),
                        (!this.parent.getSandboxMode() ?
                            (() => {
                                this.undo();
                            }) : null)
                    );
                    pxt.blocks.initSearch(this.editor, tb,
                        searchFor => compiler.apiSearchAsync(searchFor)
                            .then((fns: pxtc.SymbolInfo[]) => fns));

                    let xml = this.delayLoadXml;
                    this.delayLoadXml = undefined;
                    this.loadBlockly(xml);

                    this.resize();
                    Blockly.svgResize(this.editor);
                    this.isFirstBlocklyLoad = false;
                }).finally(() => {
                    editorDiv.removeChild(loading);
                });

            if (this.isFirstBlocklyLoad) {
                core.showLoadingAsync(lf("loading..."), promise).done();
            } else {
                promise.done();
            }
        }
    }

    saveBlockly(): string {
        // make sure we don't return an empty document before we get started
        // otherwise it may get saved and we're in trouble
        if (this.delayLoadXml) return this.delayLoadXml;
        return this.serializeBlocks();
    }

    serializeBlocks(normalize?: boolean): string {
        let xml = pxt.blocks.saveWorkspaceXml(this.editor);
        // strip out id, x, y attributes
        if (normalize) xml = xml.replace(/(x|y|id)="[^"]*"/g, '')
        pxt.debug(xml)
        return xml;
    }

    loadBlockly(s: string): boolean {
        if (this.serializeBlocks() == s) {
            pxt.debug('blocks already loaded...');
            return false;
        }

        this.editor.clear();
        try {
            const text = pxt.blocks.importXml(s || `<xml xmlns="http://www.w3.org/1999/xhtml"></xml>`, this.blockInfo, true);
            const xml = Blockly.Xml.textToDom(text);
            Blockly.Xml.domToWorkspace(xml, this.editor);

            this.initLayout();
            this.editor.clearUndo();
            this.reportDeprecatedBlocks();
        } catch (e) {
            pxt.log(e);
        }

        this.changeCallback();

        return true;
    }

    private initLayout() {
        // layout on first load if no data info
        const needsLayout = this.editor.getTopBlocks(false).some(b => {
            const tp = b.getBoundingRectangle().topLeft;
            return tp.x == 0 && tp.y == 0
        });
        if (needsLayout)
            pxt.blocks.layout.flow(this.editor);
    }

    private initPrompts() {
        // Overriding blockly prompts to use semantic modals

        /**
         * Wrapper to window.alert() that app developers may override to
         * provide alternatives to the modal browser window.
         * @param {string} message The message to display to the user.
         * @param {function()=} opt_callback The callback when the alert is dismissed.
         */
        Blockly.alert = function (message, opt_callback) {
            return core.dialogAsync({
                hideCancel: true,
                header: lf("Alert"),
                body: message,
                size: "small"
            }).then(() => {
                if (opt_callback) {
                    opt_callback();
                }
            })
        };

        /**
         * Wrapper to window.confirm() that app developers may override to
         * provide alternatives to the modal browser window.
         * @param {string} message The message to display to the user.
         * @param {!function(boolean)} callback The callback for handling user response.
         */
        Blockly.confirm = function (message, callback) {
            return core.confirmAsync({
                header: lf("Confirm"),
                body: message,
                agreeLbl: lf("Yes"),
                agreeClass: "cancel",
                agreeIcon: "cancel",
                disagreeLbl: lf("No"),
                disagreeClass: "positive",
                disagreeIcon: "checkmark",
                size: "small"
            }).then(b => {
                callback(b == 0);
            })
        };

        /**
         * Wrapper to window.prompt() that app developers may override to provide
         * alternatives to the modal browser window. Built-in browser prompts are
         * often used for better text input experience on mobile device. We strongly
         * recommend testing mobile when overriding this.
         * @param {string} message The message to display to the user.
         * @param {string} defaultValue The value to initialize the prompt with.
         * @param {!function(string)} callback The callback for handling user reponse.
         */
        Blockly.prompt = function (message, defaultValue, callback) {
            return core.promptAsync({
                header: message,
                defaultValue: defaultValue,
                agreeLbl: lf("Ok"),
                disagreeLbl: lf("Cancel"),
                size: "small"
            }).then(value => {
                callback(value);
            })
        };
    }

    private reportDeprecatedBlocks() {
        const deprecatedMap: pxt.Map<number> = {};
        let deprecatedBlocksFound = false;

        this.blockInfo.blocks.forEach(symbolInfo => {
            if (symbolInfo.attributes.deprecated) {
                deprecatedMap[symbolInfo.attributes.blockId] = 0;
            }
        });

        this.editor.getAllBlocks().forEach(block => {
            if (deprecatedMap[block.type] >= 0) {
                deprecatedMap[block.type]++;
                deprecatedBlocksFound = true;
            }
        });

        for (const block in deprecatedMap) {
            if (deprecatedMap[block] === 0) {
                delete deprecatedMap[block];
            }
        }

        if (deprecatedBlocksFound) {
            pxt.tickEvent("blocks.usingDeprecated", deprecatedMap);
        }
    }

    updateHelpCard(clear?: boolean) {
        let selected = Blockly.selected;
        let selectedType = selected ? selected.type : null;
        if (selectedType != this.currentHelpCardType || clear) {
            if (selected && selected.inputList && selected.codeCard && !clear) {
                this.currentHelpCardType = selectedType;
                //Unfortunately Blockly doesn't provide an API for getting all of the fields of a blocks
                let props: any = {};
                for (let i = 0; i < selected.inputList.length; i++) {
                    let input = selected.inputList[i];
                    for (let j = 0; j < input.fieldRow.length; j++) {
                        let field = input.fieldRow[j];
                        if (field.name != undefined && field.value_ != undefined) {
                            props[field.name] = field.value_;
                        }
                    }
                }

                let card: pxt.CodeCard = selected.codeCard;
                card.description = goog.isFunction(selected.tooltip) ? selected.tooltip() : selected.tooltip;
                if (!selected.mutation) {
                    card.blocksXml = this.updateFields(card.blocksXml, props);
                }
                else {
                    card.blocksXml = this.updateFields(card.blocksXml, undefined, selected.mutation.mutationToDom());
                }
                this.parent.setHelpCard(card);
            }
            else {
                this.currentHelpCardType = null;
                this.parent.setHelpCard(null);
            }
        }
    }

    contentSize(): { height: number; width: number } {
        if (this.editor) {
            return pxt.blocks.blocksMetrics(this.editor);
        }
        return undefined;
    }

    /**
     * Takes the XML definition of the block that will be shown on the help card and modifies the XML
     * so that the field names are updated to match any field names of dropdowns on the selected block
     */
    private updateFields(originalXML: string, newFieldValues?: any, mutation?: Element): string {
        let parser = new DOMParser();
        let doc = parser.parseFromString(originalXML, "application/xml");
        let blocks = doc.getElementsByTagName("block");
        if (blocks.length >= 1) {
            //Setting innerText doesn't work if there are no children on the node
            let setInnerText = (c: any, newValue: string) => {
                //Remove any existing children
                while (c.firstChild) {
                    c.removeChild(c.firstChild);
                }
                let tn = doc.createTextNode(newValue);
                c.appendChild(tn)
            };

            let block = blocks[0];

            if (newFieldValues) {
                //Depending on the source, the nodeName may be capitalised
                let fieldNodes = Array.prototype.filter.call(block.childNodes, (c: any) => c.nodeName == 'field' || c.nodeName == 'FIELD');

                for (let i = 0; i < fieldNodes.length; i++) {
                    if (newFieldValues.hasOwnProperty(fieldNodes[i].getAttribute('name'))) {
                        setInnerText(fieldNodes[i], newFieldValues[fieldNodes[i].getAttribute('name')]);
                        delete newFieldValues[fieldNodes[i].getAttribute('name')];
                    }
                }

                //Now that existing field values have been reset, we can create new field values as appropriate
                for (let p in newFieldValues) {
                    let c = doc.createElement('field');
                    c.setAttribute('name', p);
                    setInnerText(c, newFieldValues[p]);
                    block.appendChild(c);
                }
            }
            else if (mutation) {
                const existingMutation = Array.prototype.filter.call(block.childNodes, (c: any) => c.nodeName == 'mutation' || c.nodeName == 'MUTATION');
                if (existingMutation.length) {
                    block.replaceChild(mutation, existingMutation[0]);
                }
                else {
                    block.appendChild(mutation);
                }
            }

            let serializer = new XMLSerializer();
            return serializer.serializeToString(doc);
        }
        else {
            return originalXML;
        }
    }

    isIncomplete() {
        return this.editor ? this.editor.isDragging() : false;
    }

    prepare() {
        let blocklyDiv = document.getElementById('blocksEditor');
        let toolboxDiv = document.getElementById('blocklyToolboxDefinition');
        let blocklyOptions: Blockly.Options = {
            toolbox: toolboxDiv,
            scrollbars: true,
            media: pxt.webConfig.pxtCdnUrl + "blockly/media/",
            sound: true,
            trashcan: false,
            collapse: false,
            comments: true,
            disable: false,
            zoom: {
                enabled: true,
                controls: true,
                /* wheel: true, wheel as a zoom is confusing and incosistent with monaco */
                maxScale: 2.5,
                minScale: .2,
                scaleSpeed: 1.05
            },
            rtl: Util.userLanguageRtl()
        };
        Util.jsonMergeFrom(blocklyOptions, pxt.appTarget.appTheme.blocklyOptions || {});
        this.editor = Blockly.inject(blocklyDiv, blocklyOptions);
        pxt.blocks.initMouse(this.editor);
        this.editor.addChangeListener((ev) => {
            Blockly.Events.disableOrphans(ev);
            if (ev.type != 'ui') {
                this.changeCallback();
            }
            if (ev.type == 'create') {
                let lastCategory = (this.editor as any).toolbox_.lastCategory_ ? (this.editor as any).toolbox_.lastCategory_.element_.innerText.trim() : 'unknown';
                let blockId = ev.xml.getAttribute('type');
                pxt.tickEvent("blocks.create", {category: lastCategory, block: blockId});
                if (ev.xml.tagName == 'SHADOW')
                    this.cleanUpShadowBlocks();
            }
            if (ev.type == 'ui') {
                if (ev.element == 'category') {
                    let toolboxVisible = !!ev.newValue;
                    this.parent.setState({ hideEditorFloats: toolboxVisible });
                    this.updateHelpCard(ev.newValue != null);
                }
                else if (ev.element == 'commentOpen'
                    || ev.element == 'warningOpen') {
                    /*
                     * We override the default selection behavior so that when a block is selected, its
                     * comment is expanded. However, if a user selects a block by clicking on its comment
                     * icon (the blue question mark), there is a chance that the comment will be expanded
                     * and immediately collapse again because the icon click toggled the state. This hack
                     * prevents two events caused by the same click from opening and then closing a comment
                     */
                    if (ev.group) {
                        // newValue is true if the comment has been expanded
                        if (ev.newValue) {
                            this.selectedEventGroup = ev.group
                        }
                        else if (ev.group == this.selectedEventGroup && this.currentCommentOrWarning) {
                            this.currentCommentOrWarning.setVisible(true)
                            this.selectedEventGroup = undefined
                        }
                    }
                }
                else if (ev.element == 'selected') {
                    this.updateHelpCard();

                    if (this.currentCommentOrWarning) {
                        this.currentCommentOrWarning.setVisible(false)
                    }

                    const selected = Blockly.selected
                    if (selected && selected.warning && typeof (selected.warning) !== "string") {
                        (selected.warning as Blockly.Icon).setVisible(true)
                        this.currentCommentOrWarning = selected.warning
                    } else if (selected && selected.comment && typeof (selected.comment) !== "string") {
                        (selected.comment as Blockly.Icon).setVisible(true)
                        this.currentCommentOrWarning = selected.comment
                    }
                }
            }
        })
        this.initPrompts();
        this.resize();

        this.isReady = true
    }

    resize(e?: Event) {
        let blocklyArea = document.getElementById('blocksArea');
        let blocklyDiv = document.getElementById('blocksEditor');
        // Position blocklyDiv over blocklyArea.
        blocklyDiv.style.width = blocklyArea.offsetWidth + 'px';
        blocklyDiv.style.height = blocklyArea.offsetHeight + 'px';
        Blockly.svgResize(this.editor);
    }

    undo() {
        this.editor.undo();
    }

    getId() {
        return "blocksArea"
    }

    display() {
        return (
            <div>
                <div id="blocksEditor"></div>
            </div>
        )
    }

    getViewState() {
        // ZOOM etc
        return {}
    }

    setViewState(pos: {}) {
    }

    getCurrentSource() {
        return this.saveBlockly();
    }

    acceptsFile(file: pkg.File) {
        return file.getExtension() == "blocks"
    }

    loadFile(file: pkg.File) {
        this.setDiagnostics(file)
        this.delayLoadXml = file.content;
        this.editor.clearUndo();
    }

    setDiagnostics(file: pkg.File) {
        if (!this.compilationResult || this.delayLoadXml || this.loadingXml)
            return;

        if (this.diagnosticsOutOfDate) {
            // clear previous warnings on non-disabled blocks
            this.editor.getAllBlocks().filter(b => !b.disabled).forEach(b => b.setWarningText(null));
        }
        else {
            this.diagnosticsOutOfDate = true;
        }

        let tsfile = file.epkg.files[file.getVirtualFileName()];
        if (!tsfile || !tsfile.diagnostics) return;

        // only show errors
        let diags = tsfile.diagnostics.filter(d => d.category == ts.DiagnosticCategory.Error);
        let sourceMap = this.compilationResult.sourceMap;

        diags.filter(diag => diag.category == ts.DiagnosticCategory.Error).forEach(diag => {
            let bid = pxt.blocks.findBlockId(sourceMap, diag);
            if (bid) {
                let b = this.editor.getBlockById(bid)
                if (b) {
                    let txt = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
                    b.setWarningText(txt);
                }
            }
        })
    }

    highlightStatement(brk: pxtc.LocationInfo) {
        if (!this.compilationResult || this.delayLoadXml || this.loadingXml)
            return;
        let bid = pxt.blocks.findBlockId(this.compilationResult.sourceMap, brk);
        this.editor.traceOn(true);
        this.editor.highlightBlock(bid);
    }

    openTypeScript() {
        pxt.tickEvent("blocks.showjavascript");
        this.parent.openTypeScriptAsync().done();
    }

    cleanUpShadowBlocks() {
        const blocks = this.editor.getTopBlocks(false);
        blocks.filter(b => b.isShadow_).forEach(b => b.dispose(false));
    }
}
