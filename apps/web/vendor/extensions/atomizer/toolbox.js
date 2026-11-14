/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerToolboxs () {
    return `
<category name="%{BKY_ATOMIZER_CATEGORY}" id="ATOMIZER_CATEGORY" colour="#00C2A8" secondaryColour="#00A38D">
    <block type="atomizer_init" id="atomizer_init"><field name="PIN">7</field></block>
    <block type="atomizer_setState" id="atomizer_setState"><field name="STATE">HIGH</field></block>
    <block type="atomizer_toggle" id="atomizer_toggle"></block>
</category>`;
}

exports = registerToolboxs;
