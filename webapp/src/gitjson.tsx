import * as React from "react"
import * as pkg from "./package"
import * as core from "./core"
import * as srceditor from "./srceditor"
import * as sui from "./sui"
import * as workspace from "./workspace";
import * as dialogs from "./dialogs";
import * as coretsx from "./coretsx";
import * as data from "./data";
import * as markedui from "./marked";
import * as compiler from "./compiler";
import * as cloudsync from "./cloudsync";

const MAX_COMMIT_DESCRIPTION_LENGTH = 70;

interface DiffCache {
    file: pkg.File;
    gitFile: string;
    editorFile: string;
    diff: JSX.Element;
    whitespace?: boolean;
    revert: () => void;
}

interface GithubProps {
    parent: pxt.editor.IProjectView;
}

interface GithubState {
    isVisible?: boolean;
    description?: string;
    needsCommitMessage?: boolean;
    needsPull?: boolean;
    triedFork?: boolean;
    previousCfgKey?: string;
    loadingMessage?: string;
}

class GithubComponent extends data.Component<GithubProps, GithubState> {
    private diffCache: pxt.Map<DiffCache> = {};

    constructor(props: GithubProps) {
        super(props);
        this.goBack = this.goBack.bind(this);
        this.handlePullClick = this.handlePullClick.bind(this);
        this.handleBranchClick = this.handleBranchClick.bind(this);
        this.handleGithubError = this.handleGithubError.bind(this);
    }

    private clearCache() {
        this.diffCache = {};
    }

    private async saveGitJsonAsync(gs: pxt.github.GitJson) {
        const f = pkg.mainEditorPkg().files[pxt.github.GIT_JSON]
        await f.setContentAsync(JSON.stringify(gs, null, 4))
    }

    private async switchToBranchAsync(newBranch: string) {
        const { header } = this.props.parent.state;
        const gs = this.getGitJson();
        const parsed = this.parsedRepoId()
        header.githubId = parsed.fullName + "#" + newBranch
        gs.repo = header.githubId
        gs.prUrl = null
        await this.saveGitJsonAsync(gs)
    }

    private async newBranchAsync() {
        const gid = this.parsedRepoId()
        const initialBranchName = await pxt.github.getNewBranchNameAsync(gid.fullName, "patch-")
        const branchName = await core.promptAsync({
            header: lf("New branch name"),
            body: lf("Name cannot have spaces or special characters. Examples: {0}",
                "my_feature, add-colors, fix_something"),
            agreeLbl: lf("Create"),
            initialValue: initialBranchName,
            hasCloseIcon: true,
            onInputValidation: v => {
                if (/[^\w\-]/.test(v))
                    return lf("Don't use spaces or special characters.")
                return undefined;
            }
        })
        if (!branchName)
            return

        this.showLoading(lf("creating branch..."));
        try {
            const gs = this.getGitJson()
            await pxt.github.createNewBranchAsync(gid.fullName, branchName, gs.commit.sha)
            await this.switchToBranchAsync(branchName)
            this.forceUpdate();
        } catch (e) {
            this.handleGithubError(e);
        } finally {
            this.hideLoading();
        }
    }

    private async switchBranchAsync() {
        const gid = this.parsedRepoId()
        const branches = await pxt.github.listRefsExtAsync(gid.fullName, "heads")
        const branchList = Object.keys(branches.refs).map(r => ({
            name: r,
            description: branches.refs[r],
            onClick: async () => {
                core.hideDialog()
                await this.setStateAsync({ needsCommitMessage: false });
                const prevBranch = this.parsedRepoId().tag
                try {
                    await this.switchToBranchAsync(r)
                    await this.pullAsync()
                } finally {
                    if (this.state.needsCommitMessage) {
                        await this.switchToBranchAsync(prevBranch)
                    }
                }
            }
        }))

        branchList.unshift({
            name: lf("Create new branch"),
            description: lf("Based on {0}", gid.tag),
            onClick: () => {
                core.hideDialog()
                return this.newBranchAsync()
            }
        })

        await core.confirmAsync({
            header: lf("Switch to a different branch"),
            hasCloseIcon: true,
            hideAgree: true,
            hideCancel: true,
            /* tslint:disable:react-a11y-anchors */
            jsx: <div className="ui form">
                <div className="ui relaxed divided list" role="menu">
                    {branchList.map(r =>
                        <div key={r.name} className="item link">
                            <i className="large github middle aligned icon"></i>
                            <div className="content">
                                <a onClick={r.onClick} role="menuitem" className="header">{r.name}</a>
                                <div className="description">
                                    {r.description}
                                </div>
                            </div>
                        </div>)}
                </div>
            </div>,
        })
    }

    private handleBranchClick(e: React.MouseEvent<HTMLElement>) {
        pxt.tickEvent("github.branch");
        e.stopPropagation();
        this.switchBranchAsync().done();
    }

    private goBack() {
        pxt.tickEvent("github.backButton", undefined, { interactiveConsent: true })
        this.props.parent.openPreviousEditor()
    }

