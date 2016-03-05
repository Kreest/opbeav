/** @fileoverview
 * In JavaScript, all objects are keyed by strings.
 * This transforms interesting objects into strings, especially those which
 * do not have prototypes of their own.
 */

/**
 * @preserve The Windmill, copyright 2016 Matthew Gruen and contributors
 * Released under the Apache License, Version 2.0
 * https://github.com/thefifthmatt/windmill-client
 */
goog.provide('windmill.keys');

goog.require('goog.array');

windmill.keys.coordKey = function(coord) {
  return coord.i + ',' + coord.j;
}
windmill.keys.coordListKey = function(coordList) {
  return goog.array.map(coordList, windmill.keys.coordKey).join(',');
}
windmill.keys.lineKey = function(line) {
  return windmill.keys.coordKey({i: line.i, j: line.j}) +
      ',' + (line.isDown ? 'v' : 'h');
}
windmill.keys.shapeKey = function(shape) {
  if (shape.key_) {
    return shape.key_;
  }
  var key = [
    shape.width,
    goog.array.map(shape.grid, function(b) { return b ? '0' : '1' }).join('')
  ].join(',');
  shape.key_ = key;
  return key;
}
windmill.keys.fullShapeKey = function(shape) {
  return windmill.keys.shapeKey(shape) +
      (shape.free ? 'f' : '') + (shape.negative ? 'n' : '');
}
windmill.keys.multiShapeKey =
    function(grid, remaining, negative, opt_negativeGrid) {
  var shapeListKey = function(shapes) {
    var shapeKeys = goog.array.map(remaining, windmill.keys.fullShapeKey);
    shapeKeys.sort();
    return shapeKeys.join('-');
  }
  var stateKeys = [];
  stateKeys.push(windmill.keys.shapeKey(grid));
  stateKeys.push(shapeListKey(remaining));
  stateKeys.push(shapeListKey(negative));
  if (opt_negativeGrid) {
    stateKeys.push(windmill.keys.shapeKey(opt_negativeGrid));
    stateKeys.push(windmill.keys.coordKey(opt_negativeGrid.offset));
  }
  return stateKeys.join('|');
}
