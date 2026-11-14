const raindropSensor = formatMessage => ({
    name: formatMessage({
        id: 'raindropSensor.name',
        default: 'Raindrop Sensor'
    }),
    extensionId: 'raindropSensor',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoMega2560', 'arduinoEsp32', 'arduinoEsp8266', 'arduinoEsp32S3'],
    author: '',
    iconURL: `assets/raindropSensor.png`,
    description: formatMessage({
        id: 'raindropSensor.description',
        default: 'Raindrop detection sensor module with analog and digital outputs.'
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

module.exports = raindropSensor;
