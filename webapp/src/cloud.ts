import * as core from "./core";
import * as auth from "./auth";
import * as ws from "./workspace";
import * as data from "./data";
import * as workspace from "./workspace";
import * as app from "./app";

type Version = pxt.workspace.Version;
type File = pxt.workspace.File;
type Header = pxt.workspace.Header;
type ScriptText = pxt.workspace.ScriptText;
type WorkspaceProvider = pxt.workspace.WorkspaceProvider;

import U = pxt.Util;

type CloudProject = {
    id: string;
    header: string;
    text: string;
    version: string;
};

const localOnlyMetadataFields: (keyof Header)[] = [
    // different for different local storage instances
    '_rev', '_id' as keyof Header,
    // only for tracking local cloud sync state
    'cloudVersion', 'cloudCurrent', 'cloudLastSyncTime'
]
export function excludeLocalOnlyMetadataFields(h: Header): Header {
    const clone = {...h}
    for (let k of localOnlyMetadataFields)
        delete clone[k]
    return clone
}

export type CloudStateSummary = ""/*none*/ | "saved" | "justSaved" | "offline" | "syncing" | "conflict" | "localEdits";
export function getCloudSummary(h: pxt.workspace.Header, md: CloudTempMetadata): CloudStateSummary {
    if (!h.cloudUserId || !md)
        return "" // none
    if (!auth.loggedInSync())
        return "offline"
    if (md.cloudInProgressSyncStartTime > 0)
        return "syncing"
    if (!h.cloudCurrent)
        return "localEdits"
    if (md.justSaved)
        return "justSaved"
    if (h.cloudLastSyncTime > 0)
        return "saved"
    pxt.reportError("cloudsave", `Invalid project cloud state for project ${h.name}(${h.id.substr(0, 4)}..): user: ${h.cloudUserId}, inProg: ${md.cloudInProgressSyncStartTime}, cloudCurr: ${h.cloudCurrent}, lastCloud: ${h.cloudLastSyncTime}`);
    return ""
}

async function listAsync(): Promise<Header[]> {
    return new Promise(async (resolve, reject) => {
        // Note: Cosmos & our backend does not return e-tags each individual item in a list operation
        const result = await auth.apiAsync<CloudProject[]>("/api/user/project");
        if (result.success) {
            const syncTime = U.nowSeconds()
            const userId = auth.user()?.id;
            const headers: Header[] = result.resp.map(proj => {
                const rawHeader: pxt.workspace.Header = JSON.parse(proj.header);
                const header = excludeLocalOnlyMetadataFields(rawHeader)
                header.cloudUserId = userId;
                header.cloudCurrent = true;
                header.cloudLastSyncTime = syncTime
                header.cloudVersion = proj.version;
                return header;
            });
            resolve(headers);
        } else {
            reject(new Error(result.errmsg));
        }
    });
}

function getAsync(h: Header): Promise<File> {
    return new Promise(async (resolve, reject) => {
        const result = await auth.apiAsync<CloudProject>(`/api/user/project/${h.id}`);
        if (result.success) {
            const userId = auth.user()?.id;
            const project = result.resp;
            const rawHeader = JSON.parse(project.header);
            const header = excludeLocalOnlyMetadataFields(rawHeader)
            const text = JSON.parse(project.text);
            const version = project.version;
            const file: File = {
                header,
                text,
                version
            };
            file.header.cloudCurrent = true;
            file.header.cloudVersion = file.version;
            file.header.cloudUserId = userId;
            file.header.cloudLastSyncTime = U.nowSeconds();
            resolve(file);
        } else {
            reject(new Error(result.errmsg));
        }
    });
}

// temporary per-project cloud metadata is only kept in memory and shouldn't be persisted to storage.
export interface CloudTempMetadata {
    cloudInProgressSyncStartTime?: number,
    justSaved?: boolean,
}
const temporaryHeaderMetadata: { [key: string]: CloudTempMetadata } = {};
export function getCloudTempMetadata(headerId: string): CloudTempMetadata {
    return temporaryHeaderMetadata[headerId] || {};
}
function updateCloudTempMetadata(headerId: string, props: Partial<CloudTempMetadata>) {
    const oldMd = temporaryHeaderMetadata[headerId] || {};
    const newMd = { ...oldMd, ...props }
    temporaryHeaderMetadata[headerId] = newMd
    data.invalidate(`${HEADER_CLOUDSTATE}:${headerId}`);
}

