const flameSensor = formatMessage => ({
    name: formatMessage({
        id: 'flameSensor.name',
        default: 'Flame Sensor'
    }),
    extensionId: 'flameSensor',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoMega2560', 'arduinoEsp32', 'arduinoEsp8266', 'arduinoEsp32S3'],
    author: '',
    iconURL: `assets/flameSensor.png`,
    description: formatMessage({
        id: 'flameSensor.description',
        default: 'Flame detection sensor module with analog and digital outputs.'
    }),
    featured: true,
    blocks: 'blocks.js',
    generator: 'generator.js',
    toolbox: 'toolbox.js',
    translations: 'translations.js',
    official: true,
    tags: ["sensor"],
    helpLink: ''
});

module.exports = flameSensor;
