module.exports = (event, ctx) => {
  const { fly, service: services } = ctx
  const { args, service } = event

  if (!services[service]) {
    throw new Error(`service "${service}" not found in fly.yml`)
  }

  const config = { ...services[service], service, ...args}
  if (!config.fn) {
    throw new Error(`service "${service}" need "fn" to run`)
  }

  const fn = fly.get(config.fn)
  if (!fn) {
    throw new Error(`function "${config.fn}" not found in "${service}"`)
  }

  return {fn, config}
}