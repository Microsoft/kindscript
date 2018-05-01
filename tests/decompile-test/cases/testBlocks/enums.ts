const enum MyEnum {
    //% blockIdentity="enumTest.enumShim"
    Value1,
    //% blockIdentity="enumTest.enumShim"
    Value2
}

namespace enumTest {

    /**
     * Enum shim (for shadow blocks)
     */
    //% shim=TD_ID
    //% blockId=enum_shim
    //% block="enum %enum"
    export function enumShim(value: MyEnum): number {
        return value;
    }


    /**
     * Enum event with no shadow block
     */
    //% blockId=enum_event
    //% block="event %enum"
    export function enumEvent(value: MyEnum, handler: () => void) {

    }

    /**
     * Enum API with no shadow block
     */
    //% blockId=enum_arg
    //% block="arg %enum"
    export function enumArg(value: MyEnum) {

    }

    /**
     * Enum API with a shadow block
     */
    //% blockId=enum_shadow_arg
    //% block="shadow %enum=enum_shim"
    export function enumShadowArg(value: number) {

    }
}