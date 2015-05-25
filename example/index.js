
const Koa = require('koa')
const Router = require('koa-routr')
const requireDir = require('require-dir')

const router = Router()
Koa().use(router).listen(9090)

const productsData = require('./data/products.json')
const priceMap = requireDir('./data/prices')

router
  .get('/v1/products', function * () {
    this.body = productsData
  })
  .get('/v1/price/:id', function * (id, next) {
    if (priceMap[id]) this.body = priceMap[id]
    else yield next
  })
