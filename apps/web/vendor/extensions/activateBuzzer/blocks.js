/* eslint-disable func-style */
/* eslint-disable max-len */
/* eslint-disable require-jsdoc */
function registerBlocks (Blockly) {
    const colour = 'rgb(185,67,255)';
    const secondaryColour = '#FFFFFF';

    const deviceDropdown_arduino_pin_setDigitalOutput = Blockly.Device.getPinOptions('arduino_pin_setDigitalOutput');

    Blockly.Blocks.activeBuzzer_on = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.ACTIVATEBUZZER_ACTIVEBUZZER_ON,
                colour: colour,
                secondaryColour: secondaryColour,
                extensions: ["shape_statement"]
            });
        }
    };

    Blockly.Blocks.activeBuzzer_off = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.ACTIVATEBUZZER_ACTIVEBUZZER_OFF,
                colour: colour,
                secondaryColour: secondaryColour,
                extensions: ["shape_statement"]
            });
        }
    };

    Blockly.Blocks.activeBuzzer_init = {
        init: function () {
            this.jsonInit({
                message0: Blockly.Msg.ACTIVATEBUZZER_ACTIVEBUZZER_INIT,
                args0: [
{
                    type: 'field_dropdown',
                    name: 'PIN',
                    options: deviceDropdown_arduino_pin_setDigitalOutput
                }
                ],
                colour: colour,
                secondaryColour: secondaryColour,
                extensions: ["shape_statement"]
            });
        }
    };

    return Blockly;
}

exports = registerBlocks;
