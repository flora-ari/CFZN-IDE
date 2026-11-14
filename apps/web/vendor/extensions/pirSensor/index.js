const pirSensor = formatMessage => ({
    name: formatMessage({
        id: 'pirSensor.name',
        default: 'PIR Sensor'
    }),
    extensionId: 'pirSensor',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoMega2560', 'arduinoEsp32', 'arduinoEsp8266', 'arduinoEsp32S3'],
    author: '',
    iconURL: `assets/pirSensor.png`,
    description: formatMessage({
        id: 'pirSensor.description',
        default: 'PIR human motion detection sensor module.'
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

module.exports = pirSensor;
