// Localization functions. Please port any modifications over to pxtlib/util.ts
namespace pxsim.localization {
    let _localizeStrings: Map<string> = {};

    export function _localize(s: string) {
        return _localizeStrings[s] || s;
    }

    export function setLocalizedStrings(strs: Map<string>) {
        _localizeStrings = strs;
    }

    export function htmlEscape(_input: string) {
        if (!_input) return _input; // null, undefined, empty string test
        return _input.replace(/([^\w .!?\-$])/g, c => "&#" + c.charCodeAt(0) + ";");
    }

    export function jsStringQuote(s: string) {
        return s.replace(/[^\w .!?\-$]/g,
            (c) => {
                let h = c.charCodeAt(0).toString(16);
                return "\\u" + "0000".substr(0, 4 - h.length) + h;
            });
    }

    export function fmt_va(f: string, args: any[]): string {
        if (args.length == 0) return f;
        return f.replace(/\{([0-9]+)(\:[^\}]+)?\}/g, function (s: string, n: string, spec: string): string {
            let v = args[parseInt(n)];
            let r = "";
            let fmtMatch = /^:f(\d*)\.(\d+)/.exec(spec);
            if (fmtMatch) {
                let precision = parseInt(fmtMatch[2])
                let len = parseInt(fmtMatch[1]) || 0
                let fillChar = /^0/.test(fmtMatch[1]) ? "0" : " ";
                let num = (<number>v).toFixed(precision)
                if (len > 0 && precision > 0) len += precision + 1;
                if (len > 0) {
                    while (num.length < len) {
                        num = fillChar + num;
                    }
                }
                r = num;
            } else if (spec == ":x") {
                r = "0x" + v.toString(16);
            } else if (v === undefined) r = "(undef)";
            else if (v === null) r = "(null)";
            else if (v.toString) r = v.toString();
            else r = v + "";
            if (spec == ":a") {
                if (/^\s*[euioah]/.test(r.toLowerCase()))
                    r = "an " + r;
                else if (/^\s*[bcdfgjklmnpqrstvwxz]/.test(r.toLowerCase()))
                    r = "a " + r;
            } else if (spec == ":s") {
                if (v == 1) r = ""
                else r = "s"
            } else if (spec == ":q") {
                r = htmlEscape(r);
            } else if (spec == ":jq") {
                r = jsStringQuote(r);
            } else if (spec == ":uri") {
                r = encodeURIComponent(r).replace(/'/g, "%27").replace(/"/g, "%22");
            } else if (spec == ":url") {
                r = encodeURI(r).replace(/'/g, "%27").replace(/"/g, "%22");
            } else if (spec == ":%") {
                r = (v * 100).toFixed(1).toString() + '%';
            }
            return r;
        });
    }

    let sForPlural = true;
    export function lf_va(format: string, args: any[]): string {
        let lfmt = _localize(format)
        if (!sForPlural && lfmt != format && /\d:s\}/.test(lfmt)) {
            lfmt = lfmt.replace(/\{\d+:s\}/g, "")
        }
        lfmt = lfmt.replace(/\{(id|loc):[^\}]+\}/g, '');
        return fmt_va(lfmt, args);
    }

    export function lf(format: string, ...args: any[]): string {
        return lf_va(format, args);
    }
}