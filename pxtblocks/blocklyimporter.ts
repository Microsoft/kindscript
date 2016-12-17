///<reference path='../built/blockly.d.ts'/>
/// <reference path="../built/pxtlib.d.ts" />

namespace pxt.blocks {
    export function saveWorkspaceXml(ws: Blockly.Workspace): string {
        let xml = Blockly.Xml.workspaceToDom(ws);
        let text = Blockly.Xml.domToPrettyText(xml);
        return text;
    }

    /**
     * Loads the xml into a off-screen workspace (not suitable for size computations)
     */
    export function loadWorkspaceXml(xml: string, skipReport = false) {
        const workspace = new Blockly.Workspace();
        try {
            const dom = Blockly.Xml.textToDom(xml);
            patchFloatingBlocks(dom);
            Blockly.Xml.domToWorkspace(dom, workspace);
            return workspace;
        } catch (e) {
            if (!skipReport)
                pxt.reportException(e);
            return null;
        }
    }

    function patchFloatingBlocks(dom: Element) {
        let onstart = dom.querySelector(`block[type=${ts.pxtc.ON_START_TYPE}]`)
        if (onstart) // nothing to doc
            return;

        // walk top level blocks
        let newnodes: Element[] = [];
        let node = dom.firstElementChild;
        while (node) {
            const next = node.nextElementSibling;
            // does this block is disable or have s nested statement block?
            if (!node.getAttribute("disabled") && !node.querySelector("statement")) {
                // old block, needs to be wrapped in onstart
                onstart = dom.ownerDocument.createElement("block");
                onstart.setAttribute("type", ts.pxtc.ON_START_TYPE);
                let insertNode = dom.ownerDocument.createElement("statement");
                insertNode.setAttribute("name", "HANDLER");
                onstart.appendChild(insertNode);
                insertNode.appendChild(node);
                newnodes.push(onstart);
            }
            node = next;
        }

        newnodes.forEach(n => dom.appendChild(n));
    }

    export function importXml(xml: string, info?: pxtc.BlocksInfo, skipReport = false): string {
        try {
            let parser = new DOMParser();
            let doc = parser.parseFromString(xml, "application/xml");

            if (info) {
                // build upgrade map
                let enums: Map<string> = {};
                for (let k in info.apis.byQName) {
                    let api = info.apis.byQName[k];
                    if (api.kind == pxtc.SymbolKind.EnumMember)
                        enums[api.namespace + '.' + (api.attributes.blockImportId || api.attributes.block || api.attributes.blockId || api.name)]
                            = api.namespace + '.' + api.name;
                }

                // walk through blocks and patch enums
                let blocks = doc.getElementsByTagName("block");
                for (let i = 0; i < blocks.length; ++i)
                    patchBlock(info, enums, blocks[i]);
            }

            // patch floating blocks
            patchFloatingBlocks(doc.documentElement);

            // serialize and return
            return new XMLSerializer().serializeToString(doc);
        }
        catch (e) {
            if (!skipReport)
                reportException(e);
            return xml;
        }
    }

    function patchBlock(info: pxtc.BlocksInfo, enums: Map<string>, block: Element): void {
        let type = block.getAttribute("type");
        let b = Blockly.Blocks[type];
        let symbol = blockSymbol(type);
        if (!symbol || !b) return;

        let params = parameterNames(symbol);
        symbol.parameters.forEach((p, i) => {
            let ptype = info.apis.byQName[p.type];
            if (ptype && ptype.kind == pxtc.SymbolKind.Enum) {
                let field = block.querySelector(`field[name=${params[p.name].name}]`);
                if (field) {
                    let en = enums[ptype.name + '.' + field.textContent];
                    if (en) field.textContent = en;
                }
                /*
<block type="device_button_event" x="92" y="77">
    <field name="NAME">Button.AB</field>
  </block>
                  */
            }
        })
    }

    /**
     * Convert blockly hue to rgb
     */
    export function convertColour(colour: string): string {
        let hue = parseInt(colour);
        if (!isNaN(hue)) {
            return Blockly.hueToRgb(hue);
        }
        return colour;
    }
}
