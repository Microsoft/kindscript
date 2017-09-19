/// <reference path="blockly.d.ts" />

declare namespace Blockly {

    interface FieldCustomOptions {
        colour?: string | number;
    }

    interface FieldCustomDropdownOptions extends FieldCustomOptions {
        data?: any;
    }

    interface FieldCustom extends Field {
        isFieldCustom_: boolean;
        saveOptions?(): pxt.Map<string | number | boolean>;
        restoreOptions?(map: pxt.Map<string | number | boolean>): void;
    }

    interface FieldCustomConstructor {
        new(text: string, options: FieldCustomOptions, validator?: Function): FieldCustom;
    }

    class FieldIconMenu extends FieldDropdown {
        constructor(menuGenerator: ({ src: string; alt: string; width: number; height: number; } | string)[][], params?: pxt.Map<string>);
    }
}