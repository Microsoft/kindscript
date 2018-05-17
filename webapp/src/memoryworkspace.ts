
type Header = pxt.workspace.Header;
type Project = pxt.workspace.Project;
type ScriptText = pxt.workspace.ScriptText;
type WorkspaceProvider = pxt.workspace.WorkspaceProvider;
type InstallHeader = pxt.workspace.InstallHeader;
import U = pxt.Util;

export let projects: pxt.Map<Project> = {};
let target = "";
let targetVersion = "";

export function merge(prj: Project) {
    let h: Header = prj.header;
    if (!h) {
        prj.header = h = {
            id: ts.pxtc.Util.guidGen(),
            recentUse: U.nowSeconds(),
            modificationTime: U.nowSeconds(),
            target: target,
            targetVersion: targetVersion,
            _rev: undefined,
            blobId: undefined,
            blobCurrent: undefined,
            isDeleted: false,
            name: lf("Untitled"),
            meta: {

            },
            editor: pxt.BLOCKS_PROJECT_NAME,
            pubId: undefined,
            pubCurrent: undefined
        }
    }
    projects[prj.header.id] = prj;
}

function getHeaders(): Header[] {
    return pxt.Util.values(projects).map(p => p.header);
}

function getHeader(id: string): Header {
    let p = projects[id];
    return p ? p.header : undefined;
}

function getTextAsync(id: string): Promise<ScriptText> {
    let p = projects[id];
    return Promise.resolve(p ? p.text : undefined);
}

function initAsync(trg: string, version: string): Promise<void> {
    target = trg;
    targetVersion = trg;
    return Promise.resolve();
}

function saveAsync(h: Header, text?: ScriptText): Promise<void> {
    projects[h.id] = {
        header: h,
        text: text
    }
    return Promise.resolve();
}

function installAsync(h0: InstallHeader, text: ScriptText): Promise<Header> {
    let h = <Header>h0
    h.id = ts.pxtc.Util.guidGen();
    h.recentUse = U.nowSeconds()
    h.modificationTime = h.recentUse;

    return saveAsync(h, text).then(() => h);
}

function saveToCloudAsync(h: Header): Promise<void> {
    return Promise.resolve();
}

function syncAsync(): Promise<pxt.editor.EditorSyncState> {
    return Promise.resolve(undefined);
}

function resetAsync(): Promise<void> {
    projects = {}
    target = "";
    return Promise.resolve();
}

function loadedAsync(): Promise<void> {
    return Promise.resolve();
}

export const provider: WorkspaceProvider = {
    getHeaders,
    getHeader,
    getTextAsync,
    initAsync,
    saveAsync,
    installAsync,
    saveToCloudAsync,
    syncAsync,
    resetAsync,
    loadedAsync
}