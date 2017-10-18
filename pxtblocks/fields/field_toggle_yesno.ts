/// <reference path="../../localtypings/blockly.d.ts" />

namespace pxtblockly {

    export class FieldToggleYesNo extends FieldToggle implements Blockly.FieldCustom {
        public isFieldCustom_ = true;

        constructor(state: string, params: Blockly.FieldCustomOptions, opt_validator?: Function) {
            super(state, params, opt_validator);
        }

        getTrueText() {
            return lf("Yes");
        }

        getFalseText() {
            return lf("No");
        }
    }
}