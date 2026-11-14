// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {"pirSensor.name": "PIR Sensor", "pirSensor.description": "PIR human motion detection sensor module."},
        "zh-cn": {"pirSensor.name": "人体红外传感器", "pirSensor.description": "PIR human motion detection sensor module."},
        "zh-tw": {"pirSensor.name": "人體紅外傳感器", "pirSensor.description": "PIR human motion detection sensor module."}
    };
}

function registerScratchExtensionTranslations () { return {}; }

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"], {
        "PIRSENSOR_CATEGORY": "PIR Sensor",
        "PIRSENSOR_INIT": "init pir sensor pin %1",
        "PIRSENSOR_DETECTED": "pir sensor motion detected?"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-cn"], {
        "PIRSENSOR_CATEGORY": "人体红外传感器",
        "PIRSENSOR_INIT": "初始化人体红外传感器 引脚 %1",
        "PIRSENSOR_DETECTED": "人体红外检测到运动？"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-tw"], {
        "PIRSENSOR_CATEGORY": "人體紅外傳感器",
        "PIRSENSOR_INIT": "初始化人體紅外傳感器 管腳 %1",
        "PIRSENSOR_DETECTED": "人體紅外檢測到移動？"
});
    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
