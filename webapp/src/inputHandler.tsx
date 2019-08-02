import * as React from 'react';
import * as data from './data';
import { SpriteEditor } from './spriteEditor';
import * as sui from './sui';


interface InputHandlerProps {
    input: pxt.SnippetQuestionInput;
    onChange: (v: string) => void;
    value: string;
    onEnter?: () => void;
}

interface InputHandlerState {
    isFocused?: boolean;
}

export class InputHandler extends data.Component<InputHandlerProps, InputHandlerState> {
    constructor(props:   InputHandlerProps) {
        super(props);
        this.state = {
            isFocused: false,
        };
    }

    componentDidMount() {
        const inputWrapper = this.refs['inputWrapper'] as HTMLDivElement;

        inputWrapper.addEventListener('keyup', (ev: KeyboardEvent) => {
            if (ev.keyCode === 13) {
                this.props.onEnter();
            }
        })
    }

    renderInput() {
        const { value, input, onChange } = this.props;

        switch (input.type) {
            case 'dropdown':
                return (
                    <DropdownInput
                        input={input}
                        value={value}
                        onChange={onChange}
                    />
                )
            case 'spriteEditor':
                return (
                    <SpriteEditor
                        input={input}
                        onChange={onChange}
                        value={value}
                        fullscreen={false}
                    />
                );
            case 'number':
                return (
                    <RangeInput
                        input={input}
                        value={value}
                        onChange={onChange}
                        autoFocus={true}
                    />
                )
            case 'text':
            default:
                return (
                    <sui.Input
                        label={input.label && input.label}
                        value={value || ''}
                        onChange={onChange}
                        autoFocus={true}
                    />
                )
        }
    }

    renderCore() {
        return (
            <div ref={'inputWrapper'}>
                {this.renderInput()}
            </div>
        )
    }
}

/**
 * Dropdown input
 */

interface IDropdownInputProps {
    input?: pxt.SnippetQuestionInput;
    value?: string;
    onChange: (v: string) => void;
}

class DropdownInput extends data.Component<IDropdownInputProps, {}> {
    constructor(props: IDropdownInputProps) {
        super(props);

        this.onChange = this.onChange.bind(this);
    }

    onChange = (value: string) => () => {
        const { onChange } = this.props;
        onChange(value);
    }

    renderCore() {
        const { value, input } = this.props;

        return (
            <sui.DropdownMenu className='inline button' role="menuitem"
            text={value.length ? pxt.Util.rlf(input.options[value]) : pxt.Util.rlf(input.options[Object.keys(input.options)[0]])}
            icon={'dropdown'}>
            {Object.keys(input.options).map((optionValue) =>
                <sui.Item
                    role="menuitem"
                    value={optionValue}
                    key={input.options[optionValue]}
                    text={pxt.Util.rlf(input.options[optionValue])}
                    onClick={this.onChange(optionValue)}
                />)}
        </sui.DropdownMenu>
        )
    }
}

/**
 * RangeInput/Number
 */

interface IRangeInputProps {
    value: string;
    onChange: (v: string) => void;
    input: pxt.SnippetQuestionInput;
    autoFocus?: boolean;
}

class RangeInput extends data.Component<IRangeInputProps, {}> {
    constructor(props: IRangeInputProps) {
        super(props);

        this.onChange = this.onChange.bind(this);
    }

    private onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const { onChange } = this.props;

        onChange(e.target.value);
    }

    renderCore() {
        const { input, value, autoFocus } = this.props;
        return (
            <div>
                <span>{input.label && input.label}</span>
                <input
                    type='range'
                    autoFocus={autoFocus}
                    className={'slider blocklyMockSlider'}
                    role={'slider'}
                    max={input.max}
                    min={input.min}
                    value={value}
                    onChange={this.onChange}
                    aria-valuemin={input.min}
                    aria-valuemax={input.max}
                    aria-valuenow={value}
                    style={{
                        marginLeft: 0
                    }}
                />
            </div>
        )
    }
}