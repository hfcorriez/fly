# node-fly

- 模块化：一个文件就是一个模块，包含（主函数、事件声明http、command等、转换器、中间件？）
- 可配置：包含一个 fly.yml 的配置文件，可以配置
- 独立性：每个函数具有独立性，注册名字即为全局名字，全局唯一
- 可继承：可继承函数进行修改

## 配置示例

=== fly.yml

```yaml
# HTTP 服务的一些配置，默认值，函数可以强制声明来覆盖
http:
  domain:
    - api.com
    - localhost

# 程序可以通过 fly.config.db 来获取下级的节点
# @开头的为 link 的配置覆盖
config:
  db:
    host: localhost
  @module:
    db: 'test:3333'
  @url:
    url: hello

# Link 主要作用是为了减少重写
#   1、使用函数
#   2、继承服务
links:
  module:
    module: module-name
    http:
      url: module/{url}
  dir:
    dir: /dirname
  file:
    file: /filename
  url:
    url: localhost:3333
```

## 程序示例

=== userCreate.js

```javascript
module.exports =  {
  // 命名，全局唯一，继承可以修改
  name: 'user.create',

  // 主函数
  main: async function (event, fly) {
    // Call to local module
    await fly.call('ga.event@module', {
      type:'create',
      username: event.username
    })

    // Call with function name
    await fly['ga.test@module']({name: 'abc'})

    // Call remote with config
    await fly.call('test@url', {host: 'api.com'})

    // Call directly
    await fly.call('test@abc.com:3333')

    // Fly result
    return await db.users.insert(event)
  },

  interceptor: 'httpServiceV1',

  before: function() {
  },

  after: function() {
  },

  // 事件配置
  events: {
    // API 服务注册，默认都打开
    api: false,

    // HTTP 服务的注册
    http: {
      method: 'post',
      path: '/api/users/create',
      before: ['api.authUser', 'logstash', function (event) {
        // ?event.results['api.authUser']
        return {
          username: event.body.username,
          password: event.body.password
        }
      }]
      after: function (result) {
        return {
          status: 200,
          body: result
        }
      }
    },

    // 命令行注册
    command: {
      name: 'user.create',
      before: 'command.autoParse'
    },

    startup: {
      before: ['log.startup@log', function (event, ctx) {
        return {
          username: 'corrie',
          password: 'haha'
        }
      }]
    }
  }
}
```

## 命令行

```bash
fly [command] [options] [file | dir]

= Commands

start                 Run on the fly  [Default command]
    -d, --daemon        Run in daemon mode
    -l, --link          Link multi folder
    -w, --watch         Start with hot reload mode
    -a, --autopath      Auto set function name base on directory
    -p, --port          Bind port
    -b, --bind          Bind address
    -m, --mode          Start mode: api, http or together
    --disable-http-link Disable http link
    --enable-api-link   Enabled links api, accesss via service@function
    --api-prefix        Api url prefix, default is /api
restart               Restart service
stop                  Stop service
status                Status service
log                   Show log
config                Show config
version
call                  Call function
    -d, --data          Json or form data
list                  List functions
install               Install deps
    -l                  List deps
new                   Create new project

= Global options
-V      Verbose
```

## Fly 作为库来使用

```javascript
const Fly = require('node-fly')
const flyDir = new Fly('/dir')
await flyDir.call('test', {host: 'api.com'})

const flyUrl = new Fly('test.com:3333')
await flyUrl.call('test', {host: 'api.com'})

const flyModule = new Fly('fly-node')
await flyModule.call('abc')
```
