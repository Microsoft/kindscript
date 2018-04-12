/// <reference path="pxtpackage.d.ts" />

declare namespace pxt.electron {
    export interface VersionRange {
        from: string; // Semver version
        to: string; // Semver version
    }

    export interface MajorRelease {
        latest: string; // Semver version
        url?: string; // Alternatively, we can direct users to a web page to update instead of one-click installer
        promptVersion?: string; // If app is older than or equal to this version (semver), user is modal prompted to update; otherwise a simple notification of "update available" is shown
        bannedVersions?: VersionRange[]; // If app falls within one of these version ranges, user will be forced to update or app will quit
    }

    export interface ElectronManifest {
        majorReleases: { [majorVersion: number]: MajorRelease };
        timeStamp?: string;
    }

    export interface TelemetryEvent {
        event: string;
        data: pxt.Map<string | number>;
    }

    export type TelemetryHandler = (id: string, data?: pxt.Map<string | number>) => void;

    // The object that gets injected into the window
    export interface PxtElectron {
        updateApp: (version: string, errorHandler: () => void) => void;
        quitApp: () => void;
        initTelemetry: (telemetryHandler: TelemetryHandler) => void;
    }
}