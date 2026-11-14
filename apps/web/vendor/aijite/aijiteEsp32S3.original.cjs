const OpenBlockArduinoEsp32S3Device = require('../arduinoEsp32S3/arduinoEsp32S3');

/**
 * OpenBlock blocks to interact with AIJITE ESP32-S3.
 * Inherits all ESP32-S3 capabilities and allows disabling selected blocks.
 */
class OpenBlockAijiteEsp32S3Device extends OpenBlockArduinoEsp32S3Device {
    get IO3_PIN_VALUE () {
        return '3';
    }

    isIO3Pin (item) {
        return item && (item.text === 'IO3' || String(item.value) === this.IO3_PIN_VALUE);
    }

    get PINS_MENU () {
        return super.PINS_MENU.filter(item => !this.isIO3Pin(item));
    }

    get ANALOG_PINS_MENU () {
        return super.ANALOG_PINS_MENU.filter(item => !this.isIO3Pin(item));
    }

    get TOUCH_PINS_MENU () {
        return super.TOUCH_PINS_MENU.filter(item => !this.isIO3Pin(item));
    }

    /**
     * @return {string} - the ID of this device.
     */
    get DEVICE_ID () {
        return 'aijiteESP32S3';
    }

    /**
     * Opcodes to disable for AIJITE ESP32-S3.
     * Keep empty by default and append opcodes as needed.
     * @return {Array<string>} block opcode list to disable.
     */
    get DISABLED_OPCODES () {
        return [];
    }

    /**
     * Filter out disabled blocks while keeping category/menu structure.
     * @returns {Array<object>} metadata for this device and its blocks.
     */
    getInfo () {
        const categoryList = super.getInfo().map(category => {
            const nextCategory = Object.assign({}, category);

            if (nextCategory.menus && typeof nextCategory.menus === 'object') {
                const nextMenus = Object.assign({}, nextCategory.menus);
                Object.keys(nextMenus).forEach(menuKey => {
                    const menuDef = nextMenus[menuKey];
                    if (!menuDef || !Array.isArray(menuDef.items)) {
                        return;
                    }
                    nextMenus[menuKey] = Object.assign({}, menuDef, {
                        items: menuDef.items.filter(item => !this.isIO3Pin(item))
                    });
                });
                nextCategory.menus = nextMenus;
            }

            return nextCategory;
        });

        if (!this.DISABLED_OPCODES.length) {
            return categoryList;
        }

        return categoryList.map(category => {
            if (!Array.isArray(category.blocks)) {
                return category;
            }

            return Object.assign({}, category, {
                blocks: category.blocks.filter(block =>
                    block === '---' || !this.DISABLED_OPCODES.includes(block.opcode))
            });
        });
    }
}

module.exports = OpenBlockAijiteEsp32S3Device;
