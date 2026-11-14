/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_FLAMESENSOR_CATEGORY}" id="FLAMESENSOR_CATEGORY" colour="#9F0050" secondaryColour="#820041">
    <block type="flameSensor_readDigital" id="flameSensor_readDigital"><field name="PIN">2</field></block>
    <block type="flameSensor_readAnalog" id="flameSensor_readAnalog"><field name="PIN">A0</field></block>
</category>`;
}

exports = registerToolboxs;
