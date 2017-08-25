import e = pxt.editor;
import * as pkg from "./package";

export enum Permissions {
    Serial,
    ReadUserCode
}

export enum PermissionStatus {
    Granted,
    Denied,
    NotAvailable,
    NotYetPrompted
}

export interface ExtensionHost {
    send(name: string, message: e.ExtensionMessage): void;
    promptForPermissionAsync(id: string, permission: Permissions): Promise<boolean>;
}

export class ExtensionManager {
    private statuses: pxt.Map<e.Permissions<PermissionStatus>> = {};
    private nameToExtId: pxt.Map<string> = {};
    private extIdToName: pxt.Map<string> = {};
    private consent: pxt.Map<boolean> = {};

    constructor (private host: ExtensionHost) {
    }

    handleExtensionMessage(message: e.ExtensionMessage) {
        this.handleRequestAsync(message as e.ExtensionRequest);
    }

    sendEvent(extId: string, event: string) {
        this.host.send(extId, mkEvent(event));
    }

    setConsent(extId: string, allowed: boolean) {
        this.consent[extId] = allowed;
    }

    hasConsent(extId: string) {
        return this.consent[extId];
    }

    getExtId(name: string): string {
        if (!this.nameToExtId[name]) {
            this.nameToExtId[name] = Util.guidGen();
            this.extIdToName[this.nameToExtId[name]] = name;
        }
        return this.nameToExtId[name];
    }

    private sendResponse(response: e.ExtensionResponse) {
        this.host.send(this.extIdToName[response.extId], response);
    }

    private handleRequestAsync(request: e.ExtensionRequest): Promise<void> {
        const resp = mkResponse(request);

        if (request.action === "extinit") {
            if (request.body) {
                resp.extId = this.getExtId((request as e.InitializeRequest).body);
                this.sendResponse(resp);
            }
            return Promise.resolve();
        }

        if (!this.hasConsent(request.extId)) {
            resp.success = false;
            resp.error = ""
            this.sendResponse(resp);
            return Promise.reject("No consent");
        }

        switch (request.action) {
            case "extdatastream":
                return this.permissionOperation(request.extId, Permissions.Serial, resp, handleDataStreamRequest);
            case "extquerypermission":
                const perm = this.getPermissions(request.extId)
                const r = resp as e.ExtensionResponse;
                r.resp = statusesToResponses(perm);
                this.sendResponse(r);
                break;
            case "extrequestpermission":
                return this.requestPermissionsAsync(request.extId, resp as e.PermissionResponse, request.body);
            case "extusercode":
                return this.permissionOperation(request.extId, Permissions.ReadUserCode, resp, handleUserCodeRequest);
            case "extreadcode":
                handleReadCodeRequest(this.extIdToName[request.extId], resp as e.ReadCodeResponse);
                this.sendResponse(resp);
                break;
            case "extwritecode":
                handleWriteCodeRequest(this.extIdToName[request.extId], resp, request.body);
                this.sendResponse(resp);
                break;

        }

        return Promise.resolve();
    }

    private permissionOperation(id: string, permission: Permissions, resp: e.ExtensionResponse, cb: (name: string, resp: e.ExtensionResponse) => void) {
        return this.checkPermissionAsync(id, permission)
            .then(() => {
                cb(this.extIdToName[id], resp);
                this.sendResponse(resp);
            })
            .catch(() => {
                resp.success = false;
                resp.error = "permission denied";
                this.sendResponse(resp);
            });
    }

    private getPermissions(id: string): e.Permissions<PermissionStatus> {
        if (!this.statuses[id]) {
            this.statuses[id] = {
                serial: PermissionStatus.NotYetPrompted,
                readUserCode: PermissionStatus.NotYetPrompted
            };
        }
        return this.statuses[id]
    }

    private checkPermissionAsync(id: string, permission: Permissions): Promise<boolean> {
        const perm = this.getPermissions(id)

        let status: PermissionStatus;
        switch (permission) {
            case Permissions.Serial: status = perm.serial; break;
            case Permissions.ReadUserCode: status = perm.readUserCode; break;
        }

        if (status === PermissionStatus.NotYetPrompted) {
            return this.host.promptForPermissionAsync(id, permission);
        }

        return Promise.resolve(status === PermissionStatus.Granted);

    }

    private requestPermissionsAsync(id: string, resp: e.PermissionResponse, p: e.Permissions<boolean>) {
        const promises: Promise<boolean>[] = [];

        if (p.readUserCode) {
            promises.push(this.checkPermissionAsync(id, Permissions.ReadUserCode));
        }
        if (p.serial) {
            promises.push(this.checkPermissionAsync(id, Permissions.Serial));
        }

        return Promise.all(promises)
            .then(() => statusesToResponses(this.getPermissions(id)))
            .then(responses => { resp.resp = responses });
    }
}

function handleUserCodeRequest(name: string, resp: e.ExtensionResponse) {
    const mainPackage = pkg.mainEditorPkg() as pkg.EditorPackage;
    resp.resp = mainPackage.getAllFiles();
}

function handleDataStreamRequest(name: string, resp: e.ExtensionResponse) {
    // TODO
}

function handleReadCodeRequest(name: string, resp: e.ReadCodeResponse) {
    const mainPackage = pkg.mainEditorPkg() as pkg.EditorPackage;
    const extPackage = mainPackage.pkgAndDeps().filter(p => p.getPkgId() === name)[0];
    if (extPackage) {
        const files = extPackage.getAllFiles();
        resp.body = {
            json: files["extension.json"],
            code: files["extension.ts"]
        };
    }
    else {
        resp.success = false;
        resp.error = "could not find package";
    }
}

function handleWriteCodeRequest(name: string, resp: e.ExtensionResponse, files: e.ExtensionFiles) {
    const mainPackage = pkg.mainEditorPkg() as pkg.EditorPackage;
    const extPackage = mainPackage.pkgAndDeps().filter(p => p.getPkgId() === name)[0];
    if (extPackage) {
        if (files.json !== undefined) {
            extPackage.setFile("extension.json", files.json);
        }
        if (files.code !== undefined) {
            extPackage.setFile("extension.ts", files.code);
        }
    }
    else {
        resp.success = false;
        resp.error = "could not find package";
    }
}

function mkEvent(event: string): e.ExtensionEvent {
    return {
        type: "pxtpkgext",
        event
    };
}

function mkResponse(request: e.ExtensionRequest, success = true): e.ExtensionResponse {
    return {
        type: "pxtpkgext",
        id: request.id,
        extId: request.extId,
        success
    };
}

function statusesToResponses(perm: e.Permissions<PermissionStatus>): e.Permissions<e.PermissionResponses> {
    return {
        readUserCode: statusToResponse(perm.readUserCode),
        serial: statusToResponse(perm.serial)
    };
}

function statusToResponse(p: PermissionStatus): e.PermissionResponses {
    switch (p) {
        case PermissionStatus.NotYetPrompted:
        case PermissionStatus.Denied:
            return e.PermissionResponses.Denied;
        case PermissionStatus.Granted:
            return e.PermissionResponses.Granted;
        case PermissionStatus.NotAvailable:
        default:
            return e.PermissionResponses.NotAvailable;
    }
}