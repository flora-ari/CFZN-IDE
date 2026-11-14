/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const color = '#9F0050';
    const secondaryColour = '#820041';
    const inputPins = Blockly.Device.getPinOptions('arduino_pin_readDigitalPin');

    Blockly.Blocks.pirSensor_init = {init: function () { this.jsonInit({message0: Blockly.Msg.PIRSENSOR_INIT,args0: [{type: 'field_dropdown',name: 'PIN',options: inputPins}],colour: color,secondaryColour: secondaryColour,extensions: ['shape_statement']}); }};
    Blockly.Blocks.pirSensor_detected = {init: function () { this.jsonInit({message0: Blockly.Msg.PIRSENSOR_DETECTED,colour: color,secondaryColour: secondaryColour,extensions: ['output_boolean']}); }};
    return Blockly;
}

exports = registerBlocks;