    private handlePullClick(e: React.MouseEvent<HTMLElement>) {
        pxt.tickEvent("github.pull");
        this.pullAsync().done();
    }

    private async forkAsync(fromError: boolean) {
        const parsed = this.parsedRepoId()
        const pref = fromError ? lf("You don't seem to have write permission to {0}.\n", parsed.fullName) : ""
        const res = await core.confirmAsync({
            header: lf("Do you want to fork {0}?", parsed.fullName),
            body: pref +
                lf("Forking repo creates a copy under your account. You can later ask {0} to include your changes via a pull request.",
                    parsed.owner),
            agreeLbl: "Fork",
            agreeIcon: "copy outline"
        })
        if (!res)
            return

        this.showLoading(lf("forking repo (this may take a minute or two)..."))
        try {
            const gs = this.getGitJson();
            const newGithubId = await pxt.github.forkRepoAsync(parsed.fullName, gs.commit.sha)
            const { header } = this.props.parent.state;
            header.githubId = newGithubId
            gs.repo = header.githubId
            await this.saveGitJsonAsync(gs)
        } catch (e) {
            this.handleGithubError(e)
        } finally {
            this.hideLoading();
        }
    }

    private handleGithubError(e: any) {
        const statusCode = parseInt(e.statusCode);
        if (e.isOffline || statusCode === 0)
            core.warningNotification(lf("Please connect to internet and try again."));
        else if (statusCode == 401)
            core.warningNotification(lf("GitHub access token looks invalid; logout and try again."));
        else if (e.needsWritePermission) {
            if (this.state.triedFork) {
                core.warningNotification(lf("You don't have write permission."));
            } else {
                core.hideDialog()
                this.forkAsync(true).done()
            }
        }
        else if (e.isMergeConflictMarkerError) {
            pxt.tickEvent("github.commitwithconflicts");
            core.warningNotification(lf("Please merge all conflicts before commiting changes."))
        } else {
            pxt.reportException(e);
            core.warningNotification(lf("Oops, something went wrong. Please try again."))
        }
    }

    async bumpAsync() {
        const v = pxt.semver.parse(pkg.mainPkg.config.version || "0.0.0")
        const vmajor = pxt.semver.parse(pxt.semver.stringify(v)); vmajor.major++; vmajor.minor = 0; vmajor.patch = 0;
        const vminor = pxt.semver.parse(pxt.semver.stringify(v)); vminor.minor++; vminor.patch = 0;
        const vpatch = pxt.semver.parse(pxt.semver.stringify(v)); vpatch.patch++;

        let bumpType: string = "patch";
        function onBumpChange(e: React.ChangeEvent<HTMLInputElement>) {
            bumpType = e.currentTarget.name;
            coretsx.forceUpdate();
        }
        const ok = await core.confirmAsync({
            header: lf("Pick a release version"),
            agreeLbl: lf("Create release"),
            disagreeLbl: lf("Cancel"),
            jsxd: () => <div className="grouped fields">
                <label>{lf("Choose a release version that describes the changes you made to the code.")}
                    {sui.helpIconLink("/github/release#versioning", lf("Learn about version numbers."))}
                </label>
                <div className="field">
                    <div className="ui radio checkbox">
                        <input type="radio" name="patch" checked={bumpType == "patch"} aria-checked={bumpType == "patch"} onChange={onBumpChange} />
                        <label>{lf("{0}: patch (bug fixes or other non-user visible changes)", pxt.semver.stringify(vpatch))}</label>
                    </div>
                </div>
                <div className="field">
                    <div className="ui radio checkbox">
                        <input type="radio" name="minor" checked={bumpType == "minor"} aria-checked={bumpType == "minor"} onChange={onBumpChange} />
                        <label>{lf("{0}: minor change (added function or optional parameters)", pxt.semver.stringify(vminor))}</label>
                    </div>
                </div>
                <div className="field">
                    <div className="ui radio checkbox">
                        <input type="radio" name="major" checked={bumpType == "major"} aria-checked={bumpType == "major"} onChange={onBumpChange} />
                        <label>{lf("{0}: major change (renamed functions, deleted parameters or functions)", pxt.semver.stringify(vmajor))}</label>
                    </div>
                </div>
            </div>
        })

        if (!ok)
            return

        let newv = vpatch;
        if (bumpType == "major")
            newv = vmajor;
        else if (bumpType == "minor")
            newv = vminor;
        const newVer = pxt.semver.stringify(newv)
        this.showLoading(lf("creating release..."));
        try {
            const { header } = this.props.parent.state;
            await workspace.bumpAsync(header, newVer)
            pkg.mainPkg.config.version = newVer;
            await this.maybeReloadAsync()
            this.hideLoading();
            core.infoNotification(lf("GitHub release created."))
        } catch (e) {
            this.handleGithubError(e);
        } finally {
            this.hideLoading();
        }
    }

    private async showLoading(msg: string) {
        await this.setStateAsync({ loadingMessage: msg });
        core.showLoading("githubjson", msg);
    }

