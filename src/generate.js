/**
 * @fileoverview
 * Very basic grid generator.
 */
goog.provide('windmill.generate');

goog.require('windmill.GridProto');
goog.require('windmill.keys');


goog.scope(function() {
var GridProto = windmill.GridProto;
var Entity = GridProto.Entity;
var Shape = GridProto.Shape;
var Type = GridProto.Type;
var Color = GridProto.Color;
var Storage = GridProto.Storage;
var Orientation = GridProto.Orientation;

var coordKey = windmill.keys.coordKey;

// Some commentary.
// There are generally two approaches to generation: one, start with a
// pre-drawn line and add shapes around it. Or two, add symbols on a grid
// and figure out a line after that.
// I would argue that in both cases, you need to have a solver solve the
// puzzles to see how difficult they are, and potentially add more symbols
// or remove symbols. I would also argue that approach #2 produces better
// puzzles because the generator has a semantic understanding of what you were
// going for initially, and the puzzles with added symbols look more coherent.
var seed = 0;
var randrange = function(max, min) {
  max = max || 1;
  min = min || 0;
  seed = (seed * 9301 + 49297) % 233280;
  var rnd = seed / 233280;
  return min + Math.floor(rnd * (max - min));
}

/**
 * @param {windmill.Grid}
 */
windmill.generate = function(grid) {
  seed = Math.floor(Math.random()*233280);
  // Interesting seeds: 190715, 28050, 195883, 124484
  console.log('seed: ' + seed);
  // Generate squares
  var cells = {};
  var width = this.width, height = this.height;
  grid.initialize(width, height);
  var squares = 0;
  var iters = 0;
  // The density. This depends on the thing being generated.
  var squareTotal = Math.ceil(Math.floor(Math.pow(width * height, 3/4))/2)*2;
  while (squares < squareTotal && iters++ < 100) {
    var i = randrange(width);
    var j = randrange(height);
    var key = coordKey({i: i, j: j});
    if (key in cells) {
      continue;
    }
    var entity = new Entity(Type.SQUARE);
    // Two color mode
    if (squares < squareTotal/2) {
      entity.color = Color.BLACK;
    } else if (squares < squareTotal/2) {
      entity.color = Color.CYAN;
    } else {
      entity.color = Color.WHITE;
    }
    cells[key] = entity;
    grid.cellEntity(i, j, entity);
    squares++;
  }
  grid.seed = seed;
}

var pareDownGrid = function() {
  // First, generate a solution. By default go straight, record all moves.
  // Then, make all different decisions and try to solve.
  // Choose the least interesting one and try to eliminate it, by examining inconsistencies
  // between the two. This can be adding squares.
  // Before adding polyominos and grids, try to generate variants of the one to eliminate, to see
  // what all such mazes have in common.
}

});
