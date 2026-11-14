import test from 'node:test';
import assert from 'node:assert/strict';
import { assertControllerCompatible, deviceCapabilities, pinMenusMatch } from '../src/extensions/controller-compatibility.ts';
import { aijiteDevice } from '../src/extensions/aijite.ts';

class Esp32Description {
  constructor() { throw new Error('Peripheral constructors must never run in preflight'); }
  get PINS_MENU() { return ['2', '3', '4'].map(value => ({ text: `IO${value}`, value })); }
  get ANALOG_PINS_MENU() { return this.PINS_MENU; }
  get TOUCH_PINS_MENU() { return this.PINS_MENU; }
  getInfo() {
    return [{ id: 'pin', menus: { pins: { items: this.PINS_MENU }, level: { acceptReporters: true, items: ['HIGH', 'LOW'] } },
      blocks: ['---', ...['setDigitalOutput', 'readDigitalPin', 'readAnalogPin'].map(opcode => ({ opcode, arguments: { PIN: { menu: 'pins' } } }))] },
    { id: 'serial', blocks: [{ opcode: 'multiSerialPrint', programMode: ['upload'] }] }];
  }
}
class UnoDescription extends Esp32Description {
  getInfo() { return super.getInfo().filter(category => category.id === 'pin'); }
}
const factories = { esp: () => Esp32Description, aijite: () => aijiteDevice(Esp32Description), uno: () => UnoDescription };
const targets = (opcode: string, pin?: string) => [{ blocks: { _blocks: {
  hat: { opcode: 'event_whenarduinobegin', next: 'block' },
  block: { opcode, parent: 'hat', fields: pin === undefined ? {} : { PIN: { value: pin } } },
} } }];

test('target prototype preflight rejects Aijite IO3 for modules and device blocks without touching the source', () => {
  const target = deviceCapabilities(factories, 'aijite', 'arduino');
  for (const opcode of ['activeBuzzer_init', 'arduino_pin_setDigitalOutput']) {
    const original = targets(opcode, '3');
    const before = JSON.stringify(original);
    assert.throws(() => assertControllerCompatible(original, 'arduino', 'arduino', target, 'Aijite'), /引脚 3/);
    assert.equal(JSON.stringify(original), before);
  }
  assert.doesNotThrow(() => assertControllerCompatible(targets('activeBuzzer_init', '4'), 'arduino', 'arduino', target, 'Aijite'));
});

test('target opcode support is independent of cached Blockly definitions and includes nested/non-editing targets', () => {
  const target = deviceCapabilities(factories, 'uno', 'arduino');
  assert.equal(target.has('arduino_serial_multiSerialPrint'), false);
  assert.throws(() => assertControllerCompatible([{ blocks: { _blocks: {} } }, ...targets('arduino_serial_multiSerialPrint')],
    'arduino', 'arduino', target, 'Uno'), /arduino_serial_multiSerialPrint/);
  assert.doesNotThrow(() => assertControllerCompatible(targets('arduino_pin_setDigitalOutput', '2'), 'arduino', 'arduino', target, 'Uno'));
  assert.doesNotThrow(() => assertControllerCompatible([{ blocks: { _blocks: { level: {
    opcode: 'arduino_pin_menu_level', shadow: true, fields: { level: { value: 'HIGH' } },
  } } } }], 'arduino', 'arduino', target, 'Uno'));
});

test('a new device ID plus old nonempty pin menus is not target toolbox readiness', () => {
  const target = deviceCapabilities(factories, 'aijite', 'arduino');
  const cached = { Device: { getPinOptions: () => [['IO2', '2'], ['IO3', '3'], ['IO4', '4']] } };
  assert.equal(pinMenusMatch(cached, target), false);
  const ready = { Device: { getPinOptions: () => [['IO2', '2'], ['IO4', '4']] } };
  assert.equal(pinMenusMatch(ready, target), true);
});
