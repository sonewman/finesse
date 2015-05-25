'use strict';

//const NodeCache = require('node-cache');
//const debug = require('debug')('finesse:make-request');
const http = require('http');
const https = require('https');
const Response = require('./response');

const maxPoolSize = 1000;
// create pool to reduce garbage collection
const responsePool = [];
// response cache
//const cache = new NodeCache({stdTTL: 100, checkperiod: 600 });

module.exports = makeRequest;
function makeRequest(req, cb) {
//	options.pool = separateReqPool;
//	options.keepAlive = true;
//  var options = req.options;

  // do we have a response in cache?
//  const url = req.url;
//  let cached = cache.get(url)
//  if (cached) {
//    debug(cached);
////    [url];
//    cb(null, new Response(req.index, cached));
//    return;
//  }

  makeRoundTrip(new RoundTrip(req, cb));
}

function ResponseBody() {
  const self = this;
  self.buffer = [];
  self.push = function (chunk) {
    self.buffer.push(chunk);
  };
}

ResponseBody.prototype.flush = function () {
  const full = Buffer.concat(this.buffer);
  // speed hack for cleaning array
  this.buffer.length = 0;
  return full;
};

for (let i = 0; i < maxPoolSize; i += 1)
  responsePool.push(new ResponseBody());

function makeOnResponse(rt) {
  return function onResponse(res) {
    rt.onResponse(res);
  };
}

function makeRoundTrip(rt) {
  const options = rt.options;
  const body = rt.body;
  const httpReq = options.protocol === 'https' ? https.request : http.request;

  // make request
  const outreq = httpReq(options, makeOnResponse(rt));

  if (body != null) {
    if (!Buffer.isBuffer(body)) {
      if ('string' !== typeof body) body = JSON.stringify(body);
      body = new Buffer(body);
    }
    outreq.end(body);
  } else {
    outreq.end();
  }
}

// make external request
function RoundTrip(req, callback) {
  this.options = req.options;
  this.body = req.body;

  this.response = new Response(req);
  this.callback = callback;
}

RoundTrip.prototype.index = 0;

RoundTrip.prototype.onResponse = function onResponse(res) {
  const self = this;
  const response = self.response;
  const resBody = responsePool.pop() || new ResponseBody();

  response._statusCode = res.statusCode;
  response._headers = res.headers;

  // TODO handle on `error`
  res.on('data', resBody.push);

  function onend() {
    res.removeListener('data', resBody.push);
    res.removeListener('end', onend);

    response._data = resBody.flush();
    // get buffer byte length
    response._size = response._data.length;

    // set up body for reuse
    if (responsePool.length < maxPoolSize)
      responsePool.push(resBody);

    self.end();
  }

  res.on('end', onend);
};

function parseBody(r) {
  try {
    r._body = JSON.parse(r._data);
  } catch (err) {
    r._error = err;
  }
}

function toString(response) {
  response._body = response._data.toString();
}

const nl = 10;
const rt = 13;
const sp = 20;
const openCurly = 123;
const closeCurly = 125;
const openSquare = 91
const closeSquare = 93

function lookBack(buffer, close) {
  let i = buffer.length;
  while ((i -= 1)) {
    if (buffer[i] === close) return true;
    else if (buffer[i] !== nl && buffer[i] !== rt && buffer[i] !== sp)
      return false;
  }
}

function shouldParseAsJSON(headers, buffer) {
  if ((headers && headers.Accept === 'application/json') || Buffer.isBuffer(buffer)) {
    var c = buffer[0];
    if (c === openCurly) {
      return lookBack(buffer, closeCurly);
    } else if (c === openSquare) {
      return lookBack(buffer, closeSquare)
    }
  }

  return false
}

RoundTrip.prototype.end = function () {
  const response = this.response;
  const options = this.options;

  if (shouldParseAsJSON(options.headers, response._data))
    // attempt to convert buffer directly to Object
    parseBody(response);

  else if (response._data)
    toString(response);

  if (response.headers['cache-control']) {
    let cacheControl = response.headers['cache-control']
      .match(/max-age\s*=\s*(\d+)/);

    if (cacheControl)
      response.maxage = parseInt(cacheControl[1], 10);
  }

  //if (raw.maxage > 0) cache.set(raw.url, raw, raw.maxage);
  this.callback(null, response);
};
