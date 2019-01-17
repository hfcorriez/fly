```

    _/_/_/_/  _/    _/      _/
   _/        _/      _/  _/
  _/_/_/    _/        _/
 _/        _/        _/
_/        _/_/_/_/  _/

```

__FLY__ is `f`unctional`ly`, A library for develop backend easy.

- **Isolation**: one file, one function, one service
- **Configurability**: config anything with overwrite
- **Modularization**: One dir, one module

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

### Run

```bash
fly http
```

## Defintions

### Function Defintion

```javascript
{
  name: String,                                 // Name
  extends: String,                              // Extends from function, support file, package
  functions: Object {String: String}            // Inject function to context
  config: Object {String: Any},                 // Config object
  links: Object {String: String},               // Links config
  main: Function (event, ctx),                  // Main
  validate: Function (event, ctx),              // Validate
  before: Function (event, ctx),                // Before filter
  after: Function (event, ctx),                 // After filter
  catch: Function (event, ctx),                 // Error catch
  config<Event>: Object || Boolean || Function, // Startup event
  before<Event>: Function (event, ctx),         // Before filter
  after<Event>: Function (event, ctx),          // After filter
  validate<Event>: Function (event, ctx),       // Validate event
  catch<Event>: Function (event, ctx),          // Error catch
}
```

### Event Defintion

> Event can be anything, but must can be JSONify

#### HTTP

**Input Event**

```yaml
method: String
path: String
origin: String
host: String
domain: String
url: String
protocol: String
port: Number
ip: String
headers: Object
body: Object
query: Object
search: String
cookies: Object
```

**Config Event**

```yaml
method: String
path: String
domain: String | Array
cors: Boolean
```

#### Command

**Input Event**

```yaml
args: Object
params: Object
```

**Config Event**

```yaml
_: String
alias: Object
descriptions: Object
```

### Context Defintion

```javascript
{
  // Event
  eventId: String,                      // Event ID
  eventType: String,                    // Event Type：http, command, null is internal
  originalEvent: Event,                 // OriginalEvent
  parentEvent: Event,                   // Parent Event

  // Core
  call: Function,                       // Invoke function
  list: Function,                       // List functions
  get: Function,                        // Get function

  // Function info
  name: String,                         // Name
  extends: String,                      // Extends from function, support file, package
  imports: Object {String: String}      // Inject function to context
  config: Object {String: Any},         // Config object
  links: Object {String: String},       // Links config
}
```

### Command

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
files:
  - "**/*.fly.js"

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
