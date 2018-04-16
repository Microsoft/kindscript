import * as React from "react";
import * as ReactDOM from 'react-dom';
import * as sui from "./sui";
import * as data from "./data";
import * as simulator from "./simulator";

type ISettingsProps = pxt.editor.ISettingsProps;

interface DebuggerVariablesState {
    variables?: pxt.Map<Variable>;
}

interface Variable {
    value: string;
    type: string;
    prevValue?: string;
}

interface DebuggerVariablesProps extends ISettingsProps {
}

export class DebuggerVariables extends data.Component<DebuggerVariablesProps, DebuggerVariablesState> {

    private static MAX_VARIABLE_CHARS = 20;

    private nextVariables: pxt.Map<pxsim.Variables> = {};

    constructor(props: DebuggerVariablesProps) {
        super(props);
        this.state = {
            variables: {}
        }
    }

    clear() {
        //this.setState({ variables: {} });
    }

    set(name: string, value: pxsim.Variables) {
        this.nextVariables[name] = value;
    }

    update() {
        const variables = this.state.variables;
        Object.keys(this.nextVariables).forEach(k => {
            const v = this.nextVariables[k];
            let sv = '';
            let type = typeof (v);
            switch (type) {
                case "number": sv = v + ""; break;
                case "boolean": sv = v + ""; break;
                case "string": sv = JSON.stringify(v); break;
                case "object":
                    if (v == null) sv = "null";
                    else if (v.id !== undefined) sv = "(object)"
                    else if (v.text) sv = v.text;
                    else sv = "(unknown)"
                    break;
            }
            sv = capLength(sv);
            variables[k] = {
                value: sv,
                type: type,
                prevValue: variables[k] && sv != variables[k].value ?
                    variables[k].value : undefined
            }
        })
        this.setState({ variables: variables });
        this.nextVariables = {};

        function capLength(varstr: string) {
            let remaining = DebuggerVariables.MAX_VARIABLE_CHARS - 3; // acount for ...
            let hasQuotes = false;
            if (varstr.indexOf('"') == 0) {
                remaining - 2;
                hasQuotes = true;
                varstr = varstr.substring(1, varstr.length - 1);
            }
            if (varstr.length > remaining)
                varstr = varstr.substring(0, remaining) + '...';
            if (hasQuotes) {
                varstr = '"' + varstr + '"'
            }
            return varstr;
        }
    }

