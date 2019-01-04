```

    _/_/_/_/  _/    _/      _/
   _/        _/      _/  _/
  _/_/_/    _/        _/
 _/        _/        _/
_/        _/_/_/_/  _/

```

*FLY* is *f*unctional*ly*, A library for develop backend easy.

- **Isolation**: one file to handle service
- **Configurability**: config anything overwrite

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

> `proxy.js`

```javascript
const axios = require('axios')

const Fn = {
  main: async function (event) {
    let res = { status: 200, body: '', headers: {} }

    const ret = await axios({
      method: 'GET',
      url: event.query.url,
      responseType: 'txt'
    })
    res.headers = ret.headers
    res.status = ret.status
    res.body = ret.data
    return res
  },

  configHttp: {
    method: 'GET',
    path: '/proxy'
  }
}

module.exports = Fn
```

### Run in foreground

```bash
fly up -f
```

## Defintions

### Function Defintion

```javascript
{
  name: String,                                 // Name
  main: Function (event, ctx),                  // Main
  validate: Function (event, ctx),              // Validate
  before: Function (event, ctx),                // Before filter
  after: Function (event, ctx),                 // After filter
  catch: Function (event, ctx),                 // Error catch
  config: Object {String: Any},                 // Config object
  links: Object {String: String},               // Links config
  configHttp: Object,                           // HTTP event
  beforeHttp: Function (event, ctx),            // HTTP before filter
  afterHttp: Function (event, ctx),             // HTTP after filter
  validateHttp: Function (event, ctx),          // HTTP validate
  catchHttp: Function (event, ctx),             // HTTP error catch
  configCommand: Object,                        // Command Config
  beforeCommand: Function (event, ctx),         // Command before filter
  afterCommand: Function (event, ctx),          // Command after filter
  validateCommand: Function (event, ctx),       // Command validate
  catchCommand: Function (event, ctx),          // Command error catch
  configStartup: Object || Boolean,             // Startup event
  configShutdown: Object || Boolean,            // Shutdown event
}
```

### Event Defintion

> Event can be anything, but must can be JSONify

### Context Defintion

```javascript
{
  eventId: String,                  // Event ID
  eventType: String,                // Event Type：http, command, null is internal
  originalEvent: Event,             // OriginalEvent
  parentEvent: Event,               // Parent Event
  call: Function,                   // Invoke function
  list: Function,                   // List functions
  get: Function,                    // Get function
}
```

### Command

```bash
Usage:

  fly <command> [--options]

System Commands:

  call <fn>                      Call function
    <fn>                         Function name
    --type string                Set event type
    --data,-d string             Set event data
  help                           Show help
    --all                        Show all commands
  install                        Install deps
    --list                       List packages to install
    --list-all                   List all packages
  list                           List functions
    --type string                List with type
    --all                        List all commands
  new [dir]                      Create new service dir
    [dir]                        Dir name
    --force                      Force create when dir exists
  show <fn>                      Show function info
    <fn>                         Function name
  up [command]                   Manage http service
    [command]                    start | stop/end | reload/hot | restart/again | status/list | log
    --port,-p number             Bind port
    --foreground,-f              Run in foreground
    --api                        Run api mode only
    --instance,-i number         The instance number
    --all,-a                     All applications
```

## Configration

### Internal events config

`http`

```javascript
{
  "method": "String",             # GET, POST, PUT, DELETE, OPTIONS and *
  "path": "String",               # Path start with /
  "domain": "String | Array"      # domain string or list
}
```

`command`

```javascript
{
  "_": "command <subCommand>",
  "args": {
    "--option": String
  },
  "alias": {
    "--option": "-o"
  },
  "descriptions": {
    "--option": "Option desc"
  }
```

### fly.yml

> You can place `fly.yml` in directory to overwrite funciton's config

`fly.yml`

```yaml
# Events config overwrite
events:
  http:
    domain:
      - api.com
      - localhost

# Config overwrite
config:
  db:
    host: localhost
  module@:
    db: 'test:3333'
  url@:
    url: hello

# Link overwrite
links:
  module: module-name
  dir: /dirname
  file: /filename
  url: http://localhost:3333
  git: git@gitlab.com:hfcorriez/test.git
  github: hfcorriez/test.git
```

## API

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
