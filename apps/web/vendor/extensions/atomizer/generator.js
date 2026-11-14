/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    Blockly.Arduino.atomizer_init = function (block) {
        const pin = block.getFieldValue('PIN');
        Blockly.Arduino.definitions_.atomizer_pin = `int atomizerPin = ${pin};`;
        Blockly.Arduino.definitions_.atomizer_state = `bool atomizerState = false;`;
        Blockly.Arduino.setups_.atomizer_pinMode = `pinMode(atomizerPin, OUTPUT);`;
        Blockly.Arduino.setups_.atomizer_off = `digitalWrite(atomizerPin, LOW);`;
        return '';
    };
    Blockly.Arduino.atomizer_setState = function (block) {
        const state = block.getFieldValue('STATE');
        return `atomizerState = ${state} == HIGH;
digitalWrite(atomizerPin, ${state});
`;
    };
    Blockly.Arduino.atomizer_toggle = function () {
        return `atomizerState = !atomizerState;
digitalWrite(atomizerPin, atomizerState ? HIGH : LOW);
`;
    };
    return Blockly;
}

exports = registerGenerators;
