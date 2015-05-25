
module.exports = function (path, body) {
  return new Function(
    '$',
    'require',
    'module',
    'exports',
    'process',
    'global',
    'return ' + path + ';'
  ).call({}, body)
};
