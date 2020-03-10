const path = require('path')
const childProcess = require('child_process')

module.exports = {
  main ({ name, event = {}, timeout, stdio = false }, { fly, eventType, eventId }) {
    const fn = fly.get(name)
    if (!fn) throw new Error(`fork ${name} not found`)
    const command = [
      path.join(__dirname, '../../../bin/fly.js'),
      'call',
      fn.file,
      '-d',
      JSON.stringify(event),
      '-c',
      JSON.stringify({ eventId, eventType }),
      ...timeout ? ['--timeout', timeout] : [],
      process.argv.find(arg => ['-v', '-vv'].includes(arg))
    ]
    fly.info('fork command', command.join(' '))
    const subprocess = childProcess.spawn(process.argv[0], command, {
      env: process.env,
      cwd: process.cwd(),
      detached: true,
      stdio: stdio ? 'inherit' : 'ignore'
    })
    subprocess.unref()
    return true
  }
}
