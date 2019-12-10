```

    _  _  _  _  _  _        _           _
   (_)(_)(_)(_)(_)(_)      (_)_       _(_)
   (_)            (_)        (_)_   _(_)
   (_) _  _       (_)          (_)_(_)
   (_)(_)(_)      (_)            (_)
   (_)            (_)            (_)
   (_)            (_) _  _  _  _ (_)
   (_)            (_)(_)(_)(_)(_)(_)

```

`FLY` is A library for develop backend easy.

- **Functional**:  Everything is function
- **Lightweight**: One file can be served
- **Yare**: Very flexible

## Installation

> Require `node >= 8`

```bash
## Yarn
$ yarn global add fly

## NPM
$ npm install -g fly
```

## Example

### Write function

> `hello.js`

```javascript
module.exports = {
  main () {
    return {
      code: 0,
      message: 'hello world'
    }
  },

  configHttp: {
    method: 'GET',
    path: '/hello'
  }
}
```

### Run

```bash
$ fly http -r ↙

┌────────┬────────────────┬────────┐
│ Method │ Path           │ Fn     │
│ GET    │ /hello         │ hello  │
└────────┴────────────────┴────────┘
SERVER READY
  NAME:      HTTP
  ADDRESS:   http://127.0.0.1:5000
  PID:       20815
  WORK DIR:  /Users/YourName/Code/fly-example
  HOT RELOAD: true
```

## Definitions

### Function

**Function Definition**

```yaml
extends: String                         # Extends from function, start with @ indicate the parent fly
retry: Number|Boolean                   # Retry count, true is 3
main: Function                          # Main call -> (event, ctx)
props:                                  # Props validate definitions
validate: Function                      # Validate
before: Function                        # Before filter
after: Function                         # After filter
catch: Function                         # Error catch
config<Event>: Object|Boolean|Function  # Startup event
before<Event>: Function                 # Before filter
after<Event>: Function                  # After filter
validate<Event>: Function               # Validate event
catch<Event>: Function                  # Error catch
props<Event>: Object                    # Props definetions for event
  # same as props, but only for given event
```

**Example**

**createUser.js**

> Create user with info

```javascript
{
  /**
   * Define event types
   */
  props: {
    id: Number,
    email: {
      type: 'email',
      lowercase: true,
      message: 'Email invalid'
    },
    name: {
      type: String,
      default: 'User'
    },
    avatar: {
      type: String,
      default: 'User'
    },
    bornDate: {
      type: Date,
      format: 'value'
    },
    info: {
      type: 'Object',
      props: {
        title: String,
      }
    }
  },

  // Extends from appbase for initial functions
  extends: 'authHttpUser',

  /**
   * Main function
   */
  main(event) {
    const db = this.db()
    db.collections('user').insertOne(event)
  },

  /**
   * Config before http
   */
  beforeHttp(event) {
    # Transform query or body to main
    return event.query || event.body
  },

  /**
   * Config after http
   */
  afterHttp(event) {
    return {
      code: 0,
      data: event
    }
  },

  /**
   * Config before command
   */
  beforeCommand(event) {
    return event.args
  },

  /**
   * Config after command
   */
  afterCommand(event) {
    Object.keys(event).forEach(name => console.log(`${name}: ${event[name]}`))
  },

  /**
   * Config http event
   */
  configHttp: {
    method: 'post',
    path: '/api/createUser'
  },

  /**
   * Config command event
   */
  configCommand: {
    _: 'create',
    args: {
      '--name': String,
      '--email': String,
      '--id': Number
    }
  }
}
```

### Context Definition

```yaml
eventId: String                       # Event ID
eventType: String                     # Event Type：http, command, null is internal
originalEvent: Event                  # OriginalEvent
parentEvent: Event                    # Parent Event

call: Function                        # Invoke function
list: Function                        # List functions
get: Function                         # Get function
error: Function                       # Trigger error internal
<fn>: Function                        # The functions imported

trace: Object                         # Current trace
```

### Validate

Define validate `props` to validate event, throw `FlyValidateError` if validate failed.

**Define**

> Define properties in `props`

```yaml
type: String,                       # Support: email, date, alpha, alphanumeric, base64, base32, enum, float, number, ip, json, md5, phonenumber, port, url, uppercase, lowercase, macaddress, hexcolor, locale, hex, hash, fadn, ascii, validator

# Pre transform options
pretrim: Boolean                    # Pre trim
before: Function                    # Before filter

validate: Function                  # Custom validator with (input, definition)

# String options
lowercase: Boolean                  # Auto convert lowercase, default is false
uppercase: Boolean                  # Auto convert uppercase, default is false
trim: Boolean                       # Trim

# Hash options
algorithm: String                   # Support: md5, sha1, sha256, sha512

# Pattern options
enum: Array[String]                 # Enum options

# Date options
format: String                      # Support: date, datetime, unix, value, ios, [YY-MM-DD]

# After transform options
after: Function                     # After transform options

# Global options
default: String                     # Default value if not exists
message: String                     # Message will throw as FlyValidateError(message),

# Nested options
props: Object                       # Nested props definetions
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

### Command Usage

```bash
Usage:

  fly <command> [--options]

System Commands:

  api [command]                  API service
    [command]                    start | stop | reload | restart | status | log
    --port,-p number             Bind port
    --instance,-i number         The instance number
    --all,-a                     All applications
    --bind,-b string
  call <fn>                      Call function
    <fn>                         Function name
    --type string                Set event type
    --data,-d string             Set event data
    --timeout, -t                Set timeout
  show <fn>                      Show function info
    <fn>                         Function name
  help                           Show help
    --system,-s                  Show system commands
  http [command]                 HTTP service
    [command]                    start | stop | reload | restart | status | log
    --port,-p number             Bind port
    --instance,-i number         The instance number
    --all,-a                     All applications
    --bind,-b string
    --hotreload,-r               Run with hot reload mode
  install                        Install deps
    --list,-l                    List packages to install
  list                           List functions
    --type string                List with type
    --all                        List all commands
  new [dir]                      Create new service dir
    [dir]                        Dir name
    --force                      Force create when dir exists
  serve [command]                Serve service
    [command]                    start | stop | reload | restart | status | log
    --port,-p number             Bind port
    --instance,-i number         The instance number
    --all,-a                     All applications
    --bind,-b string

Global options:

    --id,-i string               Set event id
    --verbose,-V                 Show verbose
```

## Events

> Event can be anything, but must can be JSONify

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

    # logic
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
files:
  - "**/*.fly.js"

# Function config overwrite
+login:
  events:
    http:
      method: post
      path: /api/login
```

## Test

> You can write `<name>.test.js` in same folder then run `fly test` it will test automatically

### Setup a test

**index.test.js**

> `index`.test.js file name is same like `index.js` or `index.file.js`, keep them in same folder

```javascript
const assert = require('assert')

module.exports = {
  tests: [
    {
      name: 'Check result code',
      event: {},
      check (result) {
        assert.strictEqual(result.code, 0)
      }
    }
  ]
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
