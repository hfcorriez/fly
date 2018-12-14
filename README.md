# node-fly

- 独立性：每个函数具有独立性，注册名字即为全局名字，全局唯一
- 可继承：可继承函数进行修改部分属性发布为新的函数
- 模块化：一个文件就是一个模块，包含（主函数、事件声明http、command等、转换器、中间件？）
- 可配置：包含一个 fly.yml 的配置文件，可以配置

## 当前问题

- [x] 安装依赖是否要存储到工作目录？否
- [x] before 处理后的返回必须是 event，如何管理 before 前的 event？返回即是下一个事件，但是带上原始的，prevEvent
- [x] 对于拦截器这类函数是否需要特殊的定义？否
- [x] 命名是否是必须的？否
- [x] config 配置是否有更好的方式？

## 程序示例

=== userCreate.js

```javascript
class Fn  {
  // 命名，全局唯一，继承可以修改
  static name: 'userCreate',

  // 默认配置项目
  // 1. 可以通过 fly.yml 中的 config.db 进行覆盖
  // 2. 可以通过 fly_[FLY_ENV].yml 中的 config.db 进行覆盖
  // 3. 可以通过 fly.yml 中的 config['@userCreate'].db 进行覆盖
  // 4. 可以通过 CONFIG_DB 覆盖
  // 5. 可以通过 CONFIG_USERCREATE_DB 覆盖
  config: {
    db: 'localhost:27017'
  }

  // 需要 Link 的项目
  // 1. 可以通过 fly.yml 中的 links.module 进行覆盖
  // 2. 可以通过 fly_[FLY_ENV].yml 中的 links.module 进行覆盖
  // 3. 可以通过 fly.yml 中的 links['[userCreate]'].module 进行覆盖
  // 4. 可以通过 fly_[FLY_ENV].yml 中的 links['[userCreate]'].module 进行覆盖
  // 5. 可以通过 LINKS_MODULE 覆盖
  links: {
    module: '/dir',
    url: 'http://url'
  }

  /**
   * 主函数
   *
   * @param {Object} event    Event
   * @param {Object} ctx      Context
   */
  main: async function (event, fly) {
    // Call to local module
    await fly.call('module@ga.event', {
      type:'create',
      username: event.username
    })

    // Call with function name
    await fly['module@ga.test']({name: 'abc'})

    // Call remote with config
    await fly.call('url@ga.test', {host: 'api.com'})

    // Call directly
    await fly.call('abc.com:3333@test')

    // Fly result
    return await db.users.insert(event)
  },

  /**
   * Validate function
   *
   * @param {Object} event    Event
   * @param {Object} ctx      Context
   */
  validate: async (event, ctx) => {
    if (!event.username || !event.password) return

    return !ctx.getDB().exists(event.username)
  },

  interceptor: 'httpServiceV1',

  /**
   * Before interceptor for function
   *
   * @param {Object} event    Event
   * @param {Object} ctx      Context
   */
  before: (event, ctx) => {
  },

  /**
   * After interceptor for function
   *
   * @param {Object} event    Event
   * @param {Object} ctx      Context
   */
  after: (event, ctx) => {
  },

  /**
   * Events declare
   * Support: http, api, startup, shutdown
   */
  events: {
    // API 服务注册，默认都打开
    api: false,

    // HTTP 服务的注册
    http: {
      method: 'post',
      path: '/api/users/create',
      before: ['api.authUser', 'logstash@reportHttp', function (event) {
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

    startup: {
      before: ['log@logEvent', function (event, ctx) {
        return {
          username: 'corrie',
          password: 'haha'
        }
      }]
    }
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
fly [command] [options] [file | dir]

= Commands

start                 Run on the fly  [Default command]
    -d, --daemon        Run in daemon mode
    -l, --link          Link multi folder
    -w, --watch         Start with hot reload mode
    -a, --autoname      Auto set function name base on directory
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
