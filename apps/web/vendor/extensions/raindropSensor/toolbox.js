/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_RAINDROPSENSOR_CATEGORY}" id="RAINDROPSENSOR_CATEGORY" colour="#9F0050" secondaryColour="#820041">
    <block type="raindropSensor_readDigital" id="raindropSensor_readDigital"><field name="PIN">2</field></block>
    <block type="raindropSensor_readAnalog" id="raindropSensor_readAnalog"><field name="PIN">A0</field></block>
</category>`;
}

exports = registerToolboxs;
