```

    _/_/_/_/  _/    _/      _/
   _/        _/      _/  _/
  _/_/_/    _/        _/
 _/        _/        _/
_/        _/_/_/_/  _/

```

`FLY` is `f`unctional`ly`: A library for develop backend easy.

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
module.exports = {
  async main (event) {
    return {url : event.query.url}
  },

  configHttp: {
    method: 'GET',
    path: '/proxy'
  }
}
```

### Run

```bash
fly http
```

## Defintions

### Function Defintion

```javascript
{
  extends: String,                              // Extends from function, support file, package
  imports: Object {String: String}              // Inject function to context
  config: Object {String: Any},                 // Config object
  retry: Number || Boolean,                     // Retry count, true is 3
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
files: Object                 # request files is
query: Object
search: String
cookies: Object
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

#### Command

**Command Event**

```yaml
args: Object
params: Object
```

**Command Config**

```yaml
_: String
alias: Object
descriptions: Object
```

#### Cron

**Cron Event**

```yaml
time: timestamp
```

**Cron Config**

```yaml
time: '* * * * *'
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
