import * as React from "react";
import * as ReactDOM from "react-dom";

import * as core from "./core";

import Cloud = pxt.Cloud;

export function showAboutDialogAsync() {
    const compileService = pxt.appTarget.compileService;
    const description = pxt.appTarget.description || pxt.appTarget.title;
    const githubUrl = pxt.appTarget.appTheme.githubUrl;
    core.confirmAsync({
        header: lf("About"),
        hideCancel: true,
        agreeLbl: lf("Ok"),
        agreeClass: "positive",
        jsx: <div> {githubUrl ? <p>
            {lf("{0} version:", pxt.Util.htmlEscape(pxt.appTarget.name))}
            <a href={`${pxt.Util.htmlEscape(githubUrl)}/releases/tag/v${pxt.Util.htmlEscape(pxt.appTarget.versions.target)}`}
                title={`${lf("{0} version : {1}", pxt.Util.htmlEscape(pxt.appTarget.name), pxt.Util.htmlEscape(pxt.appTarget.versions.target))}`}
                target="_blank" rel="noopener noreferrer">{pxt.Util.htmlEscape(pxt.appTarget.versions.target)}</a>
        </p> : undefined}
            <p>{lf("{0} version:", "Microsoft MakeCode")}
                <a href={`https://github.com/Microsoft/pxt/releases/tag/v${pxt.Util.htmlEscape(pxt.appTarget.versions.pxt)}`}
                    title={`${lf("{0} version: {1}", "Microsoft MakeCode", pxt.Util.htmlEscape(pxt.appTarget.versions.pxt))}`}
                    target="_blank" rel="noopener noreferrer">{pxt.Util.htmlEscape(pxt.appTarget.versions.pxt)}</a></p>
            {compileService && compileService.githubCorePackage && compileService.gittag ?
                <p>{lf("{0} version:", "C++ runtime")}
                    <a href={`${pxt.Util.htmlEscape("https://github.com/" + compileService.githubCorePackage + '/releases/tag/' + compileService.gittag)}`}
                        title={`${lf("{0} version: {1}", "C++ runtime", pxt.Util.htmlEscape(compileService.gittag))}`}
                        target="_blank" rel="noopener noreferrer">${pxt.Util.htmlEscape(compileService.gittag)}</a></p> : undefined}
        </div>

    }).done();
}

export function showImportUrlDialogAsync() {
    let input: HTMLInputElement;
    const shareUrl = pxt.appTarget.appTheme.shareUrl || "https://makecode.com/";
    return core.confirmAsync({
        header: lf("Open project URL"),
        onLoaded: (el) => {
            input = el.querySelectorAll('input')[0] as HTMLInputElement;
        },
        jsx: <div className="ui form">
            <div className="ui icon violet message">
                <i className="user icon"></i>
                <div className="content">
                    <h3 className="header">
                        {lf("User-provided content")}
                    </h3>
                    <p>
                        {lf("The content below is provided by a user, and is not endorsed by Microsoft.")}
                        {lf("If you think it's not appropriate, please report abuse through Settings -> Report Abuse.")}
                    </p>
                </div>
            </div>
            <div className="ui field">
                <label id="selectUrlToOpenLabel">{lf("Copy the URL of the project.")}</label>
                <input type="url" tabIndex={0} autoFocus aria-describedby="selectUrlToOpenLabel" placeholder={`${shareUrl}...`} className="ui blue fluid"></input>
            </div>
        </div>,
    }).then(res => {
        if (res) {
            pxt.tickEvent("app.open.url");
            return pxt.Cloud.parseScriptId(input.value);
        }
        return undefined;
    })
}

export function showImportFileDialogAsync() {
    let input: HTMLInputElement;
    let ext = ".mkcd";
    if (pxt.appTarget.compile.hasHex) {
        ext = ".hex";
    }
    if (pxt.appTarget.compile.useUF2) {
        ext = ".uf2";
    }
    if (pxt.appTarget.compile.saveAsPNG) {
        ext = ".png";
    }
    return core.confirmAsync({
        header: lf("Open {0} file", ext),
        onLoaded: (el) => {
            input = el.querySelectorAll('input')[0] as HTMLInputElement;
        },
        jsx: <div className="ui form">
            <div className="ui field">
                <label id="selectFileToOpenLabel">{lf("Select a {0} file to open.", ext)}</label>
                <input type="file" tabIndex={0} autoFocus aria-describedby="selectFileToOpenLabel" className="ui blue fluid"></input>
            </div>
        </div>,
    }).then(res => {
        if (res) {
            return input.files[0];
        }
        return undefined;
    })
}

export function showReportAbuseAsync(pubId?: string) {
    let urlInput: HTMLInputElement;
    let reasonInput: HTMLTextAreaElement;
    const shareUrl = pxt.appTarget.appTheme.shareUrl || "https://makecode.com/";
    core.confirmAsync({
        header: lf("Report Abuse"),
        onLoaded: (el) => {
            urlInput = el.querySelectorAll('input')[0] as HTMLInputElement;
            reasonInput = el.querySelectorAll('textarea')[0] as HTMLTextAreaElement;
            if (pubId)
                urlInput.value = (shareUrl + pubId);
        },
        agreeLbl: lf("Submit"),
        jsx: <div className="ui form">
            <div className="ui field">
                <label>{lf("What is the URL of the offensive project?")}</label>
                <input type="url" tabIndex={0} autoFocus placeholder="Enter project URL here..."></input>
            </div>
            <div className="ui field">
                <label>{lf("Why do you find it offensive?")}</label>
                <textarea></textarea>
            </div>
        </div>,
    }).done(res => {
        if (res) {
            pxt.tickEvent("app.reportabuse.send");
            const id = pxt.Cloud.parseScriptId(urlInput.value as string);
            if (!id) {
                core.errorNotification(lf("Sorry, the project url looks invalid."));
            } else {
                core.infoNotification(lf("Sending abuse report..."));
                Cloud.privatePostAsync(`${id}/abusereports`, {
                    text: reasonInput.value
                })
                    .then(res => {
                        core.infoNotification(lf("Report sent. Thank you!"))
                    })
                    .catch(e => {
                        if (e.statusCode == 404)
                            core.warningNotification(lf("Oops, we could not find this script."))
                        else
                            core.handleNetworkError(e)
                    });
            }
        }
    })
}

export function showResetDialogAsync() {
    return core.confirmAsync({
        header: lf("Reset"),
        body: lf("You are about to clear all projects. Are you sure? This operation cannot be undone."),
        agreeLbl: lf("Reset"),
        agreeClass: "red",
        agreeIcon: "sign out",
        disagreeLbl: lf("Cancel")
    })
}