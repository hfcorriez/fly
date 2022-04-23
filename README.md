![fly-banner](https://user-images.githubusercontent.com/119550/74084844-019c3200-4aae-11ea-963a-4c2a13461809.png)

`FLY`, a serverless framwork for back-end development.

- **Functional**: Everything is function
- **Lightweight**: Write service in one file
- **Yielding**: Very flexible
## Features

- **Hot Reload**: Develop back-end with hot-reload
- **Simple Inject**: Call functions without path. Inject function, module and files
- **Live Debug**: Live debug withot restart tto solve problem quickly

## Installation

> Require `node >= 8`

```bash
## Yarn
$ yarn add fly
```

## Quick start

### Example

`login.js`

```javascript
module.exports = {
  // Config as http function
  configHttp: {
    method: 'post',
    path: '/api/login'
  },

  /**
   * Main logic
   */
  async main ({ body }, { db, config, fly }) {
    fly.info(`user login: ${body.user}`)

    // login logic here
    const user = await db.query('login query')

    return {
      status: 200,
      body: user
    }
  }
}
```

### Run with fly

*Run with HTTP service*

```bash
$ fly run http↙

┌────────┬────────────────┬────────┐
│ Method │ Path           │ Fn     │
│ GET    │ /              │ index  │
└────────┴────────────────┴────────┘
[SERVICE] Http Server
   NAME:  project
   TYPE:  http
ADDRESS:  http://127.0.0.1:5000
    PID:  55195
    ENV:  development
```

*Direct call in CLI*

```bash
$ fly call login -d 'user=xx&pass=xx'
```


## Definitions

### Function

**Function Definition**

```yaml
extends: String                             # Extends from function
decorator: String                           # Decorate with other function
main: Function                              # Main call -> (event, ctx)
props:                                      # Props validate definitions
validate: Function                          # Validate
config<Event>: Object | Boolean | Function  # Startup event
before<Event>: Function | String | Array    # Before filter
after<Event>: Function | String | Array     # After filter
validate<Event>: Function                   # Validate event
catch<Event>: Function | String | Array     # Error catch
props<Event>: Object                        # Props definitions for event
```

### Context

```yaml
eventId: String                       # Event ID
eventType: String                     # Event Type：http, command, null is internal
originalEvent: Event                  # OriginalEvent
parentEvent: Event                    # Parent Event
fly:
  call: Function                      # Call function
  find: Function                      # List functions
  get: Function                       # Get function
  info: Function                      # Log info
  warn: Function                      # Log warn
  error: Function                     # log error
@module:                              # Moudle inject, support @package, @lib/abc (project), @config/abc.conf as file
<function>: Function                  # The fly function you want import
```

### Validate

Define validate `props` to validate event, throw `FlyValidateError` if validate failed.

**Define**

> Define properties in `props`

```yaml
type: String,                       # Support:
  # tech: email, phone, date, ip, phonenumber, port, url, macaddress, hexcolor, locale, fqdn, mimetype, jwt
  # types: int, string, array, object, float, json, hex, ascii
  # encode: md5, sha1, sha256, sha512, base32, base64, uppercase, lowercase, hash
  # string: alpha, alphanumeric
  # other: enum
pre: Function                       # Pre process value
empty: Boolean                      # Default is true, Allow empty for string, array, object
lowercase: Boolean                  # Allow lowercase for string
uppercase: Boolean                  # Allow uppercase for string
trim: Boolean                       # Trim text to validate
enum: Array[String]                 # Enum options
format: String | Array | Function
  # For date: date, datetime, seconds, millseconds, iso, custom format [YY-MM-DD]
  # For number: int, float
  # For string: uppercase, lowercase, trim
default: String                     # Default value if not exists
message: String                     # Message will throw as FlyValidateError(message),
props: Object                       # Nested props Definitions
```

**FlyValidateError**

```javascript
{
  name: "FlyValidateError",
  message: "validate failed: filed1, filed2",
  errors: [
    {
      name: "filed1",
      type: "string",
      message: "filed1 validate error"
    }
  ]
}
```
## Command Usage

```bash
❏ FLY 4.3.0
Usage:

  fly <command> [--options]

Commands:

  help                           Show help
  call <fn>                      Call function
    <fn>                         Function name to call
    --type string                Set event type: such as http
    --data,-d string             Event data, support JSON and URL-QUERY-ENCODED
    --timeout,-t number          Execution timeout
    --error,-e                   Show full error
  debug <service>                Debug online server
    <service>                    Service type
    --filter,-f string
  get <fn>                       Get function info
    <fn>                         Function name
  list [type]                    List functions
  log [service]                  Show service log
  new [dir]                      Create new fly project
    [dir]                        Dir name
    --force                      Force create when dir exists
    --source,-s string           Select source to create. support: http (default), project
  run [service]                  Run service in foregroud
    --instance,-i number         The instance number
    --bind,-b string             Bind address
    --port,-p number             Bind port
  start [service]                Start service as daemon
  status [service]               Show service status
  stop [service]                 Stop service
  reload [service]               Reload service
  restart [service]              Restart service
  test [fn]                      Test functions
    <fn>                         Function name
    --timeout number
```

> Event can be anything, but must can be JSONify

## Events

### HTTP

**Http Event**

```yaml
method: String                # request http method, lowercase
path: String                  # request http path
origin: String                # request http origin
host: String                  # request http host
domain: String                # request domain
url: String                   # request full url
protocol: String              # request protocol
port: Number                  # request port
ip: String                    # request ip
headers: Object               # request headers
body: Object                  # request body
files: Object                 # request files
query: Object                 # request query
search: String                # request search string without ?
cookies: Object               # request cookies
```

**Http Config**

```yaml
method: String                    # Set method, eg: get, post, put, delete
path: String                      # Set path, eg: /api
domain: String | Array            # Set domain you want supply service
cache: Boolean | Number           # Set page cache header, `true` is 600 seconds
cors: Boolean | String            # Set http CORS header, `true` is for all origin, String set origin, object set params
  origin: String
  headers: String
  methods: String
upload:
  allowTypes: Array               # mimetypes, eg: ['png', 'image/jpeg']
  maxSize: Number                 # maxSize, default is 100mb
```

### Command

**Command Event**

```yaml
args: Object                      # command args, eg: "--help"
params: Object                    # command params, eg: "call <param>", param will pass as params.param
```

**Command Config**

```yaml
_: String                         # command declare, eg: "call <param>"
args: Object                      # command args declares: `"--help": Boolean`
alias: Object                     # command alias declares, eg: `"--help": '-h'`
descriptions: Object              # command descriptions
  _: String                       # command description
  <param>: String                 # param description
  <args>: String                  # arg description
```

**Command Example**

```javascript
module.exports = {
  main () {
    const command = event.params.command
    const showFull = event.args.full

    // Your logic here
  },

  configCommand: {
    _: 'help <command>',
    args: {
      '--full': Boolean
    },
    alias: {
      '--full': '-f'
    },
    descriptions: {
      _: 'Show help for commands',
      '<help>': 'Command name'
      '--full': 'Show full descriptions'
    }
  }
}
```

### Cron

**Cron Event**

```yaml
time: timestamp
```

**Cron Config**

```yaml
time: '* * * * *'   # See format defintion https://en.wikipedia.org/wiki/Cron
timeout: 60         # Maximum time limit
```

**Cron Example**

```javascript
module.exports = {
  main() {
    // tick on every 30min
  },

  configCron: {
    time: '*/30 * * * *'
  }
}
```

### Error

**Error handle Example**

> Example to handle error with `Sentry`

```javascript
const Sentry = require('@sentry/node')

Sentry.init({
  dsn: 'http://appkey@sentry.io'
})

module.exports = {
  configError: true,

  main (event) {
    const err = event
    if (err instanceof Error) {
      Sentry.captureException(err)
    } else if (typeof err !== 'undefined') {
      Sentry.captureMessage(util.inspect(err, { depth: null, breakLength: Infinity }))
    }
  }
}
```

### Startup

> Connect db When app startup

```javascript
module.exports = {
  configStartup: true,

  async main (){
    ctx.db = await DB.connect()
    console.log('db connected')
  }
}
```

### Shutdown

> Delete tmp files when shutdown

```javascript
module.exports = {
  configShutdown: true,

  main () {
    return deleteTempFiles()
  }
}
```

## fly.yml

> Optional. You can place `fly.yml` in directory to overwrite funciton's config

`fly.yml`
```yaml
project:
  ignore:
    - "example/**"

# config overwrite for service function
service:
  http:
    port: 6000
    name: 'My http server'

# config overwrite for http function
http:
  login:
    method: post
    path: /api/login
    cors: true
```

## Test

> You can write `<name>.test.js` in same folder then run `fly test` it will test automatically

### Setup a test

**index.test.js**

> `index`.test.js file name is same like `index.js` or `index.file.js`, keep them in same folder

```javascript
const assert = require('assert')

module.exports = {
  tests: [{
    name: 'Check result code',
    event: {},
    test (result) {
      assert.strictEqual(result.code, 0)
    }
  }]
}
```

**Execute test**

```shell
$ fly test
◼︎ 2 functions to test

√ [1] +index 1/1 passed
    √ 1) Check code === 0 (2ms)
√ [2] +userLogin 2/2 passed
    √ 1) status === 1 (1ms)
    √ 2) invalid username trigger validate error (1ms)

√ 2/2 functions passed
```

## API

> You can use in Nodejs and call fly function directly

### Usage

```javascript
const Fly = require('node-fly')
const fly = new Fly('/dir')
await fly.call('test', {host: 'api.com'})
```

## LICENSE

Copyright (c) 2019 hfcorriez <hfcorriez@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
