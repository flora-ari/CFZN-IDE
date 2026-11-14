/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    Blockly.Arduino.raindropSensor_readDigital = function (block) {
        const pin = block.getFieldValue('PIN');
        return [`digitalRead(${pin}) == LOW`, Blockly.Arduino.ORDER_ATOMIC];
    };
    Blockly.Arduino.raindropSensor_readAnalog = function (block) {
        const pin = block.getFieldValue('PIN');
        return [`analogRead(${pin})`, Blockly.Arduino.ORDER_ATOMIC];
    };
    return Blockly;
}

exports = registerGenerators;
