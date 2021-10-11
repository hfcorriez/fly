const cache = {}

module.exports = (event, ctx) => {
  const { ip } = event
  if (!cache[ip]) cache[ip] = 0
  cache[ip]++

  if (cache[ip] > 1) throw new Error(`api limit: ${ip} (${cache[ip]})`)
  return event
}
