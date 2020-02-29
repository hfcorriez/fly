const path = require('path')
const childProcess = require('child_process')

module.exports = {
  main ({ name, event = {}, timeout }, { get, info, eventType, eventId }) {
    const fn = get(name)
    const command = [
      path.join(__dirname, '../../../bin/fly.js'),
      'call',
      fn.file,
      '-d',
      JSON.stringify(event),
      '-c',
      JSON.stringify({ eventId, eventType }),
      ...timeout ? ['--timeout', timeout] : []
    ]
    info('fork command', command.join(' '))
    const subprocess = childProcess.spawn(process.argv[0], command, {
      env: process.env,
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    })
    subprocess.unref()
    return true
  }
}