    private hideLoading() {
        if (this.state.loadingMessage) {
            core.hideLoading("githubjson");
            this.setState({ loadingMessage: undefined });
        }
    }

    private pkgConfigKey(cfgtxt: string) {
        const cfg = JSON.parse(cfgtxt) as pxt.PackageConfig
        delete cfg.version
        return JSON.stringify(cfg)
    }

    private async maybeReloadAsync() {
        // here, the true state of files is stored in workspace
        const { header } = this.props.parent.state;
        const files = await workspace.getTextAsync(header.id);
        // save file content from workspace, so they won't get overridden
        pkg.mainEditorPkg().setFiles(files);
        // check if we need to reload header
        const newKey = this.pkgConfigKey(files[pxt.CONFIG_NAME])
        if (newKey == this.state.previousCfgKey) {
            // refresh pull status
            await this.refreshPullAsync();
        } else {
            await this.setStateAsync({ needsPull: undefined, previousCfgKey: newKey });
            await this.props.parent.reloadHeaderAsync();
        }
    }

    private async pullAsync() {
        this.showLoading(lf("pulling changes from GitHub..."));
        try {
            this.setState({ needsPull: undefined });
            const status = await workspace.pullAsync(this.props.parent.state.header)
                .catch(this.handleGithubError)
            switch (status) {
                case workspace.PullStatus.NoSourceControl:
                case workspace.PullStatus.UpToDate:
                    this.setState({ needsPull: false });
                    break
                case workspace.PullStatus.NeedsCommit:
                    this.setState({ needsCommitMessage: true });
                    await this.refreshPullAsync();
                    break
                case workspace.PullStatus.GotChanges:
                    await this.maybeReloadAsync();
                    break
            }
        } catch (e) {
            this.handleGithubError(e);
        } finally {
            this.hideLoading();
        }
    }

    private getGitJson(): pxt.github.GitJson {
        const gitJsonText = pkg.mainEditorPkg().getAllFiles()[pxt.github.GIT_JSON]
        const gitJson = JSON.parse(gitJsonText || "{}") as pxt.github.GitJson
        return gitJson;
    }

    parsedRepoId() {
        const header = this.props.parent.state.header;
        return pxt.github.parseRepoId(header.githubId);
    }

    private async commitCoreAsync() {
        const { parent } = this.props;
        const { header } = parent.state;
        const repo = header.githubId;

        // pull changes and merge; if any conflicts, bail out
        await workspace.pullAsync(header);
        // check if any merge markers
        const hasConflicts = await workspace.hasMergeConflictMarkers(header);
        if (hasConflicts) {
            // bail out
            // maybe needs a reload
            await this.maybeReloadAsync();
            core.warningNotification(lf("Merge conflicts found. Resolve them before commiting."))
            return;
        }

        // continue with commit
        let commitId = await workspace.commitAsync(header, {
            message: this.state.description,
            blocksScreenshotAsync: () => this.props.parent.blocksScreenshotAsync(1),
            blocksDiffScreenshotAsync: () => {
                const f = pkg.mainEditorPkg().sortedFiles().find(f => f.name == "main.blocks");
                const diff = pxt.blocks.diffXml(f.baseGitContent, f.content);
                if (diff && diff.ws)
                    return pxt.blocks.layout.toPngAsync(diff.ws, 1);
                return Promise.resolve(undefined);
            }
        })
        if (commitId) {
            // merge failure; do a PR
            // we could ask the user, but it's unlikely they can do anything else to fix it
            let prUrl = await workspace.prAsync(header, commitId,
                this.state.description || lf("Commit conflict"))
            await dialogs.showPRDialogAsync(repo, prUrl)
            // when the dialog finishes, we pull again - it's possible the user
            // has resolved the conflict in the meantime
            await workspace.pullAsync(header)
            // skip bump in this case - we don't know if it was merged
        } else {
            // maybe needs a reload
            await this.maybeReloadAsync();
        }
        this.setState({ description: "" });
    }

    async commitAsync() {
        this.setState({ needsCommitMessage: false });
        this.showLoading(lf("commit and push changes to GitHub..."));
        try {
            await this.commitCoreAsync()
            await this.maybeReloadAsync()
        } catch (e) {
            this.handleGithubError(e);
        } finally {
            this.hideLoading()
        }
    }

    private lineDiff(lineA: string, lineB: string): { a: JSX.Element, b: JSX.Element } {
        const df = pxt.github.diff(lineA.split("").join("\n"), lineB.split("").join("\n"), {
            context: Infinity
        })
        if (!df) // diff failed
            return {
                a: <div className="inline-diff"><code>{lineA}</code></div>,
                b: <div className="inline-diff"><code>{lineB}</code></div>
            }

        const ja: JSX.Element[] = []
        const jb: JSX.Element[] = []
        for (let i = 0; i < df.length;) {
            let j = i
            const mark = df[i][0]
            while (df[j] && df[j][0] == mark)
                j++
            const chunk = df.slice(i, j).map(s => s.slice(2)).join("")
            if (mark == " ") {
                ja.push(<code key={i} className="ch-common">{chunk}</code>)
                jb.push(<code key={i} className="ch-common">{chunk}</code>)
            } else if (mark == "-") {
                ja.push(<code key={i} className="ch-removed">{chunk}</code>)
            } else if (mark == "+") {
                jb.push(<code key={i} className="ch-added">{chunk}</code>)
            } else {
                pxt.Util.oops()
            }
            i = j
        }
        return {
            a: <div className="inline-diff">{ja}</div>,
            b: <div className="inline-diff">{jb}</div>
        }
    }

