// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {
            "activateBuzzer.name": "有源蜂鸣器",
            "activateBuzzer.description": "用于打开或者关闭有源蜂鸣器"
        },
        "zh-cn": {
            "activateBuzzer.name": "有源蜂鸣器",
            "activateBuzzer.description": "用于打开或者关闭有源蜂鸣器"
        }
    };
}

function registerScratchExtensionTranslations () {
    return {};
}

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"],
        {
            "ACTIVATEBUZZER_CATEGORY": "有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_ON": "打开有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_OFF": "关闭有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_INIT": "初始化有源蜂鸣器 引脚 %1"
        }
    );

    Object.assign(Blockly.ScratchMsgs.locales["zh-cn"],
        {
            "ACTIVATEBUZZER_CATEGORY": "有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_ON": "打开有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_OFF": "关闭有源蜂鸣器",
            "ACTIVATEBUZZER_ACTIVEBUZZER_INIT": "初始化有源蜂鸣器 引脚 %1"
        }
    );
    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