function setAsync(h: Header, prevVersion: Version, text?: ScriptText): Promise<Version> {
    return new Promise(async (resolve, reject) => {
        const userId = auth.user()?.id;
        h.cloudUserId = userId;
        h.cloudCurrent = false;
        h.cloudVersion = prevVersion;
        updateCloudTempMetadata(h.id, { cloudInProgressSyncStartTime: U.nowSeconds() })
        const project: CloudProject = {
            id: h.id,
            header: JSON.stringify(excludeLocalOnlyMetadataFields(h)),
            text: text ? JSON.stringify(text) : undefined,
            version: prevVersion
        }
        const result = await auth.apiAsync<string>('/api/user/project', project);
        updateCloudTempMetadata(h.id, { cloudInProgressSyncStartTime: 0, justSaved: true })
        setTimeout(() => {
            // slightly hacky, but we want to keep around a "saved!" message for a small time after
            // a save succeeds so we notify metadata subscribers again afte a delay.
            updateCloudTempMetadata(h.id, { justSaved: false })
        }, 1000);
        if (result.success) {
            h.cloudCurrent = true;
            h.cloudVersion = result.resp;
            h.cloudLastSyncTime = U.nowSeconds()
            resolve(result.resp);
        } else if (result.statusCode === 409) {
            // conflict
            resolve(undefined)
        } else {
            reject(new Error(result.errmsg));
        }
    });
}

function deleteAsync(h: Header, prevVersion: Version, text?: ScriptText): Promise<void> {
    // Note: we don't actually want to support permanent delete initiated from the client.
    // Instead we use soft delete ".isDeleted" so that we have a tombstone to track that a
    // project used to exist. Without this, we will unintentionally resync deleted projects.
    return Promise.resolve();
}

function resetAsync(): Promise<void> {
    return Promise.resolve();
}

let inProgressSyncPromise: Promise<any> = Promise.resolve()
export async function syncAsync(hdrs?: Header[]): Promise<Header[]> {
    // wait for any pending saves
    await inProgressSavePromise;
    // ensure we don't run this twice
    if (inProgressSyncPromise.isResolved()) {
        inProgressSyncPromise = syncAsyncInternal(hdrs)
    }
    return inProgressSyncPromise
}

async function transferToCloud(local: Header, cloudVersion: string): Promise<Header> {
    const text = await workspace.getTextAsync(local.id);
    // since we just fetched the text from storage and we're about to make an update,
    //  we should acquire the current header session.
    workspace.acquireHeaderSession(local);
    const newVer = await setAsync(local, cloudVersion, text);
    if (!newVer)
        return null; // failed to sync to the cloud
    // save to the workspace header again to make sure cloud metadata gets saved
    await workspace.saveAsync(local, null, true)
    return workspace.getHeader(local.id)
}

async function transferFromCloud(local: Header | null, remoteFile: File): Promise<Header> {
    const newHeader = {...local || {}, ...remoteFile.header} // make sure we keep local-only metadata like _rev
    if (local) {
        // we've decided to overwrite what we have locally with what is in the
        // the cloud, so acquire the header session
        workspace.acquireHeaderSession(remoteFile.header)
        await workspace.saveAsync(newHeader, remoteFile.text, true);
    } else {
        await workspace.importAsync(newHeader, remoteFile.text, true)
    }
    return workspace.getHeader(newHeader.id)
}

function getConflictCopyName(hdr: Header): string {
    // TODO: do we want a better or more descriptive name?
    return hdr.name + " - Copy";
}

