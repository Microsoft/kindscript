/// <reference path="../../built/pxtlib.d.ts" />

import * as React from "react";
import * as data from "./data";
import * as sui from "./sui";
import * as md from "./marked";
import * as compiler from './compiler';
import * as ReactDOM from 'react-dom';
import * as pkg from './package';
import * as toolbox from "./toolbox";
import * as core from "./core";

type ISettingsProps = pxt.editor.ISettingsProps;

interface SnippetBuilderProps extends ISettingsProps {
    mainWorkspace: Blockly.Workspace;
    config: pxt.SnippetConfig;
}

interface DefaultAnswersMap {
    [answerToken: string]: pxt.SnippetAnswerTypes;
}

interface AnswersMap {
    [answerToken: string]: pxt.SnippetAnswerTypes;
}

export interface SnippetBuilderState {
    visible?: boolean;
    tsOutput?: string;
    answers?: AnswersMap;
    history: number[];
    defaults: DefaultAnswersMap; // Will be typed once more clearly defined
    config?: pxt.SnippetConfig; // Will be a config type
}


/**
 * Snippet builder takes a static config file and builds a modal with inputs and outputs based on config settings.
 * An output type is attached to the start of your markdown allowing you to define a number of markdown output. (blocks, lang)
 * An initial output is set and outputs defined at each questions are appended to the initial output.
 * answerTokens can be defined and are replaced before being outputted. This allows you to output answers and default values.
 */
export class SnippetBuilder extends data.Component<SnippetBuilderProps, SnippetBuilderState> {
    constructor(props: SnippetBuilderProps) {
        super(props);
        this.state = {
            visible: false,
            answers: {},
            history: [0], // Index to track current question
            defaults: {},
            config: props.config,
            tsOutput: props.config.initialOutput
        };

        this.hide = this.hide.bind(this);
        this.cancel = this.cancel.bind(this);
        this.confirm = this.confirm.bind(this);
        this.backPage = this.backPage.bind(this);
        this.nextPage = this.nextPage.bind(this);
    }

    /**
     * Creates a hashmap with answerToken keys and the default value pair as 
     * provided by our config file.
     */
    buildDefaults() {
        const { config } = this.state;
        const defaults: DefaultAnswersMap = {};

        for (const question of config.questions) {
            const { inputs } = question;
            for (const input of inputs) {
                const { defaultAnswer, answerToken } = input;
                defaults[answerToken] = defaultAnswer;
            }
        }

        this.setState({ defaults });
    }

    componentDidMount() {
        // Sets default values
        this.buildDefaults();
    }

    /**
     * @param output - Takes in a string and returns the tokenized output
     * Loops over each token previously added to defaults and replaces with the answer value if one
     * exists. Otherwise it replaces the token with the provided default value.
     */
    replaceTokens(tsOutput: string) {
        const { answers, defaults } = this.state;
        let tokenizedOutput = tsOutput;
        const tokens = Object.keys(defaults);

        // Replaces output tokens with answer if available or default value
        for (let token of tokens) {
            const value = answers[token] || defaults[token];
            tokenizedOutput = tokenizedOutput.split(`$${token}`).join(value);
        }

        return tokenizedOutput;
    }

    /**
     * 
     * @param output - Accepts an output to convert to markdown
     * This attaches three backticks to the front followed by an output type (blocks, lang)
     * The current output is then tokenized and three backticks are appended to the end of the string.
     */
    generateOutputMarkdown(tsOutput: string) {
        const { config } = this.state;
        // Attaches starting and ending line based on output type
        let md = `\`\`\`${config.outputType}\n`;
        md += this.replaceTokens(tsOutput);
        md += `\n\`\`\``;

        return md
    }

    hide() {
        this.setState({
            visible: false
        });
    }

    show() {
        pxt.tickEvent('snippetBuilder.show', null, { interactiveConsent: true });
        this.setState({
            visible: true,
        });
    }

    cancel() {
        pxt.tickEvent("snippetBuilder.cancel", undefined, { interactiveConsent: true });
        this.hide();
    }

    findRootBlock(xmlDOM: Element, type?: string): Element {
        for (const child in xmlDOM.children) {
            const xmlChild = xmlDOM.children[child];

            if (xmlChild.tagName === 'block') {
                if (type) {
                    const childType = xmlChild.getAttribute('type');

                    if (childType && childType === type) {
                        return xmlChild
                        // return this.findRootBlock(xmlChild);
                    }
                } else {
                    return xmlChild;
                }
            }

            const childChildren = this.findRootBlock(xmlChild);
            if (childChildren) {
                return childChildren;
            }
        }
        return null;
    }

    getOnStartBlock(mainWorkspace: Blockly.Workspace) {
        const topBlocks = mainWorkspace.getTopBlocks(true);
        for (const block of topBlocks) {
            if (block.type === 'pxt-on-start') {
                return block;
            }
        }

        return null;
    }

