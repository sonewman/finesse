'use strict';

module.exports = finesse;

const Scheduler = require('./lib/scheduler');

function finesse(options, cb) {
  const data = [];
  const total = options.length;
  let count = 0;
  const s = new Scheduler(options, cb);
  s.makeRequests(options, function (err, d) {
    if (err) {
      cb(err);
      return;
    }

    data.push(d);
    if (++count === total) cb(null, data);
  });
}
