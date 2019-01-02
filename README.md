# fly

- 独立性：每个函数具有独立性，尽量不依赖于其他函数，注册名字即为全局名字，全局唯一
- 配置性：函数内的配置和被外部配置覆盖，包含一个 `fly.yml` 的配置文件，可以配置

## 安装

> 需要 `node >= 8`，需要安装 `yarn`

```bash
$ yarn
$ yarn link
```

## 帮助

```bash
fly help
```

### Function 函数定义

```javascript
{
  name: String,                                 // 名字
  main: Function (event, ctx),                  // 主函数
  validate: Function (event, ctx),              // 验证
  before: Function (event, ctx),                // 前置拦截
  after: Function (event, ctx),                 // 后置拦截
  catch: Function (event, ctx),                 // 错误拦截
  config: Object {String: Any},                 // 默认配置信息
  links: Object {String: String},               // 引用模块
  configHttp: Object || Boolean,                // HTTP 配置
  beforeHttp: Function (event, ctx),            // HTTP 前置拦截
  afterHttp: Function (event, ctx),             // HTTP 后置拦截
  validateHttp: Function (event, ctx),          // HTTP 验证
  catchHttp: Function (event, ctx),             // HTTP 错误拦截
  configCommand: Object || Boolean,             // Command 配置
  beforeCommand: Function (event, ctx),         // Command 前置拦截
  afterCommand: Function (event, ctx),          // Command 后置拦截
  validateCommand: Function (event, ctx),       // Command 验证
  catchCommand: Function (event, ctx),          // Command 错误拦截
  configStartup: Object || Boolean,             // 配置启动
  configShutdown: Object || Boolean,            // 配置关闭
}
```

### Event 事件定义

> Event 可以是任何值，没有严格的限制，并且要保持干净

### Ctx 上下文定义

```javascript
{
  '<Fn prop>': '<Fn prop value>',   // All function props
  eventId: String,                  // 事件 ID
  eventType: String,                // 事件类型：http, command, null is internal
  originalEvent: Event,             // 原始事件
  parentEvent: Event,               // 上一级的事件
  call: Function,                   // 调用方法 call([Function Name])
  list: Function,                   // List functions
  get: Function,                    // Get function
  trace: {                          // 调用链路信息
    name: String,                   // 函数名称
    type: String,                   // 调用类型
    eventType: String,              // Event Type
    eventId: String,                // Event ID
    error: String,                  // 错误信息
    startTime: Number,              // 开始时间
    endTime: Number,                // 结束时间
    spendTime: Number,              // 结束时间
  }
}
```

## 程序示例

=== userCreate.js

```javascript
const db = require('./db')

module.exports = {
  name: 'userCreate',

  config: {
    db: 'localhost:27017'
  }

  links: {
    module: '/dir',
    url: 'http://url'
  }

  main: async function (event, ctx) {
    await ctx.call('module@log', {event})
    return await db.insertOne(event)
  },

  validate: async (event, ctx) => {
    return !!event.id
  },

  before: (event, ctx) => {
    await db.bootstrap()
    return event
  },

  after: (event, ctx) => {
    return {
      body: {
        data: event
      }
    }
  },

  catch: (error, ctx) => {
    return {
      status: 500,
      body: {
        code: 1,
        message: error.message
      }
    }
  },

  configHttp: {
      method: 'post',
      path: '/api/users/create',
  },

  beforeHttp: function (event) {
    return {
      username: event.body.username,
      password: event.body.password
    }
  },

  afterHttp: function (result) {
    return {
      status: 200,
      body: result
    }
  },

  configStartup: true
}
```

## 使用示例

### 1. `fly-proxy-google.js`

```javascript
module.exports = {
  name: 'proxyGoogle',

  main: async () => {
    return await request.get('https://google.com')
  },

  configHttp: {
    method: 'get',
    path: '/google'
  },

  afterHttp: (result) => {
    return {
      status: 200,
      body: result.body
    }
  }
}
```

### 2. 启动

```bash
fly up -f
```

### 3. 访问

**通过网页提供服务**

```
$ curl https://localhost:5000/google
<!doctype html>...
```

**通过命令行API**

```bash
$fly call fly-proxy-google.js
{
  ...: ...,
  body: "<!doctype html>..."
}
```

## 命令行

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

## 配置示例

> 常规情况下简单的东西不需要配置，但是也可以通过配置来声明约束，方斌啊管理

`fly.yml`

```yaml
# HTTP 服务的一些配置，默认值，函数可以强制声明来覆盖
events:
  http:
    domain:
      - api.com
      - localhost

# 程序可以通过 fly.config.db 来获取下级的节点
# @开头的为 link 的配置覆盖
config:
  db:
    host: localhost
  module@:
    db: 'test:3333'
  url@:
    url: hello

# Link 主要作用是为了减少重写
#   1、使用函数
#   2、继承服务
links:
  module: module-name
  dir: /dirname
  file: /filename
  url: http://localhost:3333
  git: git@gitlab.com:hfcorriez/test.git
  github: hfcorriez/test.git
```
