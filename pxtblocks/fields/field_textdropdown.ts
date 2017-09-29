/// <reference path="../../localtypings/pxtblockly.d.ts" />

namespace pxtblockly {

    export interface FieldTextDropdownOptions extends Blockly.FieldCustomOptions {
        values: any;
    }

    export class FieldTextDropdown extends Blockly.FieldTextDropdown implements Blockly.FieldCustom {
        public isFieldCustom_ = true;

        constructor(text: string, options: FieldTextDropdownOptions, validator?: Function) {
            super(text, options.values, validator);
        }
    }
}