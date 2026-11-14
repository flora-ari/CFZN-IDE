/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerGenerators (Blockly) {
    if (!Blockly || !Blockly.Arduino) return Blockly;

    Blockly.Arduino.activeBuzzer_on = function (block) {
        return `digitalWrite(activeBuzzerPin, HIGH);\n`;
    };

    Blockly.Arduino.activeBuzzer_off = function () { return `digitalWrite(activeBuzzerPin, LOW);
    `; };

    Blockly.Arduino.activeBuzzer_init = function (block) {
        const pin = block.getFieldValue('PIN');
        Blockly.Arduino.definitions_.activeBuzzer_pin = `int activeBuzzerPin = ${pin};`;
        Blockly.Arduino.setups_.activeBuzzer_pinMode = `pinMode(activeBuzzerPin, OUTPUT);`;
        return '';
    };

    return Blockly;
}

exports = registerGenerators;