async function resolveConflict(local: Header, remoteFile: File) {
    // Strategy: resolve conflict by creating a copy
    // Note, we do the operations in the following order:
    // 1. create a local copy
    // 2. load that new local copy (if we're in the editor already)
    // 3. overwrite old local version with the new remote version
    // 4. transfer new local copy to the cloud
    // We want 2 to happen as quickly as possible so that the user is not seeing
    //  nor has any chance to edit the old conflicting copy. This minimizes the chances
    //  that the users creates additional conflicting changes.
    // Similarly, we also want 3 to happen soon so that the conflict is gone and the user can't make
    //  conflicting edits any more.
    // 1, 2, and 3 are local operations and should happen instantly.
    // 4 is a network operations and can take a while and is far more likely to fail.
    // Regarding failure modes:
    // if 1 fails, we can't do anything to resolve the conflict b/c local storage doesn't work apparently.
    // if 2 fails, we want to continue with at least 3 because those will resolve the conflict (and avoid future conflicts).
    //      hopefully 2 failing doesn't mean the user is still in the editor somewhere with a stale copy because that could reintroduce a conflict.
    // if 3 fails, we're in bad shape since the conflict is still around. There isn't a great way to recover here since we've already
    //      created a copy but apparently we can't change the original we had.
    //      Luckily, it's unlikely that 3 will fail if 1 succeeds since both are very similar local storage writes.
    // if 4 fails, it's not too bad since that just means the duplicate copy is local only until we're able to sync it up to the cloud.

    // 1. copy local project as a new project
    // (let exceptions propegate and fail the whole function since we don't want to
    //  proceed if a basic duplicate operation fails.)
    const newName = getConflictCopyName(local);
    let newCopyHdr = await workspace.duplicateAsync(local, newName);
    pxt.tickEvent(`identity.sync.conflict.createdDuplicate`);

    // 2. swap current project to the new copy
    try {
        if (app.hasEditor()) {
            const editor = await app.getEditorAsync();
            if (!editor.state.home && editor.state.header?.id === local.id) {
                await editor.loadHeaderAsync(newCopyHdr, editor.state.editorState);
            }
        }
    } catch (e) {
        // we want to swallow this and keep going since step 3. is the essentail one to resolve the conflcit.
        pxt.reportException(e);
        pxt.tickEvent(`identity.sync.conflict.reloadEditorFailed`, {exception: e});
    }

    // 3. overwrite local changes in the original project with cloud changes
    try {
        const overwrittenLocalHdr = await transferFromCloud(local, remoteFile)
    } catch (e) {
        // let exceptions propegate since there's nothing localy we can do to recover, but log something
        //  since this is a bad case (may lead to repeat duplication).
        pxt.reportException(e);
        pxt.tickEvent(`identity.sync.conflict.overwriteLocalFailed`, {exception: e});
        throw e;
    }

    // 4. upload new project to the cloud (network op)
    const copyUploadHdr = await transferToCloud(newCopyHdr, null);

    // 5. tell the user a conflict occured
    try {
        core.dialogAsync({
            header: lf("Project '{0}' had a conflict", local.name),
            body:
                lf("Project '{0}' was edited in two places and the changes conflict. The changes from this computer (from {1}) have instead been saved to '{2}'. The changes made elsewhere (from {3}) remain in '{4}'.",
                local.name, U.timeSince(local.modificationTime), newCopyHdr.name, U.timeSince(remoteFile.header.modificationTime), remoteFile.header.name),
            disagreeLbl: lf("Got it!"),
            disagreeClass: "green",
            hasCloseIcon: false,
        });
    } catch (e) {
        // we want to swallow this and keep going since it's non-essential
        pxt.reportException(e);
        pxt.tickEvent(`identity.sync.conflict.dialogNotificationFailed`, {exception: e});
    }
}

function getLocalCloudHeaders(allHdrs?: Header[]) {
    if (!auth.hasIdentity()) { return []; }
    if (!auth.loggedInSync()) { return []; }
    return (allHdrs || workspace.getHeaders(true))
        .filter(h => h.cloudUserId && h.cloudUserId === auth.user()?.id);
}