    private showDiff(isBlocksMode: boolean, f: pkg.File) {
        let cache = this.diffCache[f.name]
        if (!cache || cache.file !== f) {
            cache = { file: f } as any
            this.diffCache[f.name] = cache
        }
        if (cache.gitFile == f.baseGitContent && cache.editorFile == f.content)
            return cache.diff

        const isBlocks = /\.blocks$/.test(f.name)
        const showWhitespace = () => {
            if (!cache.whitespace) {
                cache.whitespace = true;
                cache.diff = createDiff();
                this.forceUpdate();
            }
        }
        const createDiff = () => {
            let jsxEls: { diffJSX: JSX.Element, legendJSX?: JSX.Element, conflicts: number };
            if (isBlocks) {
                jsxEls = this.createBlocksDiffJSX(f);
            } else {
                jsxEls = this.createTextDiffJSX(f, !cache.whitespace);
            }
            // tslint:disable: react-this-binding-issue
            return <div key={f.name} className="ui segments filediff">
                <div className="ui segment diffheader">
                    {isBlocksMode && f.name == "main.blocks" ? undefined : <span>{f.name}</span>}
                    <sui.Button className="small" icon="undo" text={lf("Revert")}
                        ariaLabel={lf("Revert file")} title={lf("Revert file")}
                        textClass={"landscape only"} onClick={cache.revert} />
                    {jsxEls.legendJSX}
                    {jsxEls.conflicts ? <p>{lf("Merge conflicts found. Resolve them before commiting.")}</p> : undefined}
                    {deletedFiles.length == 0 ? undefined :
                        <p>
                            {lf("Reverting this file will also restore: {0}", deletedFiles.join(", "))}
                        </p>}
                    {addedFiles.length == 0 ? undefined :
                        <p>
                            {lf("Reverting this file will also remove: {0}", addedFiles.join(", "))}
                        </p>}
                    {virtualF && !isBlocksMode ? <p>
                        {lf("Reverting this file will also revert: {0}", virtualF.name)}
                    </p> : undefined}
                </div>
                {jsxEls.diffJSX ?
                    <div className="ui segment diff">
                        {jsxEls.diffJSX}
                    </div>
                    :
                    <div className="ui segment">
                        <p>
                            {lf("Whitespace changes only.")}
                            <sui.Link className="link" text={lf("Show")} onClick={showWhitespace} />
                        </p>
                    </div>
                }
            </div>;
        }

        let deletedFiles: string[] = []
        let addedFiles: string[] = []
        if (f.name == pxt.CONFIG_NAME) {
            const oldCfg = pxt.allPkgFiles(JSON.parse(f.baseGitContent))
            const newCfg = pxt.allPkgFiles(JSON.parse(f.content))
            deletedFiles = oldCfg.filter(fn => newCfg.indexOf(fn) == -1)
            addedFiles = newCfg.filter(fn => oldCfg.indexOf(fn) == -1)
        }
        // backing .ts for .blocks/.py files
        let virtualF = isBlocksMode && pkg.mainEditorPkg().files[f.getVirtualFileName(pxt.JAVASCRIPT_PROJECT_NAME)];
        if (virtualF == f) virtualF = undefined;

        cache.gitFile = f.baseGitContent
        cache.editorFile = f.content
        cache.revert = () => this.revertFileAsync(f, deletedFiles, addedFiles, virtualF);
        cache.diff = createDiff()
        return cache.diff;
    }

    private createBlocksDiffJSX(f: pkg.File): { diffJSX: JSX.Element, legendJSX?: JSX.Element, conflicts: number } {
        const baseContent = f.baseGitContent || "";
        const content = f.content;

        let diffJSX: JSX.Element;
        if (!content) {
            // the xml payload needs to be decompiled
            diffJSX = <div className="ui basic segment">{lf("Your blocks were updated. Go back to the editor to view the changes.")}</div>
        } else {
            const markdown =
                `
\`\`\`diffblocksxml
${baseContent}
---------------------
${content}
\`\`\`
`;
            diffJSX = <markedui.MarkedContent key={`diffblocksxxml${f.name}`} parent={this.props.parent} markdown={markdown} />
        }
        const legendJSX = <p className="legend">
            <span><span className="added icon"></span>{lf("added, changed or moved")}</span>
            <span><span className="deleted icon"></span>{lf("deleted")}</span>
            <span><span className="notchanged icon"></span>{lf("not changed")}</span>
            {sui.helpIconLink("/github/diff#blocks", lf("Learn about reading differences in blocks code."))}
        </p>;
        return { diffJSX, legendJSX, conflicts: 0 };
    }

