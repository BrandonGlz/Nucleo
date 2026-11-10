// Completa app.json: si existe google-services.json (proyecto de Firebase de Núcleo), el APK lo
// incluye para recibir notificaciones push en Android. Sin él la app funciona igual y avisa de las
// alertas con el canal en vivo mientras está abierta. El archivo no va a git.
const { existsSync } = require('fs')
const { join } = require('path')

module.exports = ({ config }) =>
  existsSync(join(__dirname, 'google-services.json'))
    ? { ...config, android: { ...config.android, googleServicesFile: './google-services.json' } }
    : config
