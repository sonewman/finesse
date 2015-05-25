'use strict';

module.exports = Response;

function Response(req) {
  this._id = req.id;
  this._url = req.url;
  this._headers = req.headers;
  this._options = req.options;
  this._index = req.index;
}

Response.prototype._callback = null;
Response.prototype._index = -1;
//Response.prototype._ = false;
Response.prototype._error = null;
Response.prototype._statusCode = 0;
Response.prototype._done = false;

Object.defineProperty(Response.prototype, 'id', {
  get: function () { return this._id; }
});

Object.defineProperty(Response.prototype, 'url', {
  get: function () { return this._url; }
});

Object.defineProperty(Response.prototype, 'headers', {
  get: function () { return this._headers; }
});

Object.defineProperty(Response.prototype, 'statusCode', {
  get: function () { return this._statusCode; }
});

Object.defineProperty(Response.prototype, 'maxage', {
  get: function () { return this._maxage; }
});

Object.defineProperty(Response.prototype, 'body', {
  get: function () { return this._body; }
});

Object.defineProperty(Response.prototype, 'size', {
  get: function () { return this._.size; }
});

Object.defineProperty(Response.prototype, 'index', {
  get: function () { return this._index; }
});

Object.defineProperty(Response.prototype, 'error', {
  get: function () { return this._error; }
});

Response.prototype.complete = function () {
  if (this._done && this._callback) return;

  if (this._error) {
    this._callback(this._error);
  } else {
    this._done = true;
    this._callback(null, this.body);
  }
};
