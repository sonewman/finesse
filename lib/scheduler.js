'use strict';

/**
 * @exports
 */
module.exports = Scheduler;

const url = require('url');
const urlParse = url.parse;
const urlFormat = url.format;

const makeRequest = require('./make-request');
const DependencyGraph = require('./dependencies');
const hasProtocol = /^(\/\/|https?:\/\/)/i;
const debug = require('debug')('finesse:scheduler');

function noop() {}

function Handler(scheduler, ondata, oncomplete) {
  this.pending = 0;
  this.count = 0;
  this.scheduler = scheduler;
  this.ondata = 'function' === typeof ondata ? ondata : noop;
  this.oncomplete = 'function' === typeof oncomplete ? oncomplete : noop;

}

Handler.prototype.complete = function () {
  this.count += 1;
  if (this.ount === this.pending)
    this.oncomplete();
}

Handler.prototype.onIndependent = function (err, req) {
  // TODO (sonewman) handle error
  if (err) throw err;
  // increment count
  this.pending += 1;
  makeRequest_(this.scheduler, req, this);
}

/**
 * @class Scheduler
 */
function Scheduler(options) {
  if (!options) options = {};

  this._independents = 0;
  this._indieCount = 0;
  this._depGraph = new DependencyGraph();
}

Scheduler.prototype.maxage = 0;

function propagate(scheduler, depGraph, depRes, handler) {
  debug('propagate');
  depGraph.succeed(depRes, handler.ondata);

  if (depGraph.dependentCount(depRes) === 0) {
    handler.complete();
    return;
  }

  let nextRequests = depGraph.requestDependencies(depRes.id);

  for (let req of nextRequests) {
    handler.pending += 1;
    makeRequest_(scheduler, req, handler);
  }
}

Scheduler.prototype.makeRequests = function (options, done) {
  debug('makeRequests');
  const handler = new Handler(this, done);

  if (!options || 'object' !== typeof options) return;
  if (!Array.isArray(options)) options = [options];

  // iterate options
  for (let o of options)
    this._depGraph.newRequest(o, handler);
}

function makeRequest_(scheduler, req, handler) {
  debug('makeRequest_');

  if (req.url) {
    if (scheduler._root && !hasProtocol.test(req.url))
      req.url = scheduler._root + req.url;
  } else {
    req.url = urlFormat(req);
  }

  // resolve requests dependencies if any
  scheduler._depGraph.resolve(req);
  let options = urlParse(req.url);
  options.method = req.method;
  options.headers = { accept: 'application/json' };
  assign(options.headers, req.headers);

  req.options = options;

  makeRequest(req, makeResHandle(scheduler, handler));
}

function makeResHandle(scheduler, handler) {
  const st = Date.now();
  return function resHandle(err, res) {
    const responseTime = Date.now() - st;
    debug('resHandle', responseTime + 'ms');

    if (err) {
      res.body = err;
      scheduler.maxage = -1;
    } else if (scheduler.maxage !== -1) {
      scheduler.maxage = scheduler.maxage < res.maxage
        ? scheduler.maxage
        : res.maxage;
    }

    // this has the potential for severe memory leakage
    //req.responses.push(res);
    propagate(scheduler, scheduler._depGraph, res, handler);
  }
}

function assign(b, a) {
  let aks = Object.keys(a);
  for (let k of aks) b[k] = a[k];
}
