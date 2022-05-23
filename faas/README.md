# Design Purpose

- Use fly function to deploy online faas service and local
- Base on fly easy features: decorator, context, validator
- Support different service special features: cloudflare kv, etc.
- Simple to develop faas

# Plans

- v5.0: cloudflare
  - basic function runtime
  - fly features support
  - cf features support
  - static page support
- v5.1: heroku and vercel
  - Native nodejs env support
- v5.2: aws

# Example

## Cloudflare

*fly.yml*

```yaml
cloudflare:
  name: my-fn
  route: abc.com/*
```

*lookupIp.js*

```js
module.exports = {
  configHttp: {
    method: 'get',
    path: '/api/lookupIp'
  },

  main ({ query: {ip} }, { ipip }) {
    const ipInfo = ipip.lookup(ip)
    return {
      body: ipInfo
    }
  }
}
```

```bash
$ yarn fly deploy cloudflare
```
