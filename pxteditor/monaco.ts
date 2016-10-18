/// <reference path="../node_modules/monaco-editor/monaco.d.ts" />
/// <reference path="../typings/bluebird/bluebird.d.ts"/>
/// <reference path="../built/pxtlib.d.ts"/>

namespace pxt.vs {

    export function syncModels(mainPkg: MainPackage, libs: { [path: string]: monaco.IDisposable }, currFile: string, readOnly: boolean): void {
        let extraLibs = (monaco.languages.typescript.typescriptDefaults as any).getExtraLibs();
        let modelMap: Map<string> = {}
        if (!readOnly) {
            mainPkg.sortedDeps().forEach(pkg => {
                pkg.getFiles().forEach(f => {
                    let fp = pkg.id + "/" + f;
                    if (/\.(ts)$/.test(f) && fp != currFile) {
                        let proto = "pkg:" + fp;
                        if (!(monaco.languages.typescript.typescriptDefaults as any).getExtraLibs()[fp]) {
                            let content = pkg.readFile(f) || " ";
                            libs[fp] = monaco.languages.typescript.typescriptDefaults.addExtraLib(content, fp);
                        }
                        modelMap[fp] = "1";
                    }
                });
            });
        }
        Object.keys(extraLibs)
            .filter(lib => /\.(ts)$/.test(lib) && !modelMap[lib])
            .forEach(lib => {
                libs[lib].dispose();
            });
    }

    export function initMonacoAsync(element: HTMLElement): monaco.editor.IStandaloneCodeEditor {
        if (!monaco.languages.typescript) return;

        initAsmMonarchLanguage();

        // validation settings
        monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
            noSyntaxValidation: false,
            noSemanticValidation: false
        });

        // compiler options
        monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
            allowUnreachableCode: true,
            noImplicitAny: true,
            allowJs: false,
            allowUnusedLabels: true,
            target: monaco.languages.typescript.ScriptTarget.ES5,
            outDir: "built",
            rootDir: ".",
            noLib: true,
            mouseWheelZoom: true
        });

        // maximum idle time
        monaco.languages.typescript.typescriptDefaults.setMaximunWorkerIdleTime(20 * 60 * 1000);

        let editor = monaco.editor.create(element, {
            model: null,
            //ariaLabel: lf("JavaScript Editor"),
            fontFamily: "'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', 'source-code-pro', 'monospace'",
            scrollBeyondLastLine: false,
            language: "typescript",
            experimentalScreenReader: true,
            mouseWheelZoom: true,
            tabCompletion: true,
            wordBasedSuggestions: true,
            lineNumbersMinChars: 3
        });

        window.addEventListener('resize', function () {
            editor.layout();
        });

        editor.layout();

        return editor;
    }

    function initAsmMonarchLanguage(): void {
        monaco.languages.register({id: 'asm', extensions: ['.asm']});
        monaco.languages.setMonarchTokensProvider('asm', <monaco.languages.IMonarchLanguage>{
            // Set defaultToken to invalid to see what you do not tokenize yet
            // defaultToken: 'invalid',
            tokenPostfix: '',

            //Extracted from http://infocenter.arm.com/help/topic/com.arm.doc.qrc0006e/QRC0006_UAL16.pdf
            //Should be a superset of the instructions emitted
            keywords: [
                'movs', 'mov', 'adds', 'add', 'adcs', 'adr', 'subs', 'sbcs', 'sub', 'rsbs',
                'muls', 'cmp', 'cmn', 'ands', 'eors', 'orrs', 'bics', 'mvns', 'tst', 'lsls',
                'lsrs', 'asrs', 'rors', 'ldr', 'ldrh', 'ldrb', 'ldrsh', 'ldrsb', 'ldm',
                'str', 'strh', 'strb', 'stm', 'push', 'pop', 'cbz', 'cbnz', 'b', 'bl', 'bx', 'blx',
                'sxth', 'sxtb', 'uxth', 'uxtb', 'rev', 'rev16', 'revsh', 'svc', 'cpsid', 'cpsie',
                'setend', 'bkpt', 'nop', 'sev', 'wfe', 'wfi', 'yield',
                'beq', 'bne', 'bcs', 'bhs', 'bcc', 'blo', 'bmi', 'bpl', 'bvs', 'bvc', 'bhi', 'bls',
                'bge', 'blt', 'bgt', 'ble', 'bal',
                //Registers
                'r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15',
                'pc', 'sp', 'lr'
            ],

            typeKeywords: [
                '.startaddr', '.hex', '.short', '.space', '.section', '.string', '.byte'
            ],

            operators: [],

            // Not all of these are valid in ARM Assembly
            symbols:  /[:\*]+/,

            // C# style strings
            escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

            // The main tokenizer for our languages
            tokenizer: {
                root: [
                // identifiers and keywords
                [/(\.)?[a-z_$\.][\w$]*/, { cases: { '@typeKeywords': 'keyword',
                                            '@keywords': 'keyword',
                                            '@default': 'identifier' } }],

                // whitespace
                { include: '@whitespace' },

                // delimiters and operators
                [/[{}()\[\]]/, '@brackets'],
                [/[<>](?!@symbols)/, '@brackets'],
                [/@symbols/, { cases: { '@operators': 'operator',
                                        '@default'  : '' } } ],

                // @ annotations.
                [/@\s*[a-zA-Z_\$][\w\$]*/, { token: 'annotation' }],

                // numbers
                //[/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
                [/(#|(0[xX]))?[0-9a-fA-F]+/, 'number'],

                // delimiter: after number because of .\d floats
                [/[;,.]/, 'delimiter'],

                // strings
                [/"([^"\\]|\\.)*$/, 'string.invalid' ],  // non-teminated string
                [/"/,  { token: 'string.quote', bracket: '@open', next: '@string' } ],

                // characters
                [/'[^\\']'/, 'string'],
                [/(')(@escapes)(')/, ['string','string.escape','string']],
                [/'/, 'string.invalid']
                ],

                comment: [],

                string: [
                [/[^\\"]+/,  'string'],
                [/@escapes/, 'string.escape'],
                [/\\./,      'string.escape.invalid'],
                [/"/,        { token: 'string.quote', bracket: '@close', next: '@pop' } ]
                ],

                whitespace: [
                [/[ \t\r\n]+/, 'white'],
                [/\/\*/,       'comment', '@comment' ],
                [/;.*$/,    'comment'],
                ],
            }
        });
    }
}
