/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    Blockly.Arduino.pirSensor_init = function (block) {
        const pin = block.getFieldValue('PIN');
        Blockly.Arduino.definitions_.pirSensor_pin = `int pirSensorPin = ${pin};`;
        Blockly.Arduino.setups_.pirSensor_input = `pinMode(pirSensorPin, INPUT);`;
        return '';
    };
    Blockly.Arduino.pirSensor_detected = function () {
        return [`digitalRead(pirSensorPin) == HIGH`, Blockly.Arduino.ORDER_ATOMIC];
    };
    return Blockly;
}

exports = registerGenerators;
