/// <reference path="../../built/pxtlib.d.ts" />

import * as React from "react";
import * as ReactDOM from "react-dom";
import * as data from "./data";
import * as sui from "./sui";
import * as sounds from "./sounds";
import * as core from "./core";
import * as md from "./marked";
import * as compiler from "./compiler";

type ISettingsProps = pxt.editor.ISettingsProps;

/**
 * We'll run this step when we first start the tutorial to figure out what blocks are used so we can
 * filter the toolbox. 
 */
export function getUsedBlocksAsync(code: string): Promise<pxt.Map<number>> {
    if (!code) return Promise.resolve({});
    const usedBlocks: pxt.Map<number> = {};
    return compiler.getBlocksAsync()
        .then(blocksInfo => {
            pxt.blocks.initializeAndInject(blocksInfo);
            return compiler.decompileBlocksSnippetAsync(code, blocksInfo);
        }).then(blocksXml => {
            if (blocksXml) {
                const headless = pxt.blocks.loadWorkspaceXml(blocksXml);
                if (!headless) {
                    pxt.debug(`used blocks xml failed to load\n${blocksXml}`);
                    throw new Error("blocksXml failed to load");
                }
                const allblocks = headless.getAllBlocks();
                for (let bi = 0; bi < allblocks.length; ++bi) {
                    const blk = allblocks[bi];
                    usedBlocks[blk.type] = 1;
                }
                return usedBlocks;
            } else {
                throw new Error("Empty blocksXml, failed to decompile");
            }
        }).catch((e) => {
            pxt.reportException(e);
            throw new Error(`Failed to decompile tutorial`);
        });
}

export class TutorialMenuItem extends data.Component<ISettingsProps, {}> {
    constructor(props: ISettingsProps) {
        super(props);

        this.openTutorialStep = this.openTutorialStep.bind(this);
    }

    openTutorialStep(step: number) {
        let options = this.props.parent.state.tutorialOptions;
        options.tutorialStep = step;
        pxt.tickEvent(`tutorial.step`, { tutorial: options.tutorial, step: step }, { interactiveConsent: true });
        this.props.parent.setTutorialStep(step);
    }

    renderCore() {
        const { tutorialReady, tutorialStepInfo, tutorialStep } = this.props.parent.state.tutorialOptions;
        const currentStep = tutorialStep;
        if (!tutorialReady) return <div />;

        function intermediateClassName(index: number) {
            if (tutorialStepInfo.length < 8 // always show first 8
                || index == 0 // always show first
                || index == tutorialStepInfo.length - 1 // always show last
                || Math.abs(index - currentStep) < 2 // 1 around current step
            ) return "";

            return "mobile hide";
        }

        return <div className="ui item">
            <div className="ui item tutorial-menuitem" role="menubar">
                {tutorialStepInfo.map((step, index) =>
                    (index == currentStep) ?
                        <span className="step-label" key={'tutorialStep' + index}>
                            <TutorialMenuItemLink index={index}
                                className={`ui circular label ${currentStep == index ? 'blue selected' : 'inverted'} ${!tutorialReady ? 'disabled' : ''}`}
                                ariaLabel={lf("Tutorial step {0}. This is the current step", index + 1)}
                                onClick={this.openTutorialStep}>{index + 1}</TutorialMenuItemLink>
                        </span> :
                        <span className={`ui step-label ${intermediateClassName(index)}`} key={'tutorialStep' + index} data-tooltip={`${index + 1}`} data-inverted="" data-position="bottom center">
                            <TutorialMenuItemLink index={index}
                                className={`ui empty circular label ${!tutorialReady ? 'disabled' : ''} clear`}
                                ariaLabel={lf("Tutorial step {0}", index + 1)}
                                onClick={this.openTutorialStep} />
                        </span>
                )}
            </div>
        </div>;
    }
}

interface TutorialMenuItemLinkProps {
    index: number;
    className: string;
    ariaLabel: string;
    onClick: (index: number) => void;
}

export class TutorialMenuItemLink extends data.Component<TutorialMenuItemLinkProps, {}> {

    handleClick = () => {
        this.props.onClick(this.props.index);
    }

    renderCore() {
        const { className, ariaLabel, index } = this.props;
        return <a className={className} role="menuitem" aria-label={ariaLabel} tabIndex={0} onClick={this.handleClick} onKeyDown={sui.fireClickOnEnter}>
            {this.props.children}
        </a>;
    }
}

export interface TutorialHintState {
    visible: boolean;
}

export class TutorialHint extends data.Component<ISettingsProps, TutorialHintState> {

    constructor(props: ISettingsProps) {
        super(props);
    }

    showHint() {
        this.setState({ visible: true })
    }

