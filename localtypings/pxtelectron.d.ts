/// <reference path="pxtpackage.d.ts" />

declare namespace pxt.electron {
    export interface ElectronManifest {
        latest: string;
        banned?: string[];
        timeStamp?: string;
    }

    export const enum UpdateStatus {
        UpdatingCritical = "updating-critical",
        BannedWithoutUpdate = "banned-without-update",
        Ok = "ok"
    }

    export interface TelemetryEvent {
        event: string;
        data: pxt.Map<string | number>;
    }

    // The object that gets injected into the window
    export interface PxtElectron {
        onTelemetry: (handler: (ev: TelemetryEvent) => void) => void;
        onUpdateInstalled: (handler: () => void) => void;
        onUpdateStatus: (handler: (st: UpdateStatus) => void) => void;
        onCriticalUpdateFailed: (handler: () => void) => void;

        sendUpdateStatusCheck: () => void;
        sendQuit: () => void;
    }
}