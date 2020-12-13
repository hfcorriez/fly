module.exports = (event, ctx) => {
  const { fly, service: serviceConfig } = ctx
  const { args, service } = event

  if (!serviceConfig) {
    throw new Error('service not config in fly.yml')
  }

  if (!serviceConfig[service]) {
    throw new Error(`service "${service}" not found in fly.yml`)
  }

  const config = { ...serviceConfig[service], service, ...args }
  if (!config.fn) {
    throw new Error(`service "${service}" need "fn" to run`)
  }

  const fn = fly.get(config.fn)
  if (!fn) {
    throw new Error(`function "${config.fn}" not found in "${service}"`)
  }

  return { fn, config }
}