    private createTextDiffJSX(f: pkg.File, ignoreWhitespace: boolean): { diffJSX: JSX.Element, legendJSX?: JSX.Element, conflicts: number } {
        const baseContent = f.baseGitContent || "";
        const content = f.content;
        const classes: pxt.Map<string> = {
            "@": "diff-marker",
            " ": "diff-unchanged",
            "+": "diff-added",
            "-": "diff-removed",
        }
        const diffLines = pxt.github.diff(baseContent, content, { ignoreWhitespace: !!ignoreWhitespace })
        if (!diffLines) {
            pxt.tickEvent("github.diff.toobig");
            return {
                diffJSX: <div>{lf("Too many differences to render diff.")}</div>,
                conflicts: 0
            }
        }
        let conflicts = 0;
        let conflictState: "local" | "remote" | "footer" | "" = "";
        let lnA = 0, lnB = 0
        let lastMark = ""
        let savedDiff: JSX.Element = null
        const linesTSX: JSX.Element[] = [];
        diffLines.forEach((ln, idx) => {
            const m = /^@@ -(\d+),\d+ \+(\d+),\d+/.exec(ln)
            if (m) {
                lnA = parseInt(m[1]) - 1
                lnB = parseInt(m[2]) - 1
            } else {
                if (ln[0] != "+")
                    lnA++
                if (ln[0] != "-")
                    lnB++
            }
            const nextMark = diffLines[idx + 1] ? diffLines[idx + 1][0] : ""
            const next2Mark = diffLines[idx + 2] ? diffLines[idx + 2][0] : ""
            const lnSrc = ln.slice(2);
            let currDiff = <code>{lnSrc}</code>

            if (savedDiff) {
                currDiff = savedDiff
                savedDiff = null
            } else if (ln[0] == "-" && (lastMark == " " || lastMark == "@") && nextMark == "+"
                && (next2Mark == " " || next2Mark == "@" || next2Mark == "")) {
                const r = this.lineDiff(ln.slice(2), diffLines[idx + 1].slice(2))
                currDiff = r.a
                savedDiff = r.b
            }
            lastMark = ln[0];
            let diffMark = lastMark;
            let postTSX: JSX.Element;
            if (lastMark == "+" && /^<<<<<<<[^<]/.test(lnSrc)) {
                conflicts++;
                conflictState = "local";
                diffMark = "@";
                linesTSX.push(<tr key={"conflictheader" + lnA + lnB} className="conflict ui small header">
                    <td colSpan={4} className="ui small header">{lf("Merge conflict")}</td>
                </tr>);
                linesTSX.push(<tr key={"conflictdescr" + lnA + lnB} className="conflict ui description">
                    <td colSpan={4} className="ui small description">
                        {lf("Changes from GitHub are conflicting with local changes.")}
                        {sui.helpIconLink("/github/merge-conflict", lf("Learn about merge conflicts and resolution."))}
                    </td>
                </tr>);
                const lnMarker = idx - 1;
                const keepLocalHandler = () => this.handleMergeConflictResolution(f, lnMarker, true, false);
                const keepRemoteHandler = () => this.handleMergeConflictResolution(f, lnMarker, false, true);
                const keepBothHandler = () => this.handleMergeConflictResolution(f, lnMarker, true, true);
                // tslint:disable: react-this-binding-issue
                linesTSX.push(<tr key={"merge" + lnA + lnB} className="conflict ui mergebtn">
                    <td colSpan={4} className="ui">
                        <sui.Button className="compact" text={lf("Keep local")} title={lf("Ignore the changes from GitHub.")} onClick={keepLocalHandler} />
                        <sui.Button className="compact" text={lf("Keep remote")} title={lf("Override local changes with changes from GitHub.")} onClick={keepRemoteHandler} />
                        <sui.Button className="compact" text={lf("Keep both")} title={lf("Keep both local and remote changes.")} onClick={keepBothHandler} />
                    </td>
                </tr>);
            }
            else if (lastMark == "+" && /^>>>>>>>[^>]/.test(lnSrc)) {
                conflictState = "footer";
                diffMark = "@";
            }
            else if (lastMark == "+" && /^=======$/.test(lnSrc)) {
                diffMark = "@";
                conflictState = "remote";
            }

            // add diff
            const isMarker = diffMark == "@";
            const className = `${conflictState ? "conflict" : ""} ${conflictState} ${classes[diffMark]}`;
            linesTSX.push(
                <tr key={lnA + lnB} className={className}>
                    <td className="line-a" data-content={lnA}></td>
                    <td className="line-b" data-content={lnB}></td>
                    {isMarker
                        ? <td colSpan={2} className="change"><code>{ln}</code></td>
                        : <td className="marker" data-content={diffMark}></td>
                    }
                    {isMarker
                        ? undefined
                        : <td className="change">{currDiff}</td>
                    }
                </tr>);

            if (postTSX)
                linesTSX.push(postTSX);

            if (conflictState == "footer")
                conflictState = "";
        })
        const diffJSX = linesTSX.length ? <table className="diffview">
            <tbody>
                {linesTSX}
            </tbody>
        </table> : undefined;
        const legendJSX: JSX.Element = undefined;

        return { diffJSX, legendJSX, conflicts }
    }