async function syncAsyncInternal(hdrs?: Header[]): Promise<Header[]> {
    if (!auth.hasIdentity()) { return []; }
    if (!await auth.loggedIn()) { return []; }
    try {
        const partialSync = hdrs && hdrs.length > 0
        pxt.log(`Synchronizing${partialSync ? ` ${hdrs.length} project(s) ` : " all projects "}with the cloud...`)
        const localCloudHeaders = getLocalCloudHeaders(hdrs);
        const syncStart = U.nowSeconds()
        pxt.tickEvent(`identity.sync.start`)
        const agoStr = (t: number) => `${syncStart - t} seconds ago`
        const remoteFiles: {[id: string]: File} = {}
        const getWithCacheAsync = async (h: Header): Promise<File> => {
            if (!remoteFiles[h.id]) {
                remoteFiles[h.id] = await getAsync(h)
            }
            return remoteFiles[h.id]
        }
        if (partialSync) {
            // during a partial sync, get the full files for each cloud project and
            // save them to our temporary cache
            await Promise.all(hdrs.map(h => getWithCacheAsync(h)))
        }
        const remoteHeaders = partialSync
            ? U.values(remoteFiles).map(f => f.header) // a partial set of cloud headers
            : await listAsync() // all cloud headers
        const numDiff = remoteHeaders.length - localCloudHeaders.length
        if (numDiff !== 0) {
            pxt.log(`${Math.abs(numDiff)} ${numDiff > 0 ? 'more' : 'fewer'} projects found in the cloud.`);
        }
        pxt.tickEvent(`identity.sync.projectNumbers`, {
            numRemote: remoteHeaders.length,
            numNonCloudLocal: workspace.getHeaders(true).length - localCloudHeaders.length,
            numCloudLocal: localCloudHeaders.length
        })
        const lastCloudChange = remoteHeaders.length ? Math.max(...remoteHeaders.map(h => h.modificationTime)) : syncStart
        pxt.log(`Last cloud project change was ${agoStr(lastCloudChange)}`);
        const remoteHeadersToProcess = U.toDictionary(remoteHeaders, h => h.id);
        const localHeaderChanges: pxt.Map<Header> = {}
        const toCloud = transferToCloud;
        const fromCloud = async (loc: Header, rem: File) => {
            const newLoc = await transferFromCloud(loc, rem)
            localHeaderChanges[newLoc.id] = newLoc
            return newLoc
        }
        let didProjectCountChange = false;
        let tasks: Promise<void>[] = localCloudHeaders.map(async (local) => {
            // track the fact that we're checking for updates on each project
            updateCloudTempMetadata(local.id, { cloudInProgressSyncStartTime: U.nowSeconds() });

            const remote = remoteHeadersToProcess[local.id];
            delete remoteHeadersToProcess[local.id];
            if (remote) {
                local.cloudLastSyncTime = remote.cloudLastSyncTime
                // Resolve local and cloud differences.
                const areDifferent = remote.cloudVersion
                    ? local.cloudVersion !== remote.cloudVersion
                    // TODO: once we deploy the backend to correctly return the cloudVersion from listAsync, then
                    //      always chose the cloud version comparison.
                    : local.modificationTime !== remote.modificationTime || local.isDeleted !== remote.isDeleted;
                if (areDifferent) {
                    const projShorthand = `'${local.name}' (${local.id.substr(0, 5)}...)`;
                    const remoteFile = await getWithCacheAsync(local);
                    // delete always wins no matter what.
                    if (local.isDeleted) {
                        // Mark remote copy as deleted.
                        pxt.debug(`Propegating ${projShorthand} delete to cloud.`)
                        const newHdr = await toCloud(local, remoteFile.version)
                        U.assert(!!newHdr, `Failed to save ${local.id} to the cloud.`);
                        pxt.tickEvent(`identity.sync.localDeleteUpdatedCloud`)
                    }
                    if (remote.isDeleted) {
                        // Delete local copy.
                        pxt.debug(`Propegating ${projShorthand} delete from cloud.`)
                        const newHdr = await fromCloud(local, remoteFile);
                        didProjectCountChange = true;
                        pxt.tickEvent(`identity.sync.cloudDeleteUpdatedLocal`)
                    }
                    // if it's not a delete...
                    if (local.cloudCurrent) {
                        // No local changes, download latest.
                        const newHdr = await fromCloud(local, remoteFile);
                        pxt.tickEvent(`identity.sync.noConflict.localProjectUpdatedFromCloud`)
                    } else {
                        // Possible conflict.
                        const conflictStr = `conflict found for ${projShorthand}. Last cloud change was ${agoStr(remoteFile.header.modificationTime)} and last local change was ${agoStr(local.modificationTime)}.`
                        if (local.modificationTime > remoteFile.header.modificationTime) {
                            if (local.cloudVersion === remoteFile.version) {
                                // local is one ahead, push as normal
                                pxt.debug(`local project '${local.name}' has changes that will be pushed to the cloud.`)
                                const newHdr = await toCloud(local, remoteFile.version);
                                U.assert(!!newHdr, `Failed to save ${local.id} to the cloud.`);
                                pxt.tickEvent(`identity.sync.noConflict.localProjectUpdatedToCloud`)
                            } else {
                                // conflict (and local has the newer change)
                                pxt.log(conflictStr)
                                pxt.tickEvent(`identity.sync.conflict.localNewerThanCloud`)
                                await resolveConflict(local, remoteFile);
                            }
                        } else {
                            // conflict (and remote has the newer change)
                            pxt.log(conflictStr)
                            pxt.tickEvent(`identity.sync.conflict.cloudNewerThanLocal`)
                            await resolveConflict(local, remoteFile);
                        }
                    }
                }
                // no changes
            } else if (!partialSync) {
                if (local.cloudVersion) {
                    pxt.debug(`Project ${local.id} incorrectly thinks it is synced to the cloud (ver: ${local.cloudVersion})`)
                    local.cloudVersion = null;
                    pxt.tickEvent(`identity.sync.incorrectlyVersionedLocalProjectPushedToCloud`)
                } else {
                    pxt.tickEvent(`identity.sync.orphanedLocalProjectPushedToCloud`)
                }
                // Local cloud synced project exists, but it didn't make it to the server,
                // so let's push it now.
                const newHdr = await toCloud(local, null)
                U.assert(!!newHdr, `Failed to save ${local.id} to the cloud.`)
            }
            else {
                // no remote verison so nothing to do
            }
        });
        tasks = [...tasks, ...U.values(remoteHeadersToProcess)
            .filter(h => !h.isDeleted) // don't bother downloading deleted projects
            .map(async (remote) => {
                // Project exists remotely and not locally, download it.
                const remoteFile = await getWithCacheAsync(remote);
                pxt.debug(`importing new cloud project '${remoteFile.header.name}' (${remoteFile.header.id})`)
                const res = await fromCloud(null, remoteFile)
                pxt.tickEvent(`identity.sync.importCloudProject`)
                didProjectCountChange = true;
            })]

        await Promise.all(tasks);

        // reset cloud state sync metadata if there is any
        getLocalCloudHeaders(hdrs).forEach(hdr => {
            if (getCloudTempMetadata(hdr.id).cloudInProgressSyncStartTime > 0) {
                updateCloudTempMetadata(hdr.id, { cloudInProgressSyncStartTime: 0 });
            }
        })

        // sanity check: all cloud headers should have a new sync time
        const noCloudProjs = remoteHeaders.length === 0
        const cloudSyncSuccess = partialSync || noCloudProjs || workspace.getLastCloudSync() >= syncStart
        if (!cloudSyncSuccess) {
            U.assert(false, 'Cloud sync failed!');
        }

        const elapsed = U.nowSeconds() - syncStart;
        const localHeaderChangesList = U.values(localHeaderChanges)
        pxt.log(`Cloud sync finished after ${elapsed} seconds with ${localHeaderChangesList.length} local changes.`);
        pxt.tickEvent(`identity.sync.finished`, { elapsed })

        return localHeaderChangesList
    }
    catch (e) {
        pxt.reportException(e);
        pxt.tickEvent(`identity.sync.failed`, { exception: e });
    }
    return [];
}

