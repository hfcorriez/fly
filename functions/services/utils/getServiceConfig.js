const DEFAULT_SERVICES = {
  http: { fn: '$http' },
  cron: { fn: '$cron', singleton: true },
}

module.exports = ({ args, service }, { fly }) => {
  const services = { ...DEFAULT_SERVICES, ...fly.service }

  if (!services[service]) {
    throw new Error(`service "${service}" not found in fly.yml`)
  }

  const config = { ...services[service], service, ...args }
  if (!config.fn) {
    throw new Error(`service "${service}" need "fn" to run`)
  }

  const fn = fly.get(config.fn)
  if (!fn) {
    throw new Error(`function "${config.fn}" not found in "${service}"`)
  }

  return { fn, config: { ...fn.configService, ...config } }
}