    renderCore() {
        const { visible } = this.state;
        const options = this.props.parent.state.tutorialOptions;
        const { tutorialReady, tutorialStepInfo, tutorialStep, tutorialName } = options;
        if (!tutorialReady) return <div />;

        const step = tutorialStepInfo[tutorialStep];
        const tutorialHint = step.contentMd;
        const tutorialFullscreen = step.fullscreen;
        const tutorialUnplugged = !!step.unplugged && tutorialStep < tutorialStepInfo.length - 1;

        const header = tutorialFullscreen ? tutorialName : lf("Hint");

        const hide = () => {
            this.setState({ visible: false });
        }
        const next = () => {
            this.setState({ visible: false });
            const nextStep = tutorialStep + 1;
            options.tutorialStep = nextStep;
            pxt.tickEvent(`tutorial.hint.next`, { tutorial: options.tutorial, step: nextStep });
            this.props.parent.setTutorialStep(nextStep);
        }

        const actions: sui.ModalButton[] = [{
            label: lf("Ok"),
            onclick: tutorialUnplugged ? next : hide,
            icon: 'check',
            className: 'green'
        }]

        return <sui.Modal isOpen={visible} className="hintdialog"
            closeIcon={true} header={header} buttons={actions}
            onClose={tutorialUnplugged ? next : hide} dimmer={true} longer={true}
            closeOnDimmerClick closeOnDocumentClick closeOnEscape>
            <md.MarkedContent markdown={tutorialHint} parent={this.props.parent} />
        </sui.Modal>;
    }
}

interface TutorialCardState {
    popout?: boolean;
}

export class TutorialCard extends data.Component<ISettingsProps, TutorialCardState> {
    public focusInitialized: boolean;

    constructor(props: ISettingsProps) {
        super(props);
        this.state = {
        }

        this.showHint = this.showHint.bind(this);
        this.closeLightbox = this.closeLightbox.bind(this);
        this.tutorialCardKeyDown = this.tutorialCardKeyDown.bind(this);
        this.okButtonKeyDown = this.okButtonKeyDown.bind(this);
        this.previousTutorialStep = this.previousTutorialStep.bind(this);
        this.nextTutorialStep = this.nextTutorialStep.bind(this);
        this.finishTutorial = this.finishTutorial.bind(this);
        this.toggleExpanded = this.toggleExpanded.bind(this);
    }

    previousTutorialStep() {
        let options = this.props.parent.state.tutorialOptions;
        const currentStep = options.tutorialStep;
        const previousStep = currentStep - 1;

        options.tutorialStep = previousStep;

        pxt.tickEvent(`tutorial.previous`, { tutorial: options.tutorial, step: previousStep }, { interactiveConsent: true });
        this.props.parent.setTutorialStep(previousStep);
    }

    nextTutorialStep() {
        let options = this.props.parent.state.tutorialOptions;
        const currentStep = options.tutorialStep;
        const nextStep = currentStep + 1;

        options.tutorialStep = nextStep;

        pxt.tickEvent(`tutorial.next`, { tutorial: options.tutorial, step: nextStep }, { interactiveConsent: true });
        this.props.parent.setTutorialStep(nextStep);
    }

    finishTutorial() {
        this.closeLightbox();
        this.props.parent.completeTutorial();
    }

    private closeLightboxOnEscape = (e: KeyboardEvent) => {
        const charCode = core.keyCodeFromEvent(e);
        if (charCode === 27) {
            this.closeLightbox();
        }
    }

    setPopout() {
        this.setState({ popout: true });
    }

    private closeLightbox() {
        sounds.tutorialNext();
        document.documentElement.removeEventListener("keydown", this.closeLightboxOnEscape);

        // Hide lightbox
        this.props.parent.hideLightbox();
        this.setState({ popout: false });
    }

    componentWillUpdate() {
        document.documentElement.addEventListener("keydown", this.closeLightboxOnEscape);
    }

    private tutorialCardKeyDown(e: KeyboardEvent) {
        const charCode = core.keyCodeFromEvent(e);
        if (charCode == core.TAB_KEY) {
            e.preventDefault();
            const tutorialOkRef = this.refs["tutorialok"] as sui.Button;
            const okButton = ReactDOM.findDOMNode(tutorialOkRef) as HTMLElement;
            okButton.focus();
        }
    }

    private okButtonKeyDown(e: KeyboardEvent) {
        const charCode = core.keyCodeFromEvent(e);
        if (charCode == core.TAB_KEY) {
            e.preventDefault();
            const tutorialCard = this.refs['tutorialmessage'] as HTMLElement;
            tutorialCard.focus();
        }
    }

    private lastStep = -1;
    componentDidUpdate(prevProps: ISettingsProps, prevState: TutorialCardState) {
        const tutorialCard = this.refs['tutorialmessage'] as HTMLElement;
        const tutorialOkRef = this.refs["tutorialok"] as sui.Button;
        const okButton = ReactDOM.findDOMNode(tutorialOkRef) as HTMLElement;
        if (prevState.popout != this.state.popout && this.state.popout) {
            // Setup focus trap around the tutorial card and the ok button
            tutorialCard.addEventListener('keydown', this.tutorialCardKeyDown);
            okButton.addEventListener('keydown', this.okButtonKeyDown);
            tutorialCard.focus();
        } else if (prevState.popout != this.state.popout && !this.state.popout) {
            // Unregister event handlers
            tutorialCard.removeEventListener('keydown', this.tutorialCardKeyDown);
            okButton.removeEventListener('keydown', this.okButtonKeyDown);
            tutorialCard.focus();
        }
        const step = this.props.parent.state.tutorialOptions.tutorialStep;
        if (step != this.lastStep) {
            const animationClasses = `fade ${step < this.lastStep ? "right" : "left"} in visible transition animating`;
            tutorialCard.style.animationDuration = '500ms';
            this.lastStep = step;
            pxsim.U.addClass(tutorialCard, animationClasses);
            Promise.resolve().delay(500)
                .then(() => pxsim.U.removeClass(tutorialCard, animationClasses));
        }
    }

    componentWillUnmount() {
        // Clear the markdown cache when we unmount
        md.MarkedContent.clearBlockSnippetCache();
        this.lastStep = -1;
    }

    toggleExpanded(ev: React.MouseEvent<HTMLDivElement>) {
        ev.stopPropagation();
        ev.preventDefault();
        const options = this.props.parent.state.tutorialOptions;
        const { tutorialStepExpanded } = options;
        this.props.parent.setTutorialInstructionsExpanded(!tutorialStepExpanded);
        return false;
    }

    private hasHint() {
        const options = this.props.parent.state.tutorialOptions;
        const { tutorialReady, tutorialStepInfo, tutorialStep } = options;
        if (!tutorialReady) return false;
        return tutorialStepInfo[tutorialStep].hasHint;
    }

    showHint() {
        if (!this.hasHint()) return;
        this.closeLightbox();
        this.props.parent.showTutorialHint();
    }

    renderCore() {
        const options = this.props.parent.state.tutorialOptions;
        const { tutorialReady, tutorialStepInfo, tutorialStep, tutorialStepExpanded } = options;
        if (!tutorialReady) return <div />
        const tutorialCardContent = tutorialStepExpanded
            ? tutorialStepInfo[tutorialStep].contentMd
            : tutorialStepInfo[tutorialStep].headerContentMd;
        let tutorialAriaLabel = '';

        const currentStep = tutorialStep;
        const maxSteps = tutorialStepInfo.length;
        const hasPrevious = tutorialReady && currentStep != 0;
        const hasNext = tutorialReady && currentStep != maxSteps - 1;
        const hasFinish = currentStep == maxSteps - 1;
        const hasHint = this.hasHint();

        if (hasHint) {
            tutorialAriaLabel += lf("Press Space or Enter to show a hint.");
        }

        const isRtl = pxt.Util.isUserLanguageRtl();
        return <div id="tutorialcard" className={`ui ${tutorialStepExpanded ? 'tutorialExpanded' : ''} ${tutorialReady ? 'tutorialReady' : ''}`} >
            <div className='ui buttons'>
                {hasPrevious ? <sui.Button icon={`${isRtl ? 'right' : 'left'} chevron orange large`} className={`prevbutton left attached ${!hasPrevious ? 'disabled' : ''}`} text={lf("Back")} textClass="widedesktop only" ariaLabel={lf("Go to the previous step of the tutorial.")} onClick={this.previousTutorialStep} onKeyDown={sui.fireClickOnEnter} /> : undefined}
                <div className="ui segment attached tutorialsegment">
                    <div ref="tutorialmessage" className={`tutorialmessage`} role="alert" aria-label={tutorialAriaLabel} tabIndex={hasHint ? 0 : -1}
                        onClick={this.toggleExpanded} onKeyDown={sui.fireClickOnEnter}>
                        <div className="content">
                            <md.MarkedContent className="no-select" markdown={tutorialCardContent} parent={this.props.parent} />
                        </div>
                        {hasHint && !tutorialStepExpanded ? <sui.Button className="fluid compact attached bottom" icon="chevron down" tabIndex={0} text={lf("More...")} onClick={this.toggleExpanded} onKeyDown={sui.fireClickOnEnter} /> : undefined}
                        {tutorialStepExpanded ? <sui.Button className="fluid compact attached bottom" icon="chevron up" tabIndex={0} text={lf("Less...")} onClick={this.toggleExpanded} onKeyDown={sui.fireClickOnEnter} /> : undefined}
                    </div>
                    <sui.Button ref="tutorialok" id="tutorialOkButton" className="large green okbutton showlightbox" text={lf("Ok")} onClick={this.closeLightbox} onKeyDown={sui.fireClickOnEnter} />
                </div>
                {hasNext ? <sui.Button icon={`${isRtl ? 'left' : 'right'} chevron orange large`} className={`nextbutton right attached ${!hasNext ? 'disabled' : ''}`} text={lf("Next")} textClass="widedesktop only" ariaLabel={lf("Go to the next step of the tutorial.")} onClick={this.nextTutorialStep} onKeyDown={sui.fireClickOnEnter} /> : undefined}
                {hasFinish ? <sui.Button icon="left checkmark" className={`orange right attached ${!tutorialReady ? 'disabled' : ''}`} text={lf("Finish")} ariaLabel={lf("Finish the tutorial.")} onClick={this.finishTutorial} onKeyDown={sui.fireClickOnEnter} /> : undefined}
            </div>
        </div>;
    }
}