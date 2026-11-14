/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const color = '#00C2A8';
    const secondaryColour = '#00A38D';
    const digitalPins = Blockly.Device.getPinOptions('arduino_pin_setDigitalOutput');

    Blockly.Blocks.atomizer_init = {init: function () { this.jsonInit({message0: Blockly.Msg.ATOMIZER_INIT,args0: [{type: 'field_dropdown',name: 'PIN',options: digitalPins}],colour: color,secondaryColour: secondaryColour,extensions: ['shape_statement']}); }};
    Blockly.Blocks.atomizer_setState = {init: function () { this.jsonInit({message0: Blockly.Msg.ATOMIZER_SETSTATE,args0: [{type: 'field_dropdown',name: 'STATE',options: [[Blockly.Msg.ATOMIZER_ON, 'HIGH'], [Blockly.Msg.ATOMIZER_OFF, 'LOW']]}],colour: color,secondaryColour: secondaryColour,extensions: ['shape_statement']}); }};
    Blockly.Blocks.atomizer_toggle = {init: function () { this.jsonInit({message0: Blockly.Msg.ATOMIZER_TOGGLE,colour: color,secondaryColour: secondaryColour,extensions: ['shape_statement']}); }};
    return Blockly;
}

exports = registerBlocks;
