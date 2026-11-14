// This file was automatically generated. Do not modify.
/* eslint-disable func-style */
/* eslint-disable require-jsdoc */
/* eslint-disable quotes */
/* eslint-disable quote-props */
/* eslint-disable dot-notation */
/* eslint-disable max-len */
function getInterfaceTranslations () {
    return {
        "en": {"atomizer.name": "Atomizer", "atomizer.description": "Atomizer module on/off control."},
        "zh-cn": {"atomizer.name": "雾化器", "atomizer.description": "雾化器开关控制模块"},
        "zh-tw": {"atomizer.name": "霧化器", "atomizer.description": "霧化器開關控制模組"}
    };
}

function registerScratchExtensionTranslations () { return {}; }

function registerBlocksMessages (Blockly) {
    Object.assign(Blockly.ScratchMsgs.locales["en"], {
        "ATOMIZER_CATEGORY": "Atomizer",
        "ATOMIZER_INIT": "init atomizer pin %1",
        "ATOMIZER_SETSTATE": "set atomizer %1",
        "ATOMIZER_TOGGLE": "toggle atomizer",
        "ATOMIZER_ON": "on",
        "ATOMIZER_OFF": "off"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-cn"], {
        "ATOMIZER_CATEGORY": "雾化器",
        "ATOMIZER_INIT": "初始化雾化器 引脚 %1",
        "ATOMIZER_SETSTATE": "设置雾化器 %1",
        "ATOMIZER_TOGGLE": "切换雾化器状态",
        "ATOMIZER_ON": "开启",
        "ATOMIZER_OFF": "关闭"
});
    Object.assign(Blockly.ScratchMsgs.locales["zh-tw"], {
        "ATOMIZER_CATEGORY": "霧化器",
        "ATOMIZER_INIT": "初始化霧化器 管腳 %1",
        "ATOMIZER_SETSTATE": "設定霧化器 %1",
        "ATOMIZER_TOGGLE": "切換霧化器狀態",
        "ATOMIZER_ON": "開啟",
        "ATOMIZER_OFF": "關閉"
});
    return Blockly;
}

if (typeof module !== 'undefined') {
    module.exports = {getInterfaceTranslations};
}
exports = registerScratchExtensionTranslations;
exports = registerBlocksMessages;
