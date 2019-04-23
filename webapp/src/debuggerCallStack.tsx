import * as React from "react";
import { DebuggerTable, DebuggerTableRow } from "./debuggerTable";


export interface DebuggerCallStackProps {
    stackframes: pxsim.StackFrameInfo[];
    activeFrame?: number;
    openLocation?: (breakpoint: number, frameIndex: number) => void;
}

export interface DebuggerCallStackState {
}

export class DebuggerCallStack extends React.Component<DebuggerCallStackProps, DebuggerCallStackState> {
    constructor(props: DebuggerCallStackProps) {
        super(props);
    }

    render() {
        return (
            <DebuggerTable header={lf("Call Stack")}>
                {this.props.stackframes.map((sf, index) => {
                    if (!sf.breakpointId) return null;

                    const key = sf.breakpointId + "_" + index

                    return <DebuggerTableRow key={key}
                        refID={key}
                        onClick={this.handleRowClick}
                        leftText={sf.funcInfo.functionName}
                        rightText={`${sf.funcInfo.fileName}:${sf.funcInfo.line}`}
                        icon={index === this.props.activeFrame ? "arrow right" : undefined} />
                    }
                )}
            </DebuggerTable>
        );
    }

    protected handleRowClick = (e: React.SyntheticEvent<HTMLDivElement>, component: DebuggerTableRow) => {
        if (!this.props.openLocation) return;

        const [id, index] = (component.props.refID as string).split("_").map(n => parseInt(n));
        const stackFrame = this.props.stackframes[index];

        if (stackFrame && stackFrame.breakpointId === id) {
            this.props.openLocation(stackFrame.breakpointId, index);
        }
    }
}

