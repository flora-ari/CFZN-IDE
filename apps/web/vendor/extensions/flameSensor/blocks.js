/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const color = '#9F0050';
    const secondaryColour = '#820041';
    const inputPins = Blockly.Device.getPinOptions('arduino_pin_readDigitalPin');
    const analogPins = Blockly.Device.getPinOptions('arduino_pin_readAnalogPin');

    Blockly.Blocks.flameSensor_readDigital = {init: function () { this.jsonInit({message0: Blockly.Msg.FLAMESENSOR_READDIGITAL,args0: [{type: 'field_dropdown',name: 'PIN',options: inputPins}],colour: color,secondaryColour: secondaryColour,extensions: ['output_boolean']}); }};
    Blockly.Blocks.flameSensor_readAnalog = {init: function () { this.jsonInit({message0: Blockly.Msg.FLAMESENSOR_READANALOG,args0: [{type: 'field_dropdown',name: 'PIN',options: analogPins}],colour: color,secondaryColour: secondaryColour,extensions: ['output_number']}); }};
    return Blockly;
}

exports = registerBlocks;
