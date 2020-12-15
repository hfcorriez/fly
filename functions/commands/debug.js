const colors = require('colors/safe')
const ipc = require('node-ipc')
const PM = require('../../lib/pm')
const utils = require('../../lib/utils')

ipc.config.id = 'fly-debugger'
ipc.config.retry = 1500
ipc.config.logger = _ => {}

module.exports = {
  async main (event, { fly }) {
    const { service } = event.params
    const { filter } = event.args

    if (!service) throw new Error('service must be specified')

    const pm = new PM({
      name: `fly:${fly.project.name}`,
      path: process.argv[1]
    })

    ipc.serve(_ => {
      ipc.server.on('message', (data, socket) => {
        const { id, type, log, service } = data || {}
        switch (type) {
          case 'log':
            const line = log.join(' ')
            if (!filter || line.includes(filter)) {
              console.info(colors.gray(`${id} |`), line)
            }
            break
          case 'service':
            console.info(colors.gray(`${id} |`), 'connected', JSON.stringify(service))
            break
        }
      })

      ipc.server.on('socket.disconnected', (socket, destroyedSocketID) => {
        console.log('client ' + destroyedSocketID + ' has disconnected!')
      })
    })

    ipc.server.start()

    const list = await pm.list(service)
    for (let item of list) {
      process.kill(item.pid, 'SIGUSR2')
    }

    return { wait: true }
  },
  catch (error) {
    console.log(colors.red(`DEBUG ERROR`))
    console.log(utils.padding('MESSAGE:'.padStart(9)), colors.bold(error.message))
    console.log(utils.padding('STACK:'.padStart(9)), colors.bold(error.stack))
  },

  configCommand: {
    _: `debug <service>`,
    args: {
      '--filter': String
    },
    alias: {
      '--filter': '-f'
    },
    descriptions: {
      _: 'Debug online server',
      '<service>': 'Service type'
    }
  }
}
