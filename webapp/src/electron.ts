import Cloud = pxt.Cloud;
import * as core from "./core";
import { ProjectView } from "./srceditor";

const pxtElectron: pxt.electron.PxtElectron = (window as any).pxtElectron;
export const isPxtElectron = !!pxtElectron;
export const isIpcRenderer = !!(window as any).ipcRenderer;
export const isElectron = isPxtElectron || isIpcRenderer;

const downloadingUpdateLoadingName = "pxtelectron-downloadingupdate";

export function initElectron(projectView: ProjectView): void {
    if (!isPxtElectron) {
        return;
    }

    pxtElectron.onTelemetry((ev: pxt.electron.TelemetryEvent) => {
        pxt.tickEvent(ev.event, ev.data);
    });
    pxtElectron.onUpdateInstalled(() => {
        core.infoNotification(lf("An update will take effect after the app restarts"))
    });

    const criticalUpdateFailedPromise = new Promise((resolve) => {
        pxtElectron.onCriticalUpdateFailed(() => {
            pxt.tickEvent("electron.criticalupdate.failed");
            resolve();
        });
    });

    // Asynchronously check what the update status is, which will let us know if the current version is banned
    pxtElectron.onUpdateStatus((status) => {
        pxt.debug(`Electron app update status: ${status}`);
        pxt.tickEvent(`electron.updatestatus.${status}`);

        if (status === pxt.electron.UpdateStatus.UpdatingCritical || status === pxt.electron.UpdateStatus.BannedWithoutUpdate) {
            projectView.stopSimulator();
        }

        switch (status) {
            case pxt.electron.UpdateStatus.Ok:
                // No update available; nothing to do
                return;
            case pxt.electron.UpdateStatus.UpdatingCritical:
                // App is installing a critical update; show a dialog asking the user to wait
                core.confirmAsync({
                    header: lf("Critical update required"),
                    body: lf("A critical update is installing. Please do not quit the app. It will automatically restart when the update has completed."),
                    hideAgree: true,
                    disagreeLbl: lf("Ok"),
                    disagreeClass: "green",
                    size: "medium"
                }).then(() => {
                    core.showLoading("pxt-electron-update", lf("Installing update..."));
                });

                criticalUpdateFailedPromise
                    .then(() => {
                        core.hideLoading("pxt-electron-update");
                        core.hideDialog();
                        core.confirmAsync({
                            header: lf("Critical update failed"),
                            body: lf("There was an error installing the critical update. Please ensure you are connected to the Internet and try again later."),
                            hideAgree: true,
                            disagreeLbl: lf("Quit"),
                            disagreeClass: "red",
                            size: "medium"
                        }).then(b => {
                            pxtElectron.sendQuit();
                        });
                    });

                // Don't do anything; app will quit and restart once the update is ready
                break;
            case pxt.electron.UpdateStatus.BannedWithoutUpdate:
                // Current version is banned and there are no updates available; show a dialog explaining the
                // situation and quit
                core.confirmAsync({
                    header: lf("Critical update required"),
                    body: lf("We have disabled this app for security reasons. Please ensure you are connected to the Internet and try again later. An update will be automatically installed as soon as it is available."),
                    hideAgree: true,
                    disagreeLbl: lf("Quit"),
                    disagreeClass: "red",
                    size: "medium"
                }).then(b => {
                    pxtElectron.sendQuit();
                });
            default:
                // Unknown status; no-op
                return;
        }
    });

    pxtElectron.sendUpdateStatusCheck();
}