    /**
     * Takes the output from state, runs replace tokens, decompiles the resulting typescript
     * and outputs the result as a Blockly xmlDOM. This then uses appendDomToWorkspace to attach 
     * our xmlDOM to the mainWorkspaces passed to the component.
     */
    injectBlocksToWorkspace() {
        const { tsOutput } = this.state;
        const { mainWorkspace } = this.props

        compiler.getBlocksAsync()
            .then(blocksInfo => compiler.decompileBlocksSnippetAsync(this.replaceTokens(tsOutput), blocksInfo))
            .then(resp => {
                // Convert XML text to xml dom in order to parse
                const xmlDOM = Blockly.Xml.textToDom(resp);
                // TODO(jb) hard coded in topmost child should be generalized
                const xmlOnStartBlock = this.findRootBlock(xmlDOM, 'pxt-on-start');
                // Finds the on start blocks children
                const toAttach = this.findRootBlock(xmlOnStartBlock);
                const rootConnection = Blockly.Xml.domToBlock(toAttach, mainWorkspace);
                // Connects new blocks to start block
                this.getOnStartBlock(mainWorkspace)
                    .getInput("HANDLER").connection.connect(rootConnection.previousConnection);
            }).catch((e) => {
                core.errorNotification(e);
                throw new Error(`Failed to decompile snippet output`);
            });;
    }

    confirm() {
        this.injectBlocksToWorkspace();
        Blockly.hideChaff();
        this.hide();
    }

    /**
     * Changes page by 1 if next question exists.
     * Looks for output and appends the next questions output if it exists and
     * is not already attached to the current output.
     */
    nextPage() {
        const { config } = this.state;
        const { history, tsOutput } = this.state;
        const currentQuestion = config.questions[history[history.length - 1]];
        const goto = currentQuestion.goto
        if (goto) {
            const nextQuestion = config.questions[goto.question];

            if (nextQuestion.output && tsOutput.indexOf(nextQuestion.output) === -1) {
                this.setState({ tsOutput: `${tsOutput}\n${nextQuestion.output}`});
            }
            this.setState({ history: [...history, goto.question ]})
        }
    }

    backPage() {
        const { history } = this.state;
        if (history.length > 1) {
            this.setState({ history: history.slice(0, history.length - 1)});
        }
    }

    textInputOnChange = (answerToken: string) => (v: string) => {
        const answers = this.state.answers;
        answers[answerToken] = v;

        this.setState({ answers })
    }

    renderCore() {
        const { visible, tsOutput, answers, config, history } = this.state;
        const { parent } = this.props;

        const actions: sui.ModalButton[] = [
            {
                label: lf("Back"),
                onclick: this.backPage,
                icon: 'arrow left',
                className: 'arrow left',
            },
            {
                label: lf("Next"),
                onclick: this.nextPage,
                icon: 'arrow right',
                className: 'arrow right',
            },
            {
                label: lf("Cancel"),
                onclick: this.hide,
                icon: "cancel",
                className: "cancel lightgrey"
            },
            {
                label: lf("Done"),
                onclick: this.confirm,
                icon: "check",
                className: "approve positive"
            }
        ];

        const currQ = config.questions[history[history.length - 1]];

        return (
            <sui.Modal isOpen={visible} className="snippetBuilder" size="large"
                closeOnEscape={false} closeIcon={false} closeOnDimmerClick={false} closeOnDocumentClick={false}
                dimmer={true} buttons={actions} header={config.name}
            >
                <div>
                    <div className="list">
                        {currQ &&
                            <div>
                                <div>{pxt.Util.rlf(currQ.title)}</div>
                                <div className='list horizontal'>
                                    {currQ.inputs.map((input: pxt.SnippetQuestionInput) =>
                                        <div key={input.answerToken}>
                                            <sui.Input
                                                label={input.label && pxt.Util.rlf(input.label)}
                                                onChange={this.textInputOnChange(input.answerToken)}
                                                value={answers[input.answerToken] || ''}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        }
                    </div>
                    <div className='snippetBuilderOutput'>
                        {parent && <md.MarkedContent markdown={this.generateOutputMarkdown(tsOutput)} parent={parent} />}
                    </div>
                </div>
            </sui.Modal>
        )
    }
}

function getSnippetExtensions() {
    return pkg
        .allEditorPkgs()
        .map(ep => ep.getKsPkg())
        .map(p => !!p && p.config)
        .filter(config => config.snippetBuilders);
}

function openSnippetDialog(config: pxt.SnippetConfig, editor: Blockly.WorkspaceSvg, parent: pxt.editor.IProjectView) {
    const wrapper = document.body.appendChild(document.createElement('div'));
    const props = { parent: parent, mainWorkspace: editor, config };
    const snippetBuilder = ReactDOM.render(
        React.createElement(SnippetBuilder, props),
        wrapper
    ) as SnippetBuilder;
    snippetBuilder.show();
}

export function initializeSnippetExtensions(ns: string, extraBlocks: (toolbox.BlockDefinition | toolbox.ButtonDefinition)[], editor: Blockly.WorkspaceSvg, parent: pxt.editor.IProjectView) {
    const snippetExtensions = getSnippetExtensions();

    snippetExtensions.forEach(config => {
        config.snippetBuilders
            .filter(snippet => snippet.namespace == ns)
            .forEach(snippet => {
                extraBlocks.push({
                    name: `SNIPPET${name}_BUTTON`,
                    type: "button",
                    attributes: {
                        blockId: `SNIPPET${name}_BUTTON`,
                        label: snippet.label ? pxt.Util.rlf(snippet.label) : pxt.Util.lf("Editor"),
                        weight: 101,
                        group: snippet.group && snippet.group,
                    },
                    callback: () => {
                        openSnippetDialog(snippet, editor, parent);
                    }
                });
            });
    })
}