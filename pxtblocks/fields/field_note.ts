/// <reference path="../../localtypings/pxtblockly.d.ts" />

namespace pxtblockly {

    enum Note {
        C = 262,
        CSharp = 277,
        D = 294,
        Eb = 311,
        E = 330,
        F = 349,
        FSharp = 370,
        G = 392,
        GSharp = 415,
        A = 440,
        Bb = 466,
        B = 494,
        C3 = 131,
        CSharp3 = 139,
        D3 = 147,
        Eb3 = 156,
        E3 = 165,
        F3 = 175,
        FSharp3 = 185,
        G3 = 196,
        GSharp3 = 208,
        A3 = 220,
        Bb3 = 233,
        B3 = 247,
        C4 = 262,
        CSharp4 = 277,
        D4 = 294,
        Eb4 = 311,
        E4 = 330,
        F4 = 349,
        FSharp4 = 370,
        G4 = 392,
        GSharp4 = 415,
        A4 = 440,
        Bb4 = 466,
        B4 = 494,
        C5 = 523,
        CSharp5 = 555,
        D5 = 587,
        Eb5 = 622,
        E5 = 659,
        F5 = 698,
        FSharp5 = 740,
        G5 = 784,
        GSharp5 = 831,
        A5 = 880,
        Bb5 = 932,
        B5 = 988,
        C6 = 1047,
        CSharp6 = 1109,
        D6 = 1175,
        Eb6 = 1245,
        E6 = 1319,
        F6 = 1397,
        FSharp6 = 1480,
        G6 = 1568,
        GSharp6 = 1568,
        A6 = 1760,
        Bb6 = 1865,
        B6 = 1976,
        C7 = 2093
    }

    interface NoteData {
        name: string,
        prefixedName: string,
        altPrefixedName?: string,
        freq: number
    }

    const Notes: {[key: number]: NoteData} = {
        28: { name: lf("C"), prefixedName: lf("Low C"), freq: 131 },
        29: { name: lf("C#"), prefixedName: lf("Low C#"), freq: 139 },
        30: { name: lf("D"), prefixedName: lf("Low D"), freq: 147 },
        31: { name: lf("D#"), prefixedName: lf("Low D#"), freq: 156 },
        32: { name: lf("E"), prefixedName: lf("Low E"), freq: 165 },
        33: { name: lf("F"), prefixedName: lf("Low F"), freq: 175 },
        34: { name: lf("F#"), prefixedName: lf("Low F#"), freq: 185 },
        35: { name: lf("G"), prefixedName: lf("Low G"), freq: 196 },
        36: { name: lf("G#"), prefixedName: lf("Low G#"), freq: 208 },
        37: { name: lf("A"), prefixedName: lf("Low A"), freq: 220 },
        38: { name: lf("A#"), prefixedName: lf("Low A#"), freq: 233 },
        39: { name: lf("B"), prefixedName: lf("Low B"), freq: 247 },

        40: { name: lf("C"), prefixedName: lf("Middle C"), freq: 262 },
        41: { name: lf("C#"), prefixedName: lf("Middle C#"), freq: 277 },
        42: { name: lf("D"), prefixedName: lf("Middle D"), freq: 294 },
        43: { name: lf("D#"), prefixedName: lf("Middle D#"), freq: 311 },
        44: { name: lf("E"), prefixedName: lf("Middle E"), freq: 330 },
        45: { name: lf("F"), prefixedName: lf("Middle F"), freq: 349 },
        46: { name: lf("F#"), prefixedName: lf("Middle F#"), freq: 370 },
        47: { name: lf("G"), prefixedName: lf("Middle G"), freq: 392 },
        48: { name: lf("G#"), prefixedName: lf("Middle G#"), freq: 415 },
        49: { name: lf("A"), prefixedName: lf("Middle A"), freq: 440 },
        50: { name: lf("A#"), prefixedName: lf("Middle A#"), freq: 466 },
        51: { name: lf("B"), prefixedName: lf("Middle B"), freq: 494 },

        52: { name: lf("C"), prefixedName: lf("Tenor C"), altPrefixedName: lf("High C"), freq: 523 },
        53: { name: lf("C#"), prefixedName: lf("Tenor C#"), altPrefixedName: lf("High C#"), freq: 554 },
        54: { name: lf("D"), prefixedName: lf("Tenor D"), altPrefixedName: lf("High D"), freq: 587 },
        55: { name: lf("D#"), prefixedName: lf("Tenor D#"), altPrefixedName: lf("High D#"), freq: 622 },
        56: { name: lf("E"), prefixedName: lf("Tenor E"), altPrefixedName: lf("High E"), freq: 659 },
        57: { name: lf("F"), prefixedName: lf("Tenor F"), altPrefixedName: lf("High F"), freq: 698 },
        58: { name: lf("F#"), prefixedName: lf("Tenor F#"), altPrefixedName: lf("High F#"), freq: 740 },
        59: { name: lf("G"), prefixedName: lf("Tenor G"), altPrefixedName: lf("High G"), freq: 784 },
        60: { name: lf("G#"), prefixedName: lf("Tenor G#"), altPrefixedName: lf("High G#"), freq: 831 },
        61: { name: lf("A"), prefixedName: lf("Tenor A"), altPrefixedName: lf("High A"), freq: 880 },
        62: { name: lf("A#"), prefixedName: lf("Tenor A#"), altPrefixedName: lf("High A#"), freq: 932 },
        63: { name: lf("B"), prefixedName: lf("Tenor B"), altPrefixedName: lf("High B"), freq: 988 },

        64: { name: lf("C"), prefixedName: lf("High C"), freq: 1046 },
        65: { name: lf("C#"), prefixedName: lf("High C#"), freq: 1109 },
        66: { name: lf("D"), prefixedName: lf("High D"), freq: 1175 },
        67: { name: lf("D#"), prefixedName: lf("High D#"), freq: 1245 },
        68: { name: lf("E"), prefixedName: lf("High E"), freq: 1319 },
        69: { name: lf("F"), prefixedName: lf("High F"), freq: 1397 },
        70: { name: lf("F#"), prefixedName: lf("High F#"), freq: 1478 },
        71: { name: lf("G"), prefixedName: lf("High G"), freq: 1568 },
        72: { name: lf("G#"), prefixedName: lf("High G#"), freq: 1661 },
        73: { name: lf("A"), prefixedName: lf("High A"), freq: 1760 },
        74: { name: lf("A#"), prefixedName: lf("High A#"), freq: 1865 },
        75: { name: lf("B"), prefixedName: lf("High B"), freq: 1976 }
    }

    export interface FieldNoteOptions extends Blockly.FieldCustomOptions {
        editorColour?: string;
        minNote?: string;
        maxNote?: string;
    }

    export class FieldNote extends Blockly.FieldNumber implements Blockly.FieldCustom {
        public isFieldCustom_ = true;
        public SERIALIZABLE = true;

        protected primaryColour: string;
        protected borderColour: string;
        protected isExpanded: Boolean;

        /**
         * default number of piano keys
         */
        private nKeys_: number = 36;
        private minNote_: number = 28;
        private maxNote_: number = 63;

        protected static readonly keyWidth = 22;
        protected static readonly keyHeight = 90;
        protected static readonly labelHeight = 24;
        protected static readonly prevNextHeight = 20;
        protected static readonly notesPerOctave = 12;
        protected static readonly blackKeysPerOctave = 5;

        protected currentPage: number;
        protected piano: HTMLDivElement[];
        protected noteLabel: HTMLDivElement;
        protected currentSelectedKey: HTMLDivElement;
        protected totalPlayCount: number;

        /**
         * Absolute error for note frequency identification (Hz)
         */
        eps: number = 2;

        private noteFreq_: number[];
        private noteName_: string[];

        constructor(text: string, params: FieldNoteOptions, validator?: Function) {
            super(text, 0, null, null, validator);

            // explicitly set the text; this will be re-evaluated in `init`
            // when the note names and frequencies have been evaluated.
            this.isExpanded = false;
            this.currentPage = 0;
            this.totalPlayCount = 0;

            if (params.editorColour) {
                this.primaryColour = pxtblockly.parseColour(params.editorColour);
                this.borderColour = Blockly.utils.colour.darken(this.primaryColour, 0.2);
            }

            const minNote = parseInt(params.minNote) || this.minNote_;
            const maxNote = parseInt(params.maxNote) || this.maxNote_;
            if (minNote >= 28 && maxNote <= 76 && maxNote > minNote) {
                this.minNote_ = minNote;
                this.maxNote_ = maxNote;
                this.nKeys_ = this.maxNote_ - this.minNote_ + 1;
            }

            this.noteFreq_ = [];
            this.noteName_ = [];
            // Create arrays of name/frequency of the notes
            for (let i = this.minNote_; i <= this.maxNote_; i++) {
                let name = Notes[i].prefixedName;
                // special case: one octave
                if (this.nKeys_ < 13) {
                    name = Notes[i].name;
                }
                // special case: centered
                else if (this.minNote_ >= 28 && this.maxNote_ <= 63) {
                    name = Notes[i].altPrefixedName || name;
                }
                this.noteName_.push(name);
                this.noteFreq_.push(Notes[i].freq);
            }

            this.doValueUpdate_(text);
        }

        /**
         * Ensure that only a non negative number may be entered.
         * @param {string} text The user's text.
         * @return {?string} A string representing a valid positive number, or null if invalid.
         */
        doClassValidation_(text: string) {
            if (text === null) {
                return null;
            }

            const n = parseFloat(text || "0");
            if (isNaN(n) || n < 0) {
                // Invalid number.
                return null;
            }

            const showDecimal = Math.floor(n) != n;
            return "" + n.toFixed(showDecimal ? 2 : 0);
        }

        /**
         * Return the current note frequency.
         * @return {string} Current note in string format.
         */
        getValue(): string {
            return this.value_;
        }

        /**
         * Called by setValue if the text input is valid. Updates the value of the
         * field, and updates the text of the field if it is not currently being
         * edited (i.e. handled by the htmlInput_).
         * @param {string} note The new note in string format.
         */
        doValueUpdate_(note: string) {
            // accommodate note strings like "Note.GSharp5" as well as numbers
            const match = /^Note\.(.+)$/.exec(note);
            const noteName: any = (match && match.length > 1) ? match[1] : null;
            note = Note[noteName] ? Note[noteName] : String(parseFloat(note || "0"));

            if (isNaN(Number(note)) || Number(note) < 0)
                return;

            if (this.sourceBlock_ && Blockly.Events.isEnabled() && this.value_ != note) {
                Blockly.Events.fire(
                    new Blockly.Events.Change(
                        this.sourceBlock_,
                        "field",
                        this.name,
                        this.value_,
                        note
                    )
                );
            }

            this.value_ = note;
            this.refreshText();
        }

        /**
         * Get the text from this field
         * @return {string} Current text.
         */
        getText(): string {
            return this.convertToText(this.value_);
        }

        protected convertToText(value: any) {
            if (this.isExpanded) {
                return "" + value;
            } else {
                const note = +value;
                for (let i = 0; i < this.nKeys_; i++) {
                    if (Math.abs(this.noteFreq_[i] - note) < this.eps) {
                        return this.noteName_[i];
                    }
                }
                let text = note.toString();
                if (!isNaN(note))
                    text += " Hz";
                return text;
            }
        }

        onHtmlInputChange_(e: any) {
            super.onHtmlInputChange_(e);
            Blockly.DropDownDiv.hideWithoutAnimation();
        }

        /**
         * Create a piano under the note field.
         */
        showEditor_(e: Event): void {
            this.isExpanded = true;
            this.updateColor();

            // If there is an existing drop-down someone else owns, hide it immediately and clear it.
            Blockly.DropDownDiv.hideWithoutAnimation();
            Blockly.DropDownDiv.clearContent();

            const isMobile = pxt.BrowserUtils.isMobile() || pxt.BrowserUtils.isIOS();
            // invoke FieldTextInputs showeditor, so we can set quiet explicitly.
            (FieldNote as any).superClass_.showEditor_.call(this, e, /** quiet **/ isMobile, /** readonly **/ isMobile);
            this.refreshText();

            // save all changes in the same group of events
            Blockly.Events.setGroup(true);

            this.piano = [];
            this.currentSelectedKey = undefined;

            const totalWhiteKeys = this.nKeys_ - (this.nKeys_ / FieldNote.notesPerOctave * FieldNote.blackKeysPerOctave);
            const whiteKeysPerOctave = FieldNote.notesPerOctave - FieldNote.blackKeysPerOctave;
            let pianoWidth = FieldNote.keyWidth * totalWhiteKeys;
            let pianoHeight = FieldNote.keyHeight + FieldNote.labelHeight;

            const pagination = window.innerWidth < pianoWidth;

            if (pagination) {
                pianoWidth = whiteKeysPerOctave * FieldNote.keyWidth;
                pianoHeight = FieldNote.keyHeight + FieldNote.labelHeight + FieldNote.prevNextHeight;
            }

            const pianoDiv = createStyledDiv(
                "blocklyPianoDiv",
                `width: ${pianoWidth}px;
                height: ${pianoHeight}px;`
            );
            Blockly.DropDownDiv.getContentDiv().appendChild(pianoDiv);

            // render note label
            this.noteLabel = createStyledDiv(
                "blocklyNoteLabel",
                `top: ${FieldNote.keyHeight}px;
                width: ${pianoWidth}px;
                background-color: ${this.primaryColour};
                border-color: ${this.primaryColour};`
            );
            pianoDiv.appendChild(this.noteLabel);
            this.noteLabel.textContent = "-";

            let startingPage = 0;
            for (let i = 0; i < this.nKeys_; i++) {
                const currentOctave = Math.floor(i / FieldNote.notesPerOctave);
                let position = this.getPosition(i);

                // modify original position in pagination
                if (pagination && i >= FieldNote.notesPerOctave)
                    position -= whiteKeysPerOctave * currentOctave * FieldNote.keyWidth;

                const key = this.getKey(i, position, isMobile);
                this.piano.push(key);
                pianoDiv.appendChild(key);

                // if the current value is within eps of this note, select it.
                if (Math.abs(this.noteFreq_[i] - Number(this.getValue())) < this.eps) {
                    pxt.BrowserUtils.addClass(key, "selected");
                    this.currentSelectedKey = key;
                    startingPage = currentOctave;
                }
            }

            if (pagination) {
                this.setPage(startingPage);
                pianoDiv.appendChild(this.getNextPrevDiv(pianoWidth, /** prev **/ true));
                pianoDiv.appendChild(this.getNextPrevDiv(pianoWidth, /** prev **/ false));
            }

            Blockly.DropDownDiv.setColour(this.primaryColour, this.borderColour);
            Blockly.DropDownDiv.showPositionedByBlock(this, this.sourceBlock_, () => this.onHide());
        }

        protected playKey(key: HTMLDivElement) {
            const notePlayID = ++this.totalPlayCount;
            const freq = key.getAttribute("frequency");

            if (this.currentSelectedKey !== key) {
                if (this.currentSelectedKey)
                    pxt.BrowserUtils.removeClass(this.currentSelectedKey, "selected");
                pxt.BrowserUtils.addClass(key, "selected");
                this.setValue(freq);
            }

            this.currentSelectedKey = key;
            /**
             * force a rerender of the preview; other attempts at changing the value
             * do not show up on the block itself until after the fieldeditor is closed,
             * as it is currently in an editable state.
             **/
            (this as any).htmlInput_.value = this.convertToText(freq);

            pxt.AudioContextManager.tone(+freq);
            setTimeout(() => {
                // Clear the sound if it is still playing after 300ms
                if (this.totalPlayCount == notePlayID) pxt.AudioContextManager.stop();
            }, 300);
        }

        /**
         * Callback for when the drop-down is hidden.
         */
        protected onHide() {
            this.isExpanded = false;
            this.refreshText()
        };

        /**
         * Close the note picker if this input is being deleted.
         */
        dispose() {
            Blockly.DropDownDiv.hideIfOwner(this);
            super.dispose()
        }

        private updateColor() {
            if (this.sourceBlock_.parentBlock_ && (this.sourceBlock_.isShadow() || hasOnlyOneField(this.sourceBlock_))) {
                this.primaryColour = this.sourceBlock_.parentBlock_.getColour();
                this.borderColour = this.sourceBlock_.parentBlock_.getColourTertiary();
            }
            else {
                this.primaryColour = this.sourceBlock_.getColourTertiary();
                this.borderColour = this.sourceBlock_.getColourTertiary();
            }
        }

        onFinishEditing_(text: string) {
            this.refreshText();
        }

        /**
         * This block shows up differently when it's being edited;
         * on any transition between `editing <--> not-editing`
         * or other change in state,
         * refresh the text to get back into a valid state.
         **/
        protected refreshText() {
            this.setText(this.getText());
            this.forceRerender();
        }

        protected setPage(page: number) {
            const pageCount = this.nKeys_ / FieldNote.notesPerOctave;

            page = Math.max(Math.min(page, pageCount - 1), 0);
            this.noteLabel.textContent = `Octave #${page + 1}`;

            const firstKeyInOctave = page * FieldNote.notesPerOctave;

            for (let i = 0; i < this.piano.length; ++i) {
                const isInOctave = i >= firstKeyInOctave && i < firstKeyInOctave + FieldNote.notesPerOctave;
                this.piano[i].style.display = isInOctave ? "block" : "none";
            }

            this.currentPage = page;
        };

        /**
         * create a DOM to assign a style to the previous and next buttons
         * @param pianoWidth the width of the containing piano
         * @param isPrev true if is previous button, false otherwise
         * @return DOM with the new css style.s
         */
        protected getNextPrevDiv(pianoWidth: number, isPrev: boolean) {
            const xPosition = isPrev ? 0 : (pianoWidth / 2);
            const yPosition = FieldNote.keyHeight + FieldNote.labelHeight;

            const output = createStyledDiv(
                "blocklyNotePrevNext",
                `top: ${yPosition}px;
                left: ${xPosition}px;
                width: ${Math.ceil(pianoWidth / 2)}px;
                ${isPrev ? "border-left-color" : "border-right-color"}: ${this.primaryColour};
                background-color: ${this.primaryColour};
                border-bottom-color: ${this.primaryColour};`
            );

            Blockly.bindEventWithChecks_(
                output,
                'mousedown',
                this,
                () => this.setPage(isPrev ? this.currentPage - 1 : this.currentPage + 1),
                /** noCaptureIdentifier **/ true,
                /** noPreventDefault **/ true
            );

            output.textContent = isPrev ? "<" : ">";
            return output;
        }

        protected getKey(keyInd: number, leftPosition: number, isMobile: boolean) {
            const output = createStyledDiv(
                `blocklyNote ${this.isWhite(keyInd) ? "" : "black"}`,
                `width: ${this.getKeyWidth(keyInd)}px;
                height: ${this.getKeyHeight(keyInd)}px;
                left: ${leftPosition}px;
                border-color: ${this.primaryColour};`
            );

            output.setAttribute("frequency", this.noteFreq_[keyInd] + "");

            Blockly.bindEventWithChecks_(
                output,
                isMobile ? 'touchstart' : 'mousedown',
                this,
                () => this.playKey(output),
                /** noCaptureIdentifier **/ true,
                /** noPreventDefault **/ true
            );

            Blockly.bindEventWithChecks_(
                output,
                'mouseover',
                this,
                () => this.noteLabel.textContent = this.noteName_[keyInd],
                /** noCaptureIdentifier **/ true,
                /** noPreventDefault **/ true
            );

            return output;
        }

        /**
         * @param idx index of the key
         * @return true if idx is white
         * @private
         */
        protected isWhite(idx: number): boolean {
            switch (idx % 12) {
                case 1: case 3: case 6:
                case 8: case 10:
                    return false;
                default:
                    return true;
            }
        }

        /**
         * get width of the piano key
         * @param idx index of the key
         * @return width of the key
         */
        protected getKeyWidth(idx: number): number {
            if (this.isWhite(idx))
                return FieldNote.keyWidth;
            return FieldNote.keyWidth / 2;
        }

        /**
         * get height of the piano key
         * @param idx index of the key
         * @return height of the key
         */
        protected getKeyHeight(idx: number): number {
            if (this.isWhite(idx))
                return FieldNote.keyHeight;
            return FieldNote.keyHeight / 2;
        }

        /**
         * get the position of the key in the piano
         * @param idx index of the key
         * @return position of the key
         */
        protected getPosition(idx: number): number {
            const whiteKeyCount = idx - Math.floor((idx + 1) / FieldNote.notesPerOctave * FieldNote.blackKeysPerOctave);
            const pos = whiteKeyCount * FieldNote.keyWidth;
            if (this.isWhite(idx))
                return pos;
            return pos - (FieldNote.keyWidth / 4);
        }
    }

    function hasOnlyOneField(block: Blockly.Block) {
        return block.inputList.length === 1 && block.inputList[0].fieldRow.length === 1;
    }

    function createStyledDiv(className: string, style?: string) {
        const output = document.createElement("div");
        pxt.BrowserUtils.addClass(output, className);
        if (style)
            output.setAttribute("style", style.replace(/\s+/g, " "));
        return output;
    }
}
