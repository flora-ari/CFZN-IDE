/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_PIRSENSOR_CATEGORY}" id="PIRSENSOR_CATEGORY" colour="#9F0050" secondaryColour="#820041">
    <block type="pirSensor_init" id="pirSensor_init"><field name="PIN">2</field></block>
    <block type="pirSensor_detected" id="pirSensor_detected"></block>
</category>`;
}

exports = registerToolboxs;
