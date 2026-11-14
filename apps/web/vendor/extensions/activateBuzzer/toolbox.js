/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_ACTIVATEBUZZER_CATEGORY}" id="ACTIVATEBUZZER_CATEGORY" colour="rgb(185,67,255)" secondaryColour="#FFFFFF">
    <block type="activeBuzzer_on" id="activeBuzzer_on"></block>
    <block type="activeBuzzer_off" id="activeBuzzer_off"></block>
    <block type="activeBuzzer_init" id="activeBuzzer_init">
    <field name="PIN"></field>
    </block>
</category>`;
}

exports = registerToolboxs;
