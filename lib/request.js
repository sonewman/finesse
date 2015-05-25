module.exports = Request;

/**
 * @class Request
 */
function Request(meta) {
  this.responses = []; // TODO not sure about this
  this.sent = false;
  this._meta = meta;
}

// this is used after some manipulation is done
Request.prototype._url = null;
Request.prototype._meta = null;
Request.prototype.options = null;
Request.prototype.responses = null;
Request.prototype.pendingDependencies = 0;
Request.prototype.index = -1;

Object.defineProperty(Request.prototype, 'id', {
  get: function () { return this._meta.id; }
});

Object.defineProperty(Request.prototype, 'method', {
  get: function () { return this._meta.method || 'GET'; }
});

Object.defineProperty(Request.prototype, 'url', {
  get: function () { return this._url || this._meta.url; },
  set: function (url) { this._url = url; }
});

Object.defineProperty(Request.prototype, 'body', {
  get: function () { return this._meta.body; },
  set: function (b) { this._meta.body = b; }
});

Object.defineProperty(Request.prototype, 'headers', {
  get: function () {
    return this._meta.headers || (this._meta.headers = {});
  },
  set: function (h) { this._meta.headers = h; }
});

