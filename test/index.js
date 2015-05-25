'use strict';
const finesse = require('../');

const options = [{
  id: 'call1',
  url: 'http://0.0.0.0:9090/v1/products'
}, {
  id: 'call2',
  url: 'http://0.0.0.0:9090/v1/price/${ call1: $[0].id }'
}];

const st = Date.now();
finesse(options, function (err, data) {
  if (err) throw err;
  console.log('data', data);
  console.log((Date.now() - st) + 'ms');
});