    renderCore() {
        const { variables } = this.state;
        return Object.keys(variables).length == 0 ? <div /> :
            <div className="ui segment debugvariables">
                <div className="ui middle aligned list">
                    {Object.keys(variables).map(variable =>
                        <div key={variable} className="item">
                            <div className="ui label image variable" style={{ backgroundColor: pxt.toolbox.getNamespaceColor('variables') }}>
                                <span className="varname">{variable}</span>
                                <div className="detail">
                                    <span className="varval">{variables[variable].value + ' '}</span>
                                    <span className="previousval">{variables[variable].prevValue ? variables[variable].prevValue : ''}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>;
    }
}

export interface DebuggerToolbarProps extends ISettingsProps {
}

export interface DebuggerToolbarState {
    isDragging?: boolean;
    xPos?: number;
}

export class DebuggerToolbar extends data.Component<DebuggerToolbarProps, DebuggerToolbarState> {

    constructor(props: DebuggerToolbarProps) {
        super(props);
        this.state = {
        }
    }

    restartSimulator(debug?: boolean) {
        pxt.tickEvent('debugger.restart', undefined, { interactiveConsent: true });
        this.props.parent.restartSimulator(debug);
    }

    exitDebugging() {
        pxt.tickEvent('debugger.exit', undefined, { interactiveConsent: true });
        this.props.parent.toggleDebugging();
    }

    dbgPauseResume() {
        pxt.tickEvent('debugger.pauseresume', undefined, { interactiveConsent: true });
        this.props.parent.dbgPauseResume();
    }

    dbgStepOver() {
        pxt.tickEvent('debugger.stepover', undefined, { interactiveConsent: true });
        this.props.parent.dbgStepOver();
    }

    dbgStepInto() {
        pxt.tickEvent('debugger.stepinto', undefined, { interactiveConsent: true });
        this.props.parent.dbgStepInto();
    }

    dbgStepOut() {
        pxt.tickEvent('debugger.stepout', undefined, { interactiveConsent: true });
        simulator.dbgStepOut();
    }

    toggleTrace() {
        pxt.tickEvent("debugger.trace", undefined, { interactiveConsent: true });
        this.props.parent.toggleTrace();
    }

    componentDidUpdate(props: DebuggerToolbarProps, state: DebuggerToolbarState) {
        if (this.state.isDragging && !state.isDragging) {
            document.addEventListener('mousemove', this.toolbarHandleMove.bind(this));
            document.addEventListener('mouseup', this.toolbarHandleUp.bind(this));
        } else if (!this.state.isDragging && state.isDragging) {
            document.removeEventListener('mousemove', this.toolbarHandleMove.bind(this));
            document.removeEventListener('mouseup', this.toolbarHandleUp.bind(this));
        }

        // Center the component if it hasn't been initialized yet
        if (state.xPos == undefined && props.parent.state.debugging) {
            this.centerToolbar();
            window.addEventListener('resize', this.centerToolbar.bind(this));
        }
    }

    componentWillUnmount() {
        document.removeEventListener('mousemove', this.toolbarHandleMove.bind(this));
        document.removeEventListener('mouseup', this.toolbarHandleUp.bind(this));
        window.removeEventListener('resize', this.centerToolbar.bind(this));
    }

    private cachedMaxWidth = 0;

    toolbarHandleDown(e: MouseEvent) {
        if (e.button !== 0) return
        const menuDOM = this.getMenuDom();
        const menuWidth = menuDOM && menuDOM.clientWidth || 0;
        this.cachedMaxWidth = window.innerWidth - menuWidth;
        this.setState({
            isDragging: true,
            xPos: Math.min(e.pageX, this.cachedMaxWidth)
        })
        e.stopPropagation();
        e.preventDefault();
    }

    toolbarHandleMove(e: MouseEvent) {
        if (!this.state.isDragging) return;
        this.setState({
            isDragging: true,
            xPos: Math.min(e.pageX, this.cachedMaxWidth)
        })
        e.stopPropagation();
        e.preventDefault();
    }

    toolbarHandleUp(e: MouseEvent) {
        this.setState({ isDragging: false });
        e.stopPropagation();
        e.preventDefault();
    }

    getMenuDom() {
        const node = ReactDOM.findDOMNode(this);
        return node && node.firstElementChild;
    }

    centerToolbar() {
        // Center the toolbar in the middle of the editor view (blocks / JS)
        const menuDOM = this.getMenuDom();
        const width = menuDOM && menuDOM.clientWidth;
        const mainEditor = document.getElementById('maineditor');
        const simWidth = window.innerWidth - mainEditor.clientWidth;
        this.setState({ xPos: simWidth + (mainEditor.clientWidth - width) / 2 });
    }

    renderCore() {
        const { xPos } = this.state;
        const parentState = this.props.parent.state;
        const simOpts = pxt.appTarget.simulator;

        const isRunning = parentState.running;
        const isDebugging = parentState.debugging;
        const isTracing = parentState.tracing;
        if (!isDebugging) return <div />;

        const isDebuggerRunning = simulator.driver && simulator.driver.state == pxsim.SimulatorState.Running;
        const advancedDebugging = this.props.parent.isJavaScriptActive();

        const isValidDebugFile = advancedDebugging || this.props.parent.isBlocksActive();
        if (!isValidDebugFile) return <div />;

        const restartTooltip = lf("Restart debugging");
        const debugTooltip = parentState.debugging ? lf("Stop") : lf("Start Debugging");
        const dbgPauseResumeTooltip = isRunning ? lf("Pause execution") : lf("Continue execution");
        const dbgStepIntoTooltip = lf("Step into");
        const dbgStepOverTooltip = lf("Step over");
        const dbgStepOutTooltip = lf("Step out");
        const traceTooltip = parentState.tracing ? lf("Disable Slow-Mo") : lf("Slow-Mo");

        //                     <sui.Item key='dbgstop' class={`dbg-btn dbg-stop ${!restart ? 'right' : ''}`} icon={`stop red`} title={debugTooltip} onClick={() => this.exitDebugging()} />

        return <aside className="debugtoolbar" style={{ left: xPos }} role="complementary" aria-label={lf("Debugger toolbar")}>
            {!isDebugging ? undefined :
                <div className={`ui compact borderless menu icon mini`}>
                    <div className={`ui item link dbg-btn dbg-handle`} key={'toolbarhandle'}
                        onMouseDown={this.toolbarHandleDown.bind(this)}>
                        <sui.Icon key='iconkey' icon={`icon ellipsis vertical`} />
                    </div>
                    <sui.Item key='dbgpauseresume' class={`dbg-btn dbg-pause-resume ${isDebuggerRunning ? "pause" : "play"}`} icon={`${isDebuggerRunning ? "pause blue" : "step forward green"}`} title={dbgPauseResumeTooltip} onClick={() => this.dbgPauseResume()} />
                    {!advancedDebugging ? <sui.Item key='dbgstep' class={`dbg-btn dbg-step`} icon={`arrow right ${isDebuggerRunning ? "disabled" : "blue"}`} title={dbgStepIntoTooltip} onClick={() => this.dbgStepInto()} /> : undefined}
                    {advancedDebugging ? <sui.Item key='dbgstepover' class={`dbg-btn dbg-step-over`} icon={`xicon stepover ${isDebuggerRunning ? "disabled" : "blue"}`} title={dbgStepOverTooltip} onClick={() => this.dbgStepOver()} /> : undefined}
                    {advancedDebugging ? <sui.Item key='dbgstepinto' class={`dbg-btn dbg-step-into`} icon={`xicon stepinto ${isDebuggerRunning ? "disabled" : ""}`} title={dbgStepIntoTooltip} onClick={() => this.dbgStepInto()} /> : undefined}
                    {advancedDebugging ? <sui.Item key='dbgstepout' class={`dbg-btn dbg-step-out`} icon={`xicon stepout ${isDebuggerRunning ? "disabled" : ""}`} title={dbgStepOutTooltip} onClick={() => this.dbgStepOut()} /> : undefined}
                    <sui.Item key='dbgrestart' class={`dbg-btn dbg-restart right`} icon={`refresh green`} title={restartTooltip} onClick={() => this.restartSimulator(true)} />
                    <sui.Item key='dbgtrace' class={`trace-button ${isTracing ? 'orange' : ''}`} icon="xicon turtle" title={traceTooltip} onClick={() => this.toggleTrace()} />
                </div>}
        </aside>;
    }
}