# node-fly

- 独立性：每个函数具有独立性，尽量不依赖于其他函数，注册名字即为全局名字，全局唯一
- 配置性：函数内的配置和被外部配置覆盖，包含一个 `fly.yml` 的配置文件，可以配置

## 接口定义

### Event 事件定义

> Event 可以是任何值，没有严格的限制，并且要保持干净

### Context 上下文定义

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

### Function 函数定义

```javascript
{
  name: String,             // 名字
  main: Function,           // 主函数
  validate: Function,       // 验证事件是否合法
  before: Function,         // 前置拦截器
  after: Function,          // 后置拦截器
  error: Function,          // 错误拦截器

  // 1. 可以通过 fly.yml 中的 config.db 进行覆盖
  // 2. 可以通过 fly_[FLY_ENV].yml 中的 config.db 进行覆盖
  // 3. 可以通过 fly.yml 中的 config['@userCreate'].db 进行覆盖
  config: Object,           // 默认配置信息

  // 1. 可以通过 fly.yml 中的 links.module 进行覆盖
  // 2. 可以通过 fly_[FLY_ENV].yml 中的 links.module 进行覆盖
  // 3. 可以通过 fly.yml 中的 links['[userCreate]'].module 进行覆盖
  // 4. 可以通过 fly_[FLY_ENV].yml 中的 links['[userCreate]'].module 进行覆盖
  links: {
    String: String          // 需要 Link 的项目
  }

  events: {                 // 事件声明
    http: {                 // Http 事件声明
      method: String,       // 方法
      path: String,         // 路径
      domain: String,       // 域名
      validate: Function,   // 验证事件是否合法
      before: Function,     // 前置拦截器
      after: Function,      // 后置拦截器
    },

    stratup: Boolean,       // 系统启动事件
    shutdown: Boolean,      // 系统关闭事件
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

  error: (error, ctx) => {
    return {
      status: 500,
      body: {
        code: 1,
        message: error.message
      }
    }
  }

  events: {
    http: {
      method: 'post',
      path: '/api/users/create',
      before: function (event) {
        return {
          username: event.body.username,
          password: event.body.password
        }
      },
      after: function (result) {
        return {
          status: 200,
          body: result
        }
      }
    },

    startup: true,
  }
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

  events: {
    http: {
      method: 'get',
      path: '/google',
      after: (result) => {
        return {
          status: 200,
          body: result.body
        }
      }
    }
  }
}
```

### 2. 启动

```bash
fly fly-proxy-google.js
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

**通过HTTP API**

```bash
$ curl -X POST https://localhost:5000/api/proxyGoogle

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
    [command]                    start | stop | reload | restart | status | log
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
