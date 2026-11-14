// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {"raindropSensor.name": "Raindrop Sensor", "raindropSensor.description": "Raindrop detection sensor module with analog and digital outputs."},
        "zh-cn": {"raindropSensor.name": "雨滴传感器", "raindropSensor.description": "Raindrop detection sensor module with analog and digital outputs."},
        "zh-tw": {"raindropSensor.name": "雨滴傳感器", "raindropSensor.description": "Raindrop detection sensor module with analog and digital outputs."}
    };
}

function registerScratchExtensionTranslations () { return {}; }

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"], {
        "RAINDROPSENSOR_CATEGORY": "Raindrop Sensor",
        "RAINDROPSENSOR_READDIGITAL": "raindrop sensor digital pin %1 wet?",
        "RAINDROPSENSOR_READANALOG": "read raindrop sensor analog pin %1"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-cn"], {
        "RAINDROPSENSOR_CATEGORY": "雨滴传感器",
        "RAINDROPSENSOR_READDIGITAL": "雨滴传感器 数字引脚 %1 潮湿？",
        "RAINDROPSENSOR_READANALOG": "读取雨滴传感器 模拟引脚 %1"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-tw"], {
        "RAINDROPSENSOR_CATEGORY": "雨滴傳感器",
        "RAINDROPSENSOR_READDIGITAL": "雨滴傳感器 數字管腳 %1 潮濕？",
        "RAINDROPSENSOR_READANALOG": "讀取雨滴傳感器 模擬管腳 %1"
});
    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
