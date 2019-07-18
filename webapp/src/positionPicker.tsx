import * as React from 'react';
import * as data from './data';
import * as Snippet from './snippetBuilder';
import * as sui from './sui';
import { SimulatorDisplay } from './simulatorDisplay';

const X_SCALE = 1.94375;
const Y_SCALE = 1.925

interface PositionPickerProps {
    valueMap?: pxt.Map<number>;
    defaultX?: number;
    defaultY?: number;
    input: pxt.SnippetQuestionInput;
    onChange: (answerToken: string) => (v: string) => void;
}

interface PositionPickerState {
    x: number;
    y: number;
    finalX?: number;
    finalY?: number;
    dotVisible: boolean;
}

export class PositionPicker extends data.Component <PositionPickerProps, PositionPickerState> {
    private grid: JSX.Element[];
    constructor(props: PositionPickerProps) {
        super(props);
        this.state = {
            x: this.props.defaultX || 80,
            y: this.props.defaultY || 120,
            dotVisible: false
        };

        this.grid = this.buildGrid();

        this.onMouseMove = this.onMouseMove.bind(this);
        this.setDot = this.setDot.bind(this);
        this.onChange = this.onChange.bind(this);
    }

    setPosition(x: number, y: number) {
        const pickerContainer = this.refs['positionPickerContainer'] as HTMLDivElement;
        const width = pickerContainer.clientWidth;
        const height = pickerContainer.clientHeight;

        x = Math.round(Math.max(0, Math.min(width, x + 1)));
        y = Math.round(Math.max(0, Math.min(height, y + 1)));

        this.setState({ x, y });
    }

    getPosition() {
        const { finalX, finalY } = this.state;

        return { x: this.scalePoint(finalX, true), y: this.scalePoint(finalY) };
    }

    scalePoint(point: number, x?: true) {
        if (!isNaN(point)) {
            return Math.round(point / (x ? X_SCALE : Y_SCALE))
        }
        return 0;
    }

    onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
        if (e.nativeEvent.offsetX && e.nativeEvent.offsetY) {
            this.setPosition(e.nativeEvent.offsetX, e.nativeEvent.offsetY);
        }
    }

    setDot(e: React.MouseEvent<HTMLDivElement>) {
        const { input, onChange } = this.props;
        const { x, y } = this.state;

        this.setState({
            dotVisible: true,
            finalX: this.scalePoint(x, true),
            finalY: this.scalePoint(y),
        }, () => {
            if (!Snippet.isSnippetInputAnswerSingular(input)) {
                const { finalX, finalY } = this.state;
                onChange(input.answerTokens[0])(finalX.toString());
                onChange(input.answerTokens[1])(finalY.toString());
            }
        });
    }

    onChange = (x: boolean) => (v: string) => {
        const { input, onChange } = this.props;

        if (!Snippet.isSnippetInputAnswerSingular(input)) {
            const pos = this.state;

            this.setState({
                x: x ? parseInt(v) : pos.x,
                y: !x ? parseInt(v) : pos.y,
            }, () => {
                onChange(input.answerTokens[0])(this.state.x.toString());
                onChange(input.answerTokens[1])(this.state.y.toString());
                this.setState({
                    dotVisible: true,
                    finalX: this.state.x,
                    finalY: this.state.y
                });
            });
        }
    }

    buildGrid() {
        let gridDivs: JSX.Element[] = [];
        for (let i = 0; i < 16; ++i) {
            gridDivs.push(<div className='position-picker cross-y' style={{ left: `${i * 20}px` }} key={`grid-line-y-${i}`} />);
        }

        for (let i = 0; i < 12; ++i) {
            gridDivs.push(<div className='position-picker cross-x' style={{ top: `${i * 20}px` }} key={`grid-line-x-${i}`} />);
        }

        return gridDivs;
    }

    public renderCore() {
        const { dotVisible, finalX, finalY } = this.state;
        const { defaultX, defaultY } = this.props;

        return (
            <div>
                <div className='ui grid'>
                    <div className='column'>
                        <sui.Input
                            class={'position-picker preview-input'}
                            value={(finalX ? finalX : defaultX).toString()}
                            onChange={this.onChange(true)}
                        />
                    </div>
                    <div className='column'>
                        <sui.Input
                            class={'position-picker preview-input'}
                            value={(finalY ? finalY : defaultY).toString()}
                            onChange={this.onChange(false)}
                        />
                    </div>
                </div>
                <SimulatorDisplay>
                    <div
                        ref={'positionPickerContainer'}
                        className='position-picker container'
                        onMouseMove={this.onMouseMove}
                        onClick={this.setDot}
                    >
                        {this.grid.map((grid) => grid)}
                        <div className='position-picker cross-x' />
                        <div className='position-picker cross-y' />
                        {dotVisible && <div className='position-picker dot' style={{ top: `${(finalY * Y_SCALE)}px`, left: `${(finalX * X_SCALE)}px` }} />}
                    </div>
                </SimulatorDisplay>
            </div>
        )
    }
}