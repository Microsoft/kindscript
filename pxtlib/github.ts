namespace pxt.github {
    interface GHRef {
        ref: string;
        url: string;
        object: {
            sha: string;
            type: string;
            url: string;
        }
    }

    export interface RefsResult {
        refs: pxt.Map<string>;
        head?: string;
    }

    export function useProxy() {
        if (U.isNodeJS)
            return false // bypass proxy for CLI
        if (pxt.appTarget && pxt.appTarget.cloud && pxt.appTarget.cloud.noGithubProxy)
            return false // target requests no proxy
        return true
    }

    export interface CachedPackage {
        files: Map<string>;
    }

    // caching
    export interface IGithubDb {
        loadConfigAsync(repopath: string, tag: string): Promise<pxt.PackageConfig>;
        loadPackageAsync(repopath: string, tag: string): Promise<CachedPackage>;
    }

    export class MemoryGithubDb implements IGithubDb {
        private configs: pxt.Map<pxt.PackageConfig> = {};
        private packages: pxt.Map<CachedPackage> = {};

        private proxyLoadPackageAsync(repopath: string, tag: string): Promise<CachedPackage> {
            // cache lookup
            const key = `${repopath}/${tag}`;
            let res = this.packages[key];
            if (res) {
                pxt.debug(`github cache ${repopath}/${tag}/text`);
                return Promise.resolve(res);
            }

            // load and cache
            return U.httpGetJsonAsync(`${pxt.Cloud.apiRoot}gh/${repopath}/${tag}/text`)
                .then(v => this.packages[key] = { files: v });
        }

        loadConfigAsync(repopath: string, tag: string): Promise<pxt.PackageConfig> {
            if (!tag) tag = "master";

            // cache lookup
            const key = `${repopath}/${tag}`;
            let res = this.configs[key];
            if (res) {
                pxt.debug(`github cache ${repopath}/${tag}/config`);
                return Promise.resolve(U.clone(res));
            }

            const cacheConfig = (v: string) => {
                const cfg = JSON.parse(v) as pxt.PackageConfig;
                this.configs[key] = cfg;
                return U.clone(cfg);
            }

            // download and cache
            if (useProxy()) {
                // this is a bit wasteful, we just need pxt.json and download everything
                return this.proxyLoadPackageAsync(repopath, tag)
                    .then(v => cacheConfig(v.files[pxt.CONFIG_NAME]))
            }
            let url = "https://raw.githubusercontent.com/" + repopath + "/" + tag + "/" + pxt.CONFIG_NAME
            return U.httpGetTextAsync(url)
                .then(cfg => cacheConfig(cfg));
        }

        loadPackageAsync(repopath: string, tag: string): Promise<CachedPackage> {
            if (!tag) tag = "master";

            if (useProxy())
                return this.proxyLoadPackageAsync(repopath, tag).then(v => U.clone(v));

            return tagToShaAsync(repopath, tag)
                .then(sha => {
                    // cache lookup
                    const key = `${repopath}/${sha}`;
                    let res = this.packages[key];
                    if (res) {
                        pxt.debug(`github cache ${repopath}/${tag}/text`);
                        return Promise.resolve(U.clone(res));
                    }

                    // load and cache
                    const pref = "https://raw.githubusercontent.com/" + repopath + "/" + sha + "/"
                    pxt.log(`Downloading ${repopath}/${tag} -> ${sha}`)
                    return U.httpGetTextAsync(pref + pxt.CONFIG_NAME)
                        .then(pkg => {
                            const current: CachedPackage = {
                                files: {}
                            }
                            current.files[pxt.CONFIG_NAME] = pkg
                            const cfg: pxt.PackageConfig = JSON.parse(pkg)
                            return Promise.map(cfg.files.concat(cfg.testFiles || []),
                                fn => U.httpGetTextAsync(pref + fn)
                                    .then(text => {
                                        current.files[fn] = text
                                    }))
                                .then(() => {
                                    // cache!
                                    this.packages[key] = current;
                                    return U.clone(current);
                                })
                        })
                })
        }
    }

    // overriden by client
    export let db: IGithubDb = new MemoryGithubDb();

    export function listRefsAsync(repopath: string, namespace = "tags"): Promise<string[]> {
        return listRefsExtAsync(repopath, namespace)
            .then(res => Object.keys(res.refs))
    }

    export function listRefsExtAsync(repopath: string, namespace = "tags"): Promise<RefsResult> {
        let head: string = null
        const fetch = !useProxy() ?
            U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/" + namespace + "/?per_page=100") :
            U.httpGetJsonAsync(`${pxt.Cloud.apiRoot}gh/${repopath}/refs`)
                .then(r => {
                    let res = Object.keys(r.refs)
                        .filter(k => U.startsWith(k, "refs/" + namespace + "/"))
                        .map(k => ({ ref: k, object: { sha: r.refs[k] } }))
                    head = r.refs["HEAD"]
                    return res
                })

        let clean = (x: string) => x.replace(/^refs\/[^\/]+\//, "")

        return fetch.then<RefsResult>((resp: GHRef[]) => {
            resp.sort((a, b) => semver.strcmp(clean(a.ref), clean(b.ref)))
            let r: pxt.Map<string> = {}
            for (let obj of resp) {
                r[clean(obj.ref)] = obj.object.sha
            }
            return { refs: r, head }
        }, err => {
            if (err.statusCode == 404) return { refs: {} }
            else return Promise.reject(err)
        })
    }

    function resolveRefAsync(r: GHRef): Promise<string> {
        if (r.object.type == "commit")
            return Promise.resolve(r.object.sha)
        else if (r.object.type == "tag")
            return U.httpGetJsonAsync(r.object.url)
                .then((r: GHRef) =>
                    r.object.type == "commit" ? r.object.sha :
                        Promise.reject(new Error("Bad type (2nd order) " + r.object.type)))
        else
            return Promise.reject(new Error("Bad type " + r.object.type))
    }

    function tagToShaAsync(repopath: string, tag: string) {
        if (/^[a-f0-9]{40}$/.test(tag))
            return Promise.resolve(tag)
        return U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/tags/" + tag)
            .then(resolveRefAsync, e =>
                U.httpGetJsonAsync("https://api.github.com/repos/" + repopath + "/git/refs/heads/" + tag)
                    .then(resolveRefAsync))
    }

    export function pkgConfigAsync(repopath: string, tag = "master") {
        return db.loadConfigAsync(repopath, tag)
    }

    export function downloadPackageAsync(repoWithTag: string, config: pxt.PackagesConfig): Promise<CachedPackage> {
        let p = parseRepoId(repoWithTag)
        if (!p) {
            pxt.log('Unknown github syntax');
            return Promise.resolve<CachedPackage>(undefined);
        }

        if (isRepoBanned(p, config)) {
            pxt.tickEvent("github.download.banned");
            pxt.log('Github repo is banned');
            return Promise.resolve<CachedPackage>(undefined);
        }

        return db.loadPackageAsync(p.fullName, p.tag);
    }

    interface Repo {
        id: number;
        name: string; // "pxt-microbit-cppsample",
        full_name: string; // "Microsoft/pxt-microbit-cppsample",
        owner: {
            login: string; // "Microsoft",
            id: number; // 6154722,
            avatar_url: string; // "https://avatars.githubusercontent.com/u/6154722?v=3",
            gravatar_id: string; // "",
            html_url: string; // "https://github.com/Microsoft",
            type: string; // "Organization"
        },
        private: boolean;
        html_url: string; // "https://github.com/Microsoft/pxt-microbit-cppsample",
        description: string; // "Sample C++ extension for PXT/microbit",
        fork: boolean;
        created_at: string; // "2016-05-05T11:18:12Z",
        updated_at: string; // "2016-06-20T02:25:03Z",
        pushed_at: string; // "2016-05-05T11:59:42Z",
        homepage: string; // null,
        size: number; // 4
        stargazers_count: number;
        watchers_count: number;
        forks_count: number;
        open_issues_count: number;
        forks: number;
        open_issues: number;
        watchers: number;
        default_branch: string; // "master",
        score: number; // 6.7371006

        // non-github, added to track search request
        tag?: string;
    }

    interface SearchResults {
        total_count: number;
        incomplete_results: boolean;
        items: Repo[];
    }

    export interface ParsedRepo {
        owner?: string;
        fullName: string;
        tag?: string;
    }

    export enum GitRepoStatus {
        Unknown,
        Approved,
        Banned
    }

    export interface GitRepo extends ParsedRepo {
        name: string;
        description: string;
        defaultBranch: string;
        status?: GitRepoStatus;
    }

    export function repoIconUrl(repo: GitRepo): string {
        if (repo.status != GitRepoStatus.Approved) return undefined;

        return mkRepoIconUrl(repo)
    }

    export function mkRepoIconUrl(repo: ParsedRepo): string {
        return Cloud.apiRoot + `gh/${repo.fullName}/icon`;
    }

    function mkRepo(r: Repo, config: pxt.PackagesConfig, tag?: string): GitRepo {
        if (!r) return undefined;
        const rr: GitRepo = {
            owner: r.owner.login.toLowerCase(),
            fullName: r.full_name.toLowerCase(),
            name: r.name,
            description: r.description,
            defaultBranch: r.default_branch,
            tag: tag
        }
        rr.status = repoStatus(rr, config);
        return rr;
    }

    export function repoStatus(rr: ParsedRepo, config: pxt.PackagesConfig): GitRepoStatus {
        return isRepoBanned(rr, config) ? GitRepoStatus.Banned
            : isRepoApproved(rr, config) ? GitRepoStatus.Approved
                : GitRepoStatus.Unknown;
    }

    function isOrgBanned(repo: ParsedRepo, config: pxt.PackagesConfig): boolean {
        if (!config) return false; // don't know
        if (!repo || !repo.owner) return true;
        if (config.bannedOrgs
            && config.bannedOrgs.some(org => org.toLowerCase() == repo.owner.toLowerCase()))
            return true;
        return false;
    }

    function isRepoBanned(repo: ParsedRepo, config: pxt.PackagesConfig): boolean {
        if (isOrgBanned(repo, config))
            return true;
        if (!config) return false; // don't know
        if (!repo || !repo.fullName) return true;
        if (config.bannedRepos
            && config.bannedRepos.some(fn => fn.toLowerCase() == repo.fullName.toLowerCase()))
            return true;
        return false;
    }

    function isOrgApproved(repo: ParsedRepo, config: pxt.PackagesConfig): boolean {
        if (!repo || !config) return false;
        if (repo.owner
            && config.approvedOrgs
            && config.approvedOrgs.some(org => org.toLowerCase() == repo.owner.toLowerCase()))
            return true;
        return false;
    }

    function isRepoApproved(repo: ParsedRepo, config: pxt.PackagesConfig): boolean {
        if (isOrgApproved(repo, config))
            return true;

        if (!repo || !config) return false;
        if (repo.fullName
            && config.approvedRepos
            && config.approvedRepos.some(fn => fn.toLowerCase() == repo.fullName.toLowerCase()))
            return true;
        return false;
    }

    export function repoAsync(id: string, config: pxt.PackagesConfig): Promise<GitRepo> {
        const rid = parseRepoId(id);
        const status = repoStatus(rid, config);
        if (status == GitRepoStatus.Banned)
            return Promise.resolve<GitRepo>(undefined);

        if (!useProxy())
            return U.httpGetJsonAsync("https://api.github.com/repos/" + rid.fullName)
                .then((r: Repo) => mkRepo(r, config, rid.tag));

        // always use proxy
        return Util.httpGetJsonAsync(`${pxt.Cloud.apiRoot}gh/${rid.fullName}`)
            .then(meta => {
                if (!meta) return undefined;
                return {
                    github: true,
                    owner: rid.owner,
                    fullName: rid.fullName,
                    name: meta.name,
                    description: meta.description,
                    defaultBranch: "master",
                    tag: rid.tag,
                    status
                };
            })
    }

    export function searchAsync(query: string, config: pxt.PackagesConfig): Promise<GitRepo[]> {
        if (!config) return Promise.resolve([]);

        let repos = query.split('|').map(parseRepoUrl).filter(repo => !!repo);
        if (repos.length > 0)
            return Promise.all(repos.map(id => repoAsync(id.path, config)))
                .then(rs => rs.filter(r => r.status != GitRepoStatus.Banned)); // allow deep links to github repos

        query += ` in:name,description,readme "for PXT/${appTarget.platformid || appTarget.id}"`
        return U.httpGetJsonAsync("https://api.github.com/search/repositories?q=" + encodeURIComponent(query))
            .then((rs: SearchResults) =>
                rs.items.map(item => mkRepo(item, config))
                    .filter(r => r.status == GitRepoStatus.Approved || (config.allowUnapproved && r.status == GitRepoStatus.Unknown))
                    // don't return the target itself!
                    .filter(r => !pxt.appTarget.appTheme.githubUrl || `https://github.com/${r.fullName}` != pxt.appTarget.appTheme.githubUrl.toLowerCase())
            )
            .catch(err => []); // offline
    }

    export function parseRepoUrl(url: string): { repo: string; tag?: string; path?: string; } {
        if (!url) return undefined;

        let m = /^((https:\/\/)?github.com\/)?([^/]+\/[^/#]+)(#(\w+))?$/i.exec(url.trim());
        if (!m) return undefined;

        let r: { repo: string; tag?: string; path?: string; } = {
            repo: m ? m[3].toLowerCase() : null,
            tag: m ? m[5] : null
        }
        r.path = r.repo + (r.tag ? '#' + r.tag : '');
        return r;
    }

    export function parseRepoId(repo: string): ParsedRepo {
        if (!repo) return undefined;

        repo = repo.replace(/^github:/i, "")
        let m = /([^#]+)(#(.*))?/.exec(repo)
        let owner = m ? m[1].split('/')[0].toLowerCase() : undefined;
        return {
            owner,
            fullName: m ? m[1].toLowerCase() : repo.toLowerCase(),
            tag: m ? m[3] : null
        }
    }

    export function isGithubId(id: string) {
        return id.slice(0, 7) == "github:"
    }

    export function stringifyRepo(p: ParsedRepo) {
        return p ? "github:" + p.fullName.toLowerCase() + "#" + (p.tag || "master") : undefined;
    }

    export function noramlizeRepoId(id: string) {
        return stringifyRepo(parseRepoId(id))
    }

    export function latestVersionAsync(path: string, config: PackagesConfig): Promise<string> {
        let parsed = parseRepoId(path)

        if (!parsed) return Promise.resolve<string>(null);

        return repoAsync(parsed.fullName, config)
            .then(scr => {
                if (!scr) return undefined;
                return listRefsExtAsync(scr.fullName, "tags")
                    .then(refsRes => {
                        let tags = Object.keys(refsRes.refs)
                        tags.reverse()
                        // only look for vxx.xx.xx tags
                        tags = tags.filter(t => /^v\d+(\.\d+(\.\d+)?)?$/i.test(t));
                        if (tags[0])
                            return Promise.resolve(tags[0])
                        else
                            return refsRes.head || tagToShaAsync(scr.fullName, scr.defaultBranch)
                    })
            });
    }

    export function publishGistAsync(token: string, forceNew: boolean, files: any, name: string, currentGistId: string): Promise<any> {
        // Github gist API: https://developer.github.com/v3/gists/
        const data = {
            "description": name,
            "public": false, /* there is no API to make a gist public or private, so it's easier/safer to always make it private and let the user make it public from the UI */
            "files": files
        };
        const headers: Map<string> = {};
        let method: string, url: string = "https://api.github.com/gists";
        if (token) headers['Authorization'] = `token ${token}`;
        if (currentGistId && token && !forceNew) {
            // Patch existing gist
            method = 'PATCH';
            url += `/${currentGistId}`;
        } else {
            // Create new gist
            method = 'POST';
        }
        return U.requestAsync({
            url: url,
            allowHttpErrors: true,
            headers: headers,
            method: method,
            data: data || {}
        })
            .then((resp) => {
                if ((resp.statusCode == 200 || resp.statusCode == 201) && resp.json.id) {
                    return Promise.resolve<string>(resp.json.id);
                } else if (resp.statusCode == 404 && method == 'PATCH') {
                    return Promise.reject(resp.statusCode);
                } else if (resp.statusCode == 404) {
                    return Promise.reject("Make sure to add the ``gist`` scope to your token. " + resp.text);
                } return Promise.reject(resp.text);
            });
    }
}