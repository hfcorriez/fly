const FlyContext = require('../lib/context')
const context = new FlyContext({ key: 'value' }).toContext()

console.log(context.eventId)
