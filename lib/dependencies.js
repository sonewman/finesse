'use strict';

module.exports = DependencyGraph;

const Request = require('./request');
const runPath = require('./run-path');
const fastpath = require('fastpath');
const debug = require('debug')('finesse:dependencies');

/**
 * @class Dependency
 * @constructor
 */
function Dependency(id, path, place, type) {
  this.id = id;
  this.path = path;
  this.place = place;
  this.type = type;
}

/**
 * @class DependencyGraph
 * @constructor
 * @api private
 */
function DependencyGraph() {
  this.order = [];
  this.requests = {};
  this.responses = {};
}

/**
 * Index of current request
 *
 * @type {number}
 */
DependencyGraph.prototype.reqIndex = -1;

/**
 * Index of current response
 *
 * @type {number}
 */
DependencyGraph.prototype.resIndex = -1;

/**
 * List of request Id's in the order they should be returned
 *
 * @type {Array}
 * @api private
 *
 * #order = [`reqId`]
 */
DependencyGraph.prototype.order = null;



/**
 * Map containing number of pending dependencies a request has
 *
 * pendingCounts = {
 *   `ID`: <number>
 * }
 */
DependencyGraph.prototype.pendingCounts = null;

/**
 * Map containing a requests dependencies:
 *
 * #dependencies = {
 *   `reqId`: {
 *     `depId`: {
 *       `jsonPath`: [<Dependency>]
 *    }
 *  }
 * }
 */
DependencyGraph.prototype.dependencies = null;

/**
 * Map cross referencing a requests dependents
 * (this maps to the dependencies above):
 *
 * #dependents = {
 *   `depId`: {
 *     `reqId`: ^ {dependencies[`reqId`]} ^
 *   }
 * }
 */
DependencyGraph.prototype.dependents = null;

/**
 * Map containing number of dependents a request has:
 *
 * #dependentCounts = {
 *   `depId`: <number>
 * }
 */
DependencyGraph.prototype.dependentCounts = null;

/**
 * Map containing whether the request has been called
 *
 * #called = {
 *   `reqId`: <boolean>
 * }
 */
DependencyGraph.prototype.called = null;

/**
 * Map containing resolved responses:
 *
 * #resolvedResponse = {
 *   `reqId`: <Response>
 * }
 */
DependencyGraph.prototype.resolvedResponse = null;

/**
 * Map containing cached jsonPath lookups
 *
 * #cache = {
 *   `reqId`: {
 *     `jsonPath`: <string> || [<string>]
 *   }
 * }
 */
DependencyGraph.prototype.cache = null;


const rxPath = /\$\{\s*(\w+)\s*\:\s*([^\}]+\s*)\}/g;

/**
 * Find string dependencies
 *
 * @param {DependencyGraph} depGraph
 * @param {Request} req
 * @param {string} str
 * @param {Object} type
 */
function findDependencies(depGraph, req, str, type) {
  if (!str) return;

  str.replace(rxPath, onMatch);
  function onMatch(place, depId, path) {
    depGraph.addDependency(req, depId, path, place, type);
  }
}

/**
 * Create new request from the given options
 *
 * @param {Object} options
 * @param {Function} isIndependent
 */
DependencyGraph.prototype.newRequest = function (options, handler) {
  debug('#newRequest');
  const req = new Request(options);
  const id = req.id;

  // we have an ID class return an error
  if (this.requests[id]) {
    process.nextTick(function () {
      handler.isIndependent(new Error(
        'Request ' + id + ' already exists. Cannot have two requests '
        + 'with the same id'
      ));
    });
  }

  this.requests[id] = req;
  this.order.push(id);

  this.reqIndex += 1;
  req.index = this.reqIndex;

  findDependencies(this, id, req.url, URL_MATCH);
  findDependencies(this, id, req.body, BODY_MATCH);

  function callIndependent() {
    handler.onIndependent(null, req);
  }

  if (this.totalDependencies(req) === 0)
    process.nextTick(callIndependent);
};

/**
 * This is purely to avoid creating a bunch of unnecessary
 * objects if we have zero dependencies
 */
DependencyGraph.prototype.addDependency = function initAdd(r, d, p, pl, t) {
  this.pendingCounts = {};
  this.dependencies = {};
  this.dependents = {};
  this.dependentCounts = {};
  this.called = {};
  this.resolvedResponse = {};
  this.cache = {};
  this.addDependency = addDependency_;
  this.addDependency(r, d, p, pl, t);
};

function addDependency_(reqId, depId, path, place, type) {
  debug('add_', reqId, depId);

  const dependencies = this.dependencies;
  // if the request has no dependencies
  // then we need to create a map for them
  if (!dependencies[reqId]) {
    dependencies[reqId] = {};
    // set the request dependency count to zero
    this.pendingCounts[reqId] = 0;
  }

  const dependency = dependencies[reqId];
  // if the request does not depend on the target
  // already then create a map for that
  if (!dependency[depId]) {
    dependency[depId] = {};

    // increase the dependency count
    this.pendingCounts[reqId] += 1;
  }

  const depPaths = dependency[depId];
  if (!depPaths[path])
    depPaths[path] = [];

  depPaths[path].push(new Dependency(depId, path, place, type));

  // Now we add the dependent
  const dependents = this.dependents;
  if (!dependents[depId]) {
    dependents[depId] = {};
    this.dependentCounts[depId] = 0;
  }

  const dependent = dependents[depId];
  if (!dependent[reqId]) {
    dependent[reqId] = dependency;
    this.dependentCounts[depId] += 1;
  }
}

/**
 * Get a requests dependencies
 * @param {string} id
 * @returns {Object}
 */
DependencyGraph.prototype.getDependencies = function (id) {
  debug('getDependencies');
  const deps = this.dependencies;
  return (deps && deps[id]) || null;
};

DependencyGraph.prototype.totalDependencies = function (req) {
  let deps = this.dependencies;
  debug('totalDependencies', req.id, deps);
  return Object.keys((deps && deps[req.id]) || {}).length;
};

DependencyGraph.prototype.pending = function (req) {
  const pc = this.pendingCounts;
  return (pc && pc[req.id]) || 0;
};

DependencyGraph.prototype.dependentCount = function (req) {
  const deps = this.dependentCounts;
  debug('dependentCount');
  return (deps && deps[req.id]) || 0;
};

//const headerMatch = Object.create(null);
const URL_MATCH = Object.create(null);
const BODY_MATCH = Object.create(null);

function completeResponse(response) {
  process.nextTick(function () {
    response.complete();
  });
}

function throttleResponses(depGraph) {
  debug('throttleResponses');
  let nextIndex;
  let nextId;
  let nextResponse;

  while (true) {
    nextIndex = depGraph.resIndex + 1;
    nextId = depGraph.order[nextIndex];
    nextResponse = depGraph.responses[nextId];

    if (!nextResponse || nextIndex !== nextResponse.index) return;

    depGraph.resIndex = nextIndex;
    completeResponse(nextResponse);
  }
}

function cleanup(dg, id) {
  dg.requests[id] = null;
  dg.pendingCounts[id] = 0;
}

/**
 * Call with id of depdency callback will be called for each
 * dependent whose dependencies have now been fulfilled
 * @param {string} id
 * @param {Function} cb
 * @api private
 */
DependencyGraph.prototype.succeed = function (response, cb) {
  debug('succeed');
  this.responses[response.id] = response;
  cleanup(this, response.id);
  response._callback = cb;
  throttleResponses(this);
};

DependencyGraph.prototype.requestDependencies = function * (id) {
  debug('requestDependencies');

  const deps = this.dependents[id];
  if (!deps) return;

  this.dependents[id] = null;

  const keys = Object.keys(deps);
  if (keys.length === 0) return;

  const pendingCounts = this.pendingCounts;
  const called = this.called;

  for (let k of keys) {
    var c = (pendingCounts[k] ? pendingCounts[k] -= 1 : 0);

    if (this.dependentCounts[k] > 0)
      this.dependentCounts[k] -= 1;

    if (c === 0 && !called[k]) {
      called[k] = true;
      yield this.requests[k];
    }
  }
};

