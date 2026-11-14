// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {"flameSensor.name": "Flame Sensor", "flameSensor.description": "Flame detection sensor module with analog and digital outputs."},
        "zh-cn": {"flameSensor.name": "火焰传感器", "flameSensor.description": "Flame detection sensor module with analog and digital outputs."},
        "zh-tw": {"flameSensor.name": "火焰傳感器", "flameSensor.description": "Flame detection sensor module with analog and digital outputs."}
    };
}

function registerScratchExtensionTranslations () { return {}; }

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"], {
        "FLAMESENSOR_CATEGORY": "Flame Sensor",
        "FLAMESENSOR_READDIGITAL": "flame sensor digital pin %1 detected?",
        "FLAMESENSOR_READANALOG": "read flame sensor analog pin %1"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-cn"], {
        "FLAMESENSOR_CATEGORY": "火焰传感器",
        "FLAMESENSOR_READDIGITAL": "火焰传感器 数字引脚 %1 检测到？",
        "FLAMESENSOR_READANALOG": "读取火焰传感器 模拟引脚 %1"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-tw"], {
        "FLAMESENSOR_CATEGORY": "火焰傳感器",
        "FLAMESENSOR_READDIGITAL": "火焰傳感器 數字管腳 %1 檢測到？",
        "FLAMESENSOR_READANALOG": "讀取火焰傳感器 模擬管腳 %1"
});
    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
