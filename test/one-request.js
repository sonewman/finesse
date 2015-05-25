const finesse = require('../');

const scheduler = finesse();
const options = [{
  id: 'call1',
  url: 'http://0.0.0.0:8080/v2/products/trn:tesco:product:uuid:a97e8b53-0c0d-4402-b301-6485f24a47da'
}];

const st = Date.now();
scheduler.makeRequests(options, function (err, data) {
  if (err) throw err;
  console.log((Date.now() - st) + 'ms');
  console.log('d', data);
});