DependencyGraph.prototype.resolve = function (req) {
  debug('resolve', req.id, this.totalDependencies(req));
  if (this.totalDependencies(req) === 0) return;

  const reqId = req.id;
  const pendingCounts = this.pendingCounts;

  debug('resolve:pending', reqId, pendingCounts[reqId]);
  if (pendingCounts[reqId] !== 0) throw new Error('request ' + reqId + ' has pending dependencies');

  const dependencies = this.dependencies[reqId] || {};
  const dependencyIds = Object.keys(dependencies);

  for (let dependencyId of dependencyIds) {
    var dependency = dependencies[dependencyId];

    // TODO consider multiple responses
    var jsonPaths = Object.keys(dependency)

    // iterate over the jsonPaths we depend on
    for (var jsonPath of jsonPaths) {
      var expectedValues = dependency[jsonPath];
      var match = this.resolveMatch(dependencyId, jsonPath);

      for (var exp of expectedValues) {
      // TODO is value array if so maybe we need to iterate over this

        if (exp.type === URL_MATCH)
          req.url = req.url.replace(exp.place, match.encoded);
        else if (exp.type === BODY_MATCH)
          req.body = req.body.replace(exp.place, match.stringified);
      }
    }
  }
};

DependencyGraph.prototype.resolveMatch = function (dependencyId, jsonPath) {
  let cached = this.cache[dependencyId];
  if (cached && cached[jsonPath])
    return cached[jsonPath];

  // match relevant response
  // TODO (sonewman) handle this in a better way
  if (!(dependencyId in this.responses))
    throw new Error('No Response for this dependency!');

  const res = this.responses[dependencyId];

  // TODO (sonewman) handle these errors better
  if (!res) throw new Error('there is no response with the id ' + dependencyId);

  const body = res.body;

  // TODO (sonewman) handle these errors better
  if (!body) throw new Error('response ' + dependencyId + ' has no body');

  cached = this.cache[dependencyId] || (this.cache[dependencyId] = {});

  let value = new Value(body, jsonPath);
  cached[jsonPath] = value;

  // clean up res.body TODO (sonewman) add method
  // to res to clean up internals rather than setting private
  // property -- this might not be necessary, since it would
  // be better to return the response object instead of the body
  //res._body = null;

  // return value
  return value;
};

const UNDEF = Object.create(null);
const specialCharCheck = /(^$|[\*@]|\[\d*\:\d*\:?\]|\[\??\([^\]\)]+\)\])/

function isStraightPath(str) {
  return !specialCharCheck.test(str);
}

function Value(body, path) {
  const st = Date.now();

  if (isStraightPath(path))
    this._useStraightPath(path, body);
  else
    this._useFastPath(path, body);

  debug('Value - fastpath#evaluate', this._value, (Date.now() - st) + 'ms');
}
Value.prototype._encoded = UNDEF;
Value.prototype._stringified = UNDEF;
Value.prototype.error = null;

Value.prototype._useFastPath = function (path, body) {
  try {
    this._value = fastpath(path).evaluate(body);
  } catch (err) {
    this.error = err;
  }
};

Value.prototype._useStraightPath = function (path, body) {
  try {
    const v = runPath(path, body);
    if (v !== undefined) this._value = [v];
  } catch (err) {
    this.error = err;
  }
};


function ensureEncode(value) {
  return decodeURIComponent(value) === value ? encodeURIComponent(value) : value;
}

// this allows lazy transformation
Object.defineProperty(Value.prototype, 'encoded', {
  get: function () {
    if (this._encoded === UNDEF) this._encoded = ensureEncode(this._value);
    return this._encoded[0];
  }
});

function ensureStringified(value) {
  return value && 'object' === typeof value ? JSON.stringify(value) : value;
}

// this allows lazy transformation
Object.defineProperty(Value.prototype, 'stringify', {
  get: function () {
    if (this._stringified === UNDEF)
      this._stringified = ensureStringified(this._value);
    return this._stringified[0];
  }
});