    private handleMergeConflictResolution(f: pkg.File, startMarkerLine: number, local: boolean, remote: boolean) {
        pxt.tickEvent("github.conflict.resolve", { "local": local ? 1 : 0, "remote": remote ? 1 : 0 }, { interactiveConsent: true });

        const content = pxt.github.resolveMergeConflictMarker(f.content, startMarkerLine, local, remote);
        f.setContentAsync(content)
            .then(() => delete this.diffCache[f.name]) // clear cached diff
            .done(() => this.props.parent.forceUpdate());
    }

    private async revertFileAsync(f: pkg.File, deletedFiles: string[], addedFiles: string[], virtualF: pkg.File) {
        pxt.tickEvent("github.revert", { start: 1 }, { interactiveConsent: true })
        const res = await core.confirmAsync({
            header: lf("Would you like to revert changes to {0}?", f.name),
            body: lf("Changes will be lost for good. No undo."),
            agreeLbl: lf("Revert"),
            agreeClass: "red",
            agreeIcon: "trash",
        })

        if (!res)
            return

        pxt.tickEvent("github.revert", { ok: 1 })
        this.setState({ needsCommitMessage: false }); // maybe we no longer do

        if (f.baseGitContent == null) {
            await pkg.mainEditorPkg().removeFileAsync(f.name)
            await this.props.parent.reloadHeaderAsync()
        } else if (f.name == pxt.CONFIG_NAME) {
            const gs = this.getGitJson()
            for (let d of deletedFiles) {
                const prev = workspace.lookupFile(gs.commit, d)
                pkg.mainEditorPkg().setFile(d, prev && prev.blobContent || "// Cannot restore.")
            }
            for (let d of addedFiles) {
                delete pkg.mainEditorPkg().files[d]
            }
            await f.setContentAsync(f.baseGitContent)
            await this.props.parent.reloadHeaderAsync()
        } else {
            await f.setContentAsync(f.baseGitContent)
            // revert generated .ts file as well
            if (virtualF)
                await virtualF.setContentAsync(virtualF.baseGitContent);
            this.forceUpdate();
        }
    }

    private refreshPullAsync() {
        return this.setStateAsync({ needsPull: undefined })
            .then(() => workspace.hasPullAsync(this.props.parent.state.header))
            .then(v => this.setStateAsync({ needsPull: v }))
            .catch(e => {
                const statusCode = parseInt(e.statusCode);
                if (e.isOffline || statusCode === 0) {
                    // don't report offline on this one
                    this.setState({ needsPull: undefined });
                    return;
                }
                this.handleGithubError(e);
            });
    }

    setVisible(b: boolean) {
        if (b === this.state.isVisible) return;

        if (b) {
            this.setState({
                previousCfgKey: this.pkgConfigKey(pkg.mainEditorPkg().files[pxt.CONFIG_NAME].content)
            });
            this.refreshPullAsync().done();
        } else {
            this.clearCache();
            this.setState({
                needsCommitMessage: false,
                needsPull: undefined
            });
        }
    }

