/// <reference path="../built/pxtlib.d.ts"/>

namespace pxt.workspace {
    export type ScriptText = pxt.Map<string>;


    // TODO @darzu: ugh. why is there a "Project" that is different from a "File". They are nearly identical...
    export interface Project {
        header?: Header;
        text?: ScriptText;
    }

    export interface Asset {
        name: string;
        size: number;
        url: string;
    }

    // TODO @darzu: why can version be "any" ? that's really annoying to reason about
    // TODO @darzu: _rev is a string; modificationTime is an int
    export type Version = any;

    export interface File {
        header: Header;
        text: ScriptText;
        // This version field is reserved for the storage mechanism. E.g. PouchDB requires a _rev field containing
        //  the currently stored version.
        version: Version;
    }

    export interface WorkspaceProvider {
        listAsync(): Promise<Header[]>; // called from workspace.syncAsync (including upon startup)
        getAsync(h: Header): Promise<File>;
        setAsync(h: Header, prevVersion: Version, text?: ScriptText): Promise<Version>;
        deleteAsync?: (h: Header, prevVersion: Version) => Promise<void>;
        resetAsync(): Promise<void>;
        loadedAsync?: () => Promise<void>;
        getSyncState?: () => pxt.editor.EditorSyncState;

        // optional screenshot support
        saveScreenshotAsync?: (h: Header, screenshot: string, icon: string) => Promise<void>;

        // optional asset (large binary file) support
        saveAssetAsync?: (id: string, filename: string, data: Uint8Array) => Promise<void>;
        listAssetsAsync?: (id: string) => Promise<Asset[]>;

        fireEvent?: (ev: pxt.editor.events.Event) => void;
    }

    export function freshHeader(name: string, modTime: number) {
        let header: Header = {
            target: pxt.appTarget.id,
            targetVersion: pxt.appTarget.versions.target,
            name: name,
            meta: {},
            editor: pxt.JAVASCRIPT_PROJECT_NAME,
            pubId: "",
            pubCurrent: false,
            _rev: null,
            id: U.guidGen(),
            recentUse: modTime,
            modificationTime: modTime,
            blobId_: null,
            blobVersion_: null,
            blobCurrent_: false,
            cloudUserId: null,
            cloudCurrent: false,
            cloudVersion: null,
            isDeleted: false,
        }
        return header
    }
}