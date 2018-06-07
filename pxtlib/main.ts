/// <reference path="../localtypings/pxtpackage.d.ts"/>
/// <reference path="../localtypings/pxtparts.d.ts"/>
/// <reference path="../localtypings/pxtarget.d.ts"/>
/// <reference path="util.ts"/>
/// <reference path="apptarget.ts"/>
/// <reference path="tickEvent.ts"/>

namespace pxt {
    export import U = pxtc.Util;
    export import Util = pxtc.Util;

    let savedAppTarget: TargetBundle;
    export function setAppTarget(trg: TargetBundle) {
        appTarget = trg || <TargetBundle>{};
        patchAppTarget();
        savedAppTarget = U.clone(appTarget)
    }

    function patchAppTarget() {
        // patch-up the target
        let comp = appTarget.compile
        if (!comp)
            comp = appTarget.compile = { isNative: false, hasHex: false }
        if (comp.hasHex && comp.jsRefCounting === undefined)
            comp.jsRefCounting = true
        if (!comp.hasHex && comp.floatingPoint === undefined)
            comp.floatingPoint = true
        if (comp.hasHex && !comp.nativeType)
            comp.nativeType = pxtc.NATIVE_TYPE_THUMB
        if (comp.nativeType == pxtc.NATIVE_TYPE_AVR || comp.nativeType == pxtc.NATIVE_TYPE_AVRVM) {
            comp.shortPointers = true
            comp.flashCodeAlign = 0x10
        }
        if (comp.nativeType == pxtc.NATIVE_TYPE_CS) {
            comp.floatingPoint = true
            comp.needsUnboxing = true
            comp.jsRefCounting = false
        }
        if (comp.taggedInts) {
            comp.floatingPoint = true
            comp.needsUnboxing = true
        }
        if (!comp.vtableShift)
            comp.vtableShift = 2
        if (!comp.useUF2 && !comp.useELF && comp.noSourceInFlash == undefined)
            comp.noSourceInFlash = true // no point putting sources in hex to be flashed
        if (!appTarget.appTheme) appTarget.appTheme = {}
        if (!appTarget.appTheme.embedUrl)
            appTarget.appTheme.embedUrl = appTarget.appTheme.homeUrl
        let cs = appTarget.compileService
        if (cs) {
            if (cs.yottaTarget && !cs.yottaBinary)
                cs.yottaBinary = "pxt-microbit-app-combined.hex"
        }
        // patch logo locations
        const theme = appTarget.appTheme;
        if (theme) {
            Object.keys(theme as any as Map<string>)
                .filter(k => /(logo|hero)$/i.test(k) && /^@cdnUrl@/.test((theme as any)[k]))
                .forEach(k => (theme as any)[k] = pxt.BrowserUtils.patchCdn((theme as any)[k]));
        }

        // patching simulator images
        const sim = appTarget.simulator;
        if (sim
            && sim.boardDefinition
            && sim.boardDefinition.visual) {
            let boardDef = sim.boardDefinition.visual as pxsim.BoardImageDefinition;
            if (boardDef.image) {
                boardDef.image = pxt.BrowserUtils.patchCdn(boardDef.image)
                if (boardDef.outlineImage) boardDef.outlineImage = pxt.BrowserUtils.patchCdn(boardDef.outlineImage)
            }
        }

        // patch icons in bundled packages
        Object.keys(appTarget.bundledpkgs).forEach(pkgid => {
            const res = appTarget.bundledpkgs[pkgid];
            // path config before storing
            const config = JSON.parse(res[pxt.CONFIG_NAME]) as pxt.PackageConfig;
            if (config.icon) config.icon = pxt.BrowserUtils.patchCdn(config.icon);
            res[pxt.CONFIG_NAME] = JSON.stringify(config, null, 4);
        })

    }

    export function setAppTargetVariant(variant: string) {
        appTargetVariant = variant
        appTarget = U.clone(savedAppTarget)
        if (variant) {
            if (appTarget.variants) {
                let v = appTarget.variants[variant]
                if (v) {
                    U.jsonMergeFrom(appTarget, v)
                    return
                }
            }
            U.userError(lf("Variant '{0}' not defined in pxtarget.json", variant))
        }
        patchAppTarget();
    }

    export interface PxtOptions {
        debug?: boolean;
        light?: boolean; // low resource device
        wsPort?: number;
    }
    export let options: PxtOptions = {};

    // general error reported
    export let debug: (msg: any) => void = typeof console !== "undefined" && !!console.debug
        ? (msg) => {
            if (pxt.options.debug)
                console.debug(msg);
        } : () => { };
    export let log: (msg: any) => void = typeof console !== "undefined" && !!console.log
        ? (msg) => {
            console.log(msg);
        } : () => { };

    export let reportException: (err: any, data?: Map<string>) => void = function (e, d) {
        if (console) {
            console.error(e);
            if (d) {
                try {
                    // log it as object, so native object inspector can be used
                    console.log(d)
                    //pxt.log(JSON.stringify(d, null, 2))
                } catch (e) { }
            }
        }
    }
    export let reportError: (cat: string, msg: string, data?: Map<string>) => void = function (cat, msg, data) {
        if (console) {
            console.error(`${cat}: ${msg}`);
            if (data) {
                try {
                    pxt.log(JSON.stringify(data, null, 2))
                } catch (e) { }
            }
        }
    }

    let activityEvents: Map<number> = {};
    const tickActivityDebounced = Util.debounce(() => {
        tickEvent("activity", activityEvents);
        activityEvents = {};
    }, 10000, false);
    /**
     * Ticks activity events. This event gets aggregated and eventually gets sent.
     */
    export function tickActivity(...ids: string[]) {
        ids.filter(id => !!id).map(id => id.slice(0, 64))
            .forEach(id => activityEvents[id] = (activityEvents[id] || 0) + 1);
        tickActivityDebounced();
    }

    export interface WebConfig {
        relprefix: string; // "/beta---",
        workerjs: string;  // "/beta---worker",
        monacoworkerjs: string; // "/beta---monacoworker",
        pxtVersion: string; // "?",
        pxtRelId: string; // "9e298e8784f1a1d6787428ec491baf1f7a53e8fa",
        pxtCdnUrl: string; // "https://pxt.azureedge.net/commit/9e2...e8fa/",
        commitCdnUrl: string; // "https://pxt.azureedge.net/commit/9e2...e8fa/",
        blobCdnUrl: string; // "https://pxt.azureedge.net/commit/9e2...e8fa/",
        cdnUrl: string; // "https://pxt.azureedge.net"
        targetUrl: string; // "https://pxt.microbit.org"
        targetVersion: string; // "?",
        targetRelId: string; // "9e298e8784f1a1d6787428ec491baf1f7a53e8fa",
        targetId: string; // "microbit",
        simUrl: string; // "https://trg-microbit.userpxt.io/beta---simulator"
        partsUrl?: string; // /beta---parts
        runUrl?: string; // "/beta---run"
        docsUrl?: string; // "/beta---docs"
        isStatic?: boolean;
        verprefix?: string; // "v1"
    }

    export function localWebConfig() {
        let r: WebConfig = {
            relprefix: "/--",
            workerjs: "/worker.js",
            monacoworkerjs: "/monacoworker.js",
            pxtVersion: "local",
            pxtRelId: "",
            pxtCdnUrl: "/cdn/",
            commitCdnUrl: "/cdn/",
            blobCdnUrl: "/blb/",
            cdnUrl: "/cdn/",
            targetUrl: "",
            targetVersion: "local",
            targetRelId: "",
            targetId: appTarget ? appTarget.id : "",
            simUrl: "/sim/simulator.html",
            partsUrl: "/sim/siminstructions.html"
        }
        return r
    }

    export let webConfig: WebConfig;

    export function getOnlineCdnUrl(): string {
        if (!webConfig) return null
        let m = /^(https:\/\/[^\/]+)/.exec(webConfig.commitCdnUrl)
        if (m) return m[1]
        else return null
    }

    export function setupWebConfig(cfg: WebConfig) {
        if (cfg) webConfig = cfg;
        else if (!webConfig) webConfig = localWebConfig()
    }

    export interface CompileTarget extends pxtc.CompileTarget {
        preferredEditor?: string; // used to indicate preferred editor to show code in
    }

    export interface Host {
        readFile(pkg: Package, filename: string, skipAdditionalFiles?: boolean): string;
        writeFile(pkg: Package, filename: string, contents: string, force?: boolean): void;
        downloadPackageAsync(pkg: Package): Promise<void>;
        getHexInfoAsync(extInfo: pxtc.ExtensionInfo): Promise<pxtc.HexInfo>;
        cacheStoreAsync(id: string, val: string): Promise<void>;
        cacheGetAsync(id: string): Promise<string>; // null if not found
    }

    // this is for remote file interface to packages
    export interface FsFile {
        name: string;  // eg "main.ts"
        mtime: number; // ms since epoch
        content?: string; // not returned in FsPkgs
        prevContent?: string; // only used in write reqs
    }

    export interface FsPkg {
        path: string; // eg "foo/bar"
        config: pxt.PackageConfig; // pxt.json
        files: FsFile[]; // this includes pxt.json
        icon?: string;
    }

    export interface FsPkgs {
        pkgs: FsPkg[];
    }

    export interface ICompilationOptions {

    }

    export function getEmbeddedScript(id: string): Map<string> {
        return U.lookup(appTarget.bundledpkgs || {}, id)
    }

    let _targetConfigPromise: Promise<pxt.TargetConfig> = undefined;
    export function targetConfigAsync(): Promise<pxt.TargetConfig> {
        if (!_targetConfigPromise) // cached promise
            _targetConfigPromise = Cloud.downloadTargetConfigAsync()
                .then(
                    js => { return js || {}; },
                    err => { return {}; }
                );
        return _targetConfigPromise;
    }
    export function packagesConfigAsync(): Promise<pxt.PackagesConfig> {
        return targetConfigAsync().then(config => config ? config.packages : undefined);
    }

    export const CONFIG_NAME = "pxt.json"
    export const SERIAL_EDITOR_FILE = "serial.txt"
    export const CLOUD_ID = "pxt/"
    export const BLOCKS_PROJECT_NAME = "blocksprj";
    export const JAVASCRIPT_PROJECT_NAME = "tsprj";

    export function outputName(trg: CompileTarget = null) {
        if (!trg) trg = appTarget.compile
        if (trg.nativeType == ts.pxtc.NATIVE_TYPE_CS)
            return ts.pxtc.BINARY_CS
        if (trg.useUF2)
            return ts.pxtc.BINARY_UF2
        else if (trg.useELF)
            return ts.pxtc.BINARY_ELF
        else
            return ts.pxtc.BINARY_HEX
    }

    export function isOutputText(trg: CompileTarget = null) {
        return outputName(trg) == ts.pxtc.BINARY_HEX || outputName(trg) == ts.pxtc.BINARY_CS
    }
}