export function forceReloadForCloudSync() {
    // TODO: This is too heavy handed. We can be more fine grain here with some work.
    //  preferably with just the virtual data APIs we can push updates to the whole editor.
    core.infoNotification(lf("Cloud synchronization finished. Reloading... "));
    setTimeout(() => {
        pxt.log("Forcing reload.")
        pxt.tickEvent(`identity.sync.forcingReload`)
        location.reload();
    }, 3000);
}

export async function convertCloudToLocal(userId: string) {
    if (userId) {
        const localCloudHeaders = workspace.getHeaders(true)
            .filter(h => h.cloudUserId && h.cloudUserId === userId);
        const tasks: Promise<void>[] = [];
        localCloudHeaders.forEach((h) => {
            // Clear cloud header and re-save the header.
            delete h.cloudCurrent;
            delete h.cloudLastSyncTime;
            delete h.cloudUserId;
            delete h.cloudVersion;
            tasks.push(workspace.saveAsync(h, null, true));
        });
        await Promise.all(tasks);
    }
}

const CLOUDSAVE_DEBOUNCE_MS = 3000;
const CLOUDSAVE_MAX_MS = 15000;
let headerWorklist: {[headerId: string]: boolean} = {};
let onHeaderChangeTimeout: number = 0;
let onHeaderChangeStarted: number = 0;
const onHeaderChangeSubscriber: data.DataSubscriber = {
    subscriptions: [],
    onDataChanged: (path: string) => {
        const parts = path.split("header:");
        U.assert(parts.length === 2, "onHeaderChangeSubscriber has invalid path subscription: " + path)
        const hdrId = parts[1];
        if (hdrId === "*") {
            // all headers
            // TODO https://github.com/microsoft/pxt-arcade/issues/3129: this branch is being hit WAY too often.
            getLocalCloudHeaders().forEach(h => onHeaderChangeDebouncer(h));
        } else {
            const hdr = workspace.getHeader(hdrId);
            U.assert(!!hdr, "cannot find header with id: " + hdrId);
            onHeaderChangeDebouncer(hdr);
        }
    }
};
async function onHeaderChangeDebouncer(h: Header) {
    if (!auth.hasIdentity()) return
    if (!await auth.loggedIn()) return

    // do we actually have a significant change?
    const hasCloudChange = h.cloudUserId === auth.user().id && !h.cloudCurrent;
    if (!hasCloudChange)
        return;

    // we have a change to sync
    headerWorklist[h.id] = true;
    clearTimeout(onHeaderChangeTimeout);
    const doAfter = async () => {
        onHeaderChangeStarted = 0;
        await onHeadersChanged();
    };

    // has it been longer than the max time?
    if (!onHeaderChangeStarted)
        onHeaderChangeStarted = U.now();
    if (CLOUDSAVE_MAX_MS < U.now() - onHeaderChangeStarted) {
        // save/sync now
        await doAfter()
    } else {
        // debounce
        onHeaderChangeTimeout = setTimeout(doAfter, CLOUDSAVE_DEBOUNCE_MS);
    }
}
let inProgressSavePromise: Promise<Header[]> = Promise.resolve([]);
async function onHeadersChanged(): Promise<void> {
    if (!auth.hasIdentity()) { return; }
    if (!await auth.loggedIn()) { return; }

    // wait on any already pending saves or syncs first
    await inProgressSavePromise;
    await inProgressSyncPromise;

    // get our work
    const hdrs = getLocalCloudHeaders().filter(h => headerWorklist[h.id])
    headerWorklist = {}; // clear worklist
    
    // start the save
    const saveStart = U.nowSeconds()
    const saveTasks = hdrs.map(async h => {
        const newHdr = await transferToCloud(h, h.cloudVersion);
        return newHdr
    });
    inProgressSavePromise = Promise.all(saveTasks);

    // check the response
    const allRes = await inProgressSavePromise;
    const anyFailed = allRes.some(r => !r);
    if (anyFailed) {
        pxt.tickEvent(`identity.cloudSaveFailedTriggeringPartialSync`);
        // if any saves failed, then we're out of sync with the cloud so resync.
        await syncAsync(hdrs);
    } else {
        // success!
        const elapsedSec = U.nowSeconds() - saveStart;
        pxt.tickEvent(`identity.cloudSaveSucceeded`, { elapsedSec });
    }
}

/**
 * Virtual API
 */

export const HEADER_CLOUDSTATE = "header-cloudstate"

function cloudHeaderMetadataHandler(p: string): any {
    p = data.stripProtocol(p)
    if (p == "*") return workspace.getHeaders().map(h => getCloudTempMetadata(h.id))
    return getCloudTempMetadata(p)
}

export function init() {
    console.log("cloud init");
    // mount our virtual APIs
    data.mountVirtualApi(HEADER_CLOUDSTATE, { getSync: cloudHeaderMetadataHandler });

    // subscribe to header changes
    data.subscribe(onHeaderChangeSubscriber, "header:*");
}