    renderCore(): JSX.Element {
        // TODO: disable commit changes if no changes available
        // TODO: commitAsync handle missing token or failed push

        const isBlocksMode = pkg.mainPkg.getPreferredEditor() == pxt.BLOCKS_PROJECT_NAME;
        const diffFiles = pkg.mainEditorPkg().sortedFiles().filter(p => p.baseGitContent != p.content)
        const needsCommit = diffFiles.length > 0;
        const displayDiffFiles = isBlocksMode && !pxt.options.debug ? diffFiles.filter(f => /\.blocks$/.test(f.name)) : diffFiles;

        const { needsPull } = this.state;
        const githubId = this.parsedRepoId()
        const master = githubId.tag == "master";
        const gs = this.getGitJson();
        // don't use gs.prUrl, as it gets cleared often
        const url = `https://github.com/${githubId.fullName}${master ? "" : `/tree/${githubId.tag}`}`;
        const needsToken = !pxt.github.token;
        // this will show existing PR if any
        const prUrl = !gs.isFork && master ? null :
            `https://github.com/${githubId.fullName}/compare/${githubId.tag}?expand=1`
        return (
            <div id="githubArea">
                <div id="serialHeader" className="ui serialHeader">
                    <div className="leftHeaderWrapper">
                        <div className="leftHeader">
                            <sui.Button title={lf("Go back")} icon="arrow left" text={lf("Go back")} textClass="landscape only" tabIndex={0} onClick={this.goBack} onKeyDown={sui.fireClickOnEnter} />
                        </div>
                    </div>
                    <div className="rightHeader">
                        <sui.Button icon={`${needsPull === true ? "long arrow alternate down" : needsPull === false ? "check" : "sync"}`}
                            className={needsPull === true ? "positive" : ""}
                            text={lf("Pull changes")} textClass={"landscape only"} title={lf("Pull changes from GitHub to get your code up-to-date.")} onClick={this.handlePullClick} onKeyDown={sui.fireClickOnEnter} />
                        {!needsToken && !isBlocksMode ? <sui.Link className="ui button" icon="user plus" href={`https://github.com/${githubId.fullName}/settings/collaboration`} target="_blank" title={lf("Invite collaborators.")} onKeyDown={sui.fireClickOnEnter} /> : undefined}
                        <sui.Link className="ui button" icon="github" href={url} title={lf("Open repository in GitHub.")} target="_blank" onKeyDown={sui.fireClickOnEnter} />
                    </div>
                </div>
                <MessageComponent parent={this} needsToken={needsToken} githubId={githubId} master={master} gs={gs} isBlocks={isBlocksMode} needsCommit={needsCommit} />
                <div className="ui form">
                    {!prUrl ? undefined :
                        <a href={prUrl} role="button" className="ui link create-pr"
                            target="_blank" rel="noopener noreferrer">
                            {lf("Pull request")}
                        </a>}
                    <h3 className="header">
                        <i className="large github icon" />
                        <span className="repo-name">{githubId.fullName}</span>
                        <span onClick={this.handleBranchClick} role="button" className="repo-branch">{"#" + githubId.tag}<i className="dropdown icon" /></span>
                    </h3>
                    {needsCommit ?
                        <CommmitComponent parent={this} needsToken={needsToken} githubId={githubId} master={master} gs={gs} isBlocks={isBlocksMode} needsCommit={needsCommit} />
                        : <div className="ui segment">
                            {lf("No local changes found.")}
                            {lf("Your project is saved in GitHub.")}
                        </div>}
                    {displayDiffFiles.length ? <div className="ui">
                        {displayDiffFiles.map(df => this.showDiff(isBlocksMode, df))}
                    </div> : undefined}
                    {!isBlocksMode ? <ExtensionZone parent={this} needsToken={needsToken} githubId={githubId} master={master} gs={gs} isBlocks={isBlocksMode} needsCommit={needsCommit} /> : undefined}
                </div>
            </div>
        )
    }
}

interface GitHubViewProps {
    githubId: pxt.github.ParsedRepo;
    needsToken: boolean;
    master: boolean;
    parent: GithubComponent;
    gs: pxt.github.GitJson;
    isBlocks: boolean;
    needsCommit: boolean;
}

class MessageComponent extends sui.StatelessUIElement<GitHubViewProps> {
    constructor(props: GitHubViewProps) {
        super(props)
        this.handleSignInClick = this.handleSignInClick.bind(this);
    }

    private handleSignInClick(e: React.MouseEvent<HTMLElement>) {
        pxt.tickEvent("github.signin");
        e.stopPropagation();
        cloudsync.githubProvider().loginAsync()
            .done(() => this.props.parent.forceUpdate());
    }

    renderCore() {
        const { needsCommitMessage } = this.props.parent.state;
        const targetTheme = pxt.appTarget.appTheme;
        const needsToken = !pxt.github.token;

        if (needsToken)
            return <div className={`ui ${targetTheme.invertedMenu ? 'inverted' : ''} info message join`}>
                <p>{lf("Host your code on GitHub and work together with friends on projects.")}
                    {sui.helpIconLink("/github", lf("Learn more about GitHub"))}
                </p>
                <sui.Button className="tiny green" text={lf("Sign in")} onClick={this.handleSignInClick} />
            </div>;

        if (!needsToken && needsCommitMessage)
            return <div className="ui warning message">
                <div className="content">
                    {lf("You need to commit your changes before you can pull from GitHub.")}
                </div>
            </div>

        return <div />;
    }
}

class CommmitComponent extends sui.StatelessUIElement<GitHubViewProps> {
    constructor(props: GitHubViewProps) {
        super(props)
        this.handleDescriptionChange = this.handleDescriptionChange.bind(this);
        this.handleCommitClick = this.handleCommitClick.bind(this);
    }

    private handleDescriptionChange(v: string) {
        this.props.parent.setState({ description: v });
    }

    private async handleCommitClick(e: React.MouseEvent<HTMLElement>) {
        pxt.tickEvent("github.commit");
        e.stopPropagation();
        await cloudsync.githubProvider().loginAsync();
        if (pxt.github.token)
            await this.props.parent.commitAsync();
    }

    renderCore() {
        const { description } = this.props.parent.state;
        const descrError = description && description.length > MAX_COMMIT_DESCRIPTION_LENGTH
            ? lf("Your description is getting long...") : undefined;
        return <div>
            <div className="ui field">
                <sui.Input type="text" placeholder={lf("Describe your changes.")} value={this.props.parent.state.description} onChange={this.handleDescriptionChange}
                    error={descrError} />
            </div>
            <div className="ui field">
                <sui.Button className="primary" text={lf("Commit changes")} icon="long arrow alternate up" onClick={this.handleCommitClick} onKeyDown={sui.fireClickOnEnter} />
                <span className="inline-help">{lf("Push your changes to GitHub.")}
                    {sui.helpIconLink("/github/commit", lf("Learn about commiting and pushing code into GitHub."))}
                </span>
            </div>
        </div>
    }
}

