const activateBuzzer = formatMessage => ({
    name: formatMessage({
        id: 'activateBuzzer.name',
        default: '有源蜂鸣器'
    }),
    extensionId: 'activateBuzzer',
    version: '1.0.0',
    supportDevice: ["arduinoEsp32S3","arduinoUno"],
    author: 'aijite',
    iconURL: `assets/activateBuzzer.png`,
    description: formatMessage({
        id: 'activateBuzzer.description',
        default: '用于打开或者关闭有源蜂鸣器'
    }),
    featured: true,
    blocks: 'blocks.js',
    generator: 'generator.js',
    toolbox: 'toolbox.js',
    translations: 'translations.js',
    library: 'lib',
    official: true,
    tags: ["actuator"],
    helpLink: ''
});

module.exports = activateBuzzer;
