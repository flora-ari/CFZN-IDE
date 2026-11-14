const atomizer = formatMessage => ({
    name: formatMessage({
        id: 'atomizer.name',
        default: 'Atomizer'
    }),
    extensionId: 'atomizer',
    version: '1.0.0',
    supportDevice: ['arduinoUno', 'arduinoNano', 'arduinoLeonardo', 'arduinoMega2560', 'arduinoEsp32', 'arduinoEsp8266', 'arduinoEsp32S3'],
    author: '',
    iconURL: `assets/atomizer.png`,
    description: formatMessage({
        id: 'atomizer.description',
        default: 'Atomizer module on/off control.'
    }),
    featured: true,
    blocks: 'blocks.js',
    generator: 'generator.js',
    toolbox: 'toolbox.js',
    translations: 'translations.js',
    official: true,
    tags: ["output"],
    helpLink: ''
});

module.exports = atomizer;