class ExtensionZone extends sui.StatelessUIElement<GitHubViewProps> {
    constructor(props: GitHubViewProps) {
        super(props);
        this.handleBumpClick = this.handleBumpClick.bind(this);
    }

    private handleBumpClick(e: React.MouseEvent<HTMLElement>) {
        pxt.tickEvent("github.bump", undefined, { interactiveConsent: true });
        e.stopPropagation();
        const { needsCommit, master } = this.props;
        if (needsCommit)
            core.confirmAsync({
                header: lf("Commit your changes..."),
                body: lf("You need to commit your local changes to create a release."),
                agreeLbl: lf("Ok"),
                hideAgree: true
            });
        else if (!master)
            core.confirmAsync({
                header: lf("Checkout the master branch..."),
                body: lf("You need to checkout the master branch to create a release."),
                agreeLbl: lf("Ok"),
                hideAgree: true
            });
        else
            cloudsync.githubProvider()
                .loginAsync()
                .then(() => pxt.github.token && this.props.parent.bumpAsync());
    }

    renderCore() {
        const { needsToken, githubId, gs } = this.props;
        const header = this.props.parent.props.parent.state.header;
        const needsLicenseMessage = !needsToken && gs.commit && !gs.commit.tree.tree.some(f =>
            /^LICENSE/.test(f.path.toUpperCase()) || /^COPYING/.test(f.path.toUpperCase()))
        const testurl = header && `${window.location.href.replace(/#.*$/, '')}#testproject:${header.id}`;
        return <div className="ui transparent segment">
            <div className="ui header">{lf("Extension zone")}</div>
            <div className="ui field">
                <a href={testurl}
                    role="button" className="ui button"
                    target={`${pxt.appTarget.id}testproject`} rel="noopener noreferrer">
                    {lf("Test Extension")}
                </a>
                <span className="inline-help">
                    {lf("Open a test project that uses this extension.")}
                    {sui.helpIconLink("/github/test-extension", lf("Learn about testing extensions."))}
                </span>
            </div>
            {gs.commit && gs.commit.tag ?
                <div className="ui field">
                    <p className="inline-help">{lf("Current release: {0}", gs.commit.tag)}
                        {sui.helpIconLink("/github/release", lf("Learn about releases."))}
                    </p>
                </div>
                :
                <div className="ui field">
                    <sui.Button text={lf("Create release")}
                        onClick={this.handleBumpClick}
                        onKeyDown={sui.fireClickOnEnter} />
                    <span className="inline-help">
                        {lf("Bump up the version number and create a release on GitHub.")}
                        {sui.helpIconLink("/github/release", lf("Learn more about extension releases."))}
                    </span>
                </div>}
            {needsLicenseMessage ? <div className={`ui field`}>
                <a href={`https://github.com/${githubId.fullName}/community/license/new?branch=${githubId.tag}&template=mit`}
                    role="button" className="ui button"
                    target="_blank" rel="noopener noreferrer">
                    {lf("Add license")}
                </a>
                <span className="inline-help">
                    {lf("Your project doesn't seem to have a license.")}
                    {sui.helpIconLink("/github/license", lf("Learn more about licenses."))}
                </span>
            </div> : undefined}
        </div>
    }
}

export class Editor extends srceditor.Editor {
    private view: GithubComponent;

    constructor(public parent: pxt.editor.IProjectView) {
        super(parent)
        this.handleViewRef = this.handleViewRef.bind(this);
    }

    getId() {
        return "githubEditor"
    }

    getCurrentSource(): string {
        // modifications are done on the EditorFile object, so make sure
        // we don't store some cached data in this.currSource
        const f = pkg.mainEditorPkg().files[pxt.github.GIT_JSON]
        return f.content
    }

    hasHistory() { return true; }

    hasEditorToolbar() {
        return false
    }

    setVisible(b: boolean) {
        this.isVisible = b;
        if (this.view) this.view.setVisible(b);
    }

    setHighContrast(hc: boolean) {
    }

    acceptsFile(file: pkg.File) {
        return file.name === pxt.github.GIT_JSON;
    }

    loadFileAsync(file: pkg.File, hc?: boolean): Promise<void> {
        // force refresh to ensure we have a view
        return super.loadFileAsync(file, hc)
            .then(() => compiler.getBlocksAsync()) // make sure to load block definitions
            .then(() => this.parent.forceUpdate());
    }

    handleViewRef = (c: GithubComponent) => {
        this.view = c;
        if (this.view)
            this.view.setVisible(this.isVisible);
    }

    display() {
        if (!this.isVisible)
            return undefined;

        const header = this.parent.state.header;
        if (!header || !header.githubId) return undefined;

        return <GithubComponent ref={this.handleViewRef} parent={this.parent} />
    }
}
