/**
 * @fileoverview
 * A preliminary incremental solver.
 */
goog.provide('windmill.solve');

goog.require('windmill.GridProto');
goog.require('windmill.Path');
goog.require('windmill.Snake');
goog.require('windmill.keys');
goog.require('goog.array');
goog.require('goog.object');


goog.scope(function() {
var GridProto = windmill.GridProto;
var Entity = GridProto.Entity;
var Shape = GridProto.Shape;
var Type = GridProto.Type;
var Color = GridProto.Color;
var Storage = GridProto.Storage;
var Orientation = GridProto.Orientation;
// Non wire.
var DrawType = GridProto.DrawType;

var coordKey = windmill.keys.coordKey;

/** @constructor */
Solver = function(grid) {
  this.grid = grid;
  // Now, figure out where ends are, as this is important.
  this.endList = [];
  grid.forEachEntity(function(value, i, j, drawType) {
    if (value.type != Type.END) {
      return;
    }
    var coord = {i: i, j: j};
    if (drawType == DrawType.POINT) {
      this.endList.push({coord: coord, drawType: drawType});
    }
  }, this);
}
var Solver = windmill.solve.Solver;

Solver.prototype.getEdgeType = function(coord) {
  var i = coord.i, j = coord.j;
  var edge = Math.min(i, this.grid.width - i, j, this.grid.height - j);
  if (edge < 0) {
    return 'past';
  } else if (edge == 0) {
    return 'at';
  } else if (edge == 1) {
    return 'almost';
  } else {
    return 'not';
  }
}

Solver.prototype.classifyMove = function(coords, di, dj) {
  var start = coords[coords.length - 1];
  var i = start.i, j = start.j;
  var next = {i: i+di, j: j+dj};
  var edge = this.getEdgeType(next);
  if (edge == 'past') {
    return null;
  }
  var line = this.grid.lineBetweenEntity(i, j, i+di, j+dj);
  if (line.type == Type.NONE || line.type == Type.DISJOINT) {
    return null;
  }
  // This can probably be done more efficiently.
  if (goog.array.find(coords, function(c) {
    return c.i == next.i && c.j == next.j;
  })) {
    return null;
  }
  return {
    target: next,
    sideCoords: getLeftRightSideCoords(i, j, di, dj),
  }
}

// Two modes of running: with and without target.
// Without a target, just fill in existing group, do not clone.
// With target, we have the possibility of forming a new grouping.
// This method only says 'invalid' if there is an error which cannot be fixed.
// If an error can be fixed with the addition of more nodes (tetrominos, stars),
// try that in the final validation of the searching group.
Solver.prototype.validateSides = function(coord, special, opt_target) {
  var result = {valid: true, next: null};
  var ent = this.grid.cellEntity(coord.i, coord.j);
  if (!ent) {
    if (!opt_target) {
      // In non-target mode, coord must always exist.
      throw Error();
    }
    result.next = new SearchGrouping(opt_target);
    return result;
  }
  // In non-target mode, do not clone, just fill in existing.
  if (!opt_target) {
    result.next = special;
  }
  if (ent && ent.type == Type.SQUARE) {
    console.log(`check square at ${coord.i},${coord.j}: ${ent.color} in ${goog.object.getKeys(special.squares)}`);
    if (goog.object.getCount(special.squares) && !special.squares[ent.color]) {
      result.valid = false;
    } else {
      result.next = result.next || special.clone();
      result.next.squares[ent.color] = true;
    }
  }
  return result;
}

Solver.prototype.possibleMoves = function(state) {
  var nexts = [];
  var width = this.grid.width, height = this.grid.height;

  // Actually process.
  var cur = state.coords[state.coords.length - 1];
  var prev = null;
  var prevEdgeType = null;
  var sideCoords = null;
  if (state.coords.length > 1) {
    prev = state.coords[state.coords.length - 2];
    prevEdgeType = this.getEdgeType(prev);
    sideCoords = getLeftRightSideCoords(prev.i, prev.j, cur.i - prev.i, cur.j - prev.j);
  }
  var thisEdge = this.getEdgeType(cur);

  // Extra analysis to do
  // If a destination group is not valid, and there's no way to make other groups
  // Requiring/forcing analysis, have to go down certain way if black/white border, or if
  // black/white catcorners and two exits already closed.
  // More abstract: Looking ahead several moves, rather than trying every permutation through
  // blank grid area.

  // The conditions under which we might consider validating, to stop ourselves short if we fail.
  var canMove = {left: true, right: true, atAll: true, finish: false, finishValid: false};
  // First, if we're at an end node.
  var hasEndNow = this.grid.pointKeyEntity(cur).type == Type.END;
  // Second, if we have approach the egde head-on, either we've approached an end and both must be
  // valid, or one side is an end and the other one must be valid.
  var reachedEdge = thisEdge == 'at' && prevEdgeType == 'almost';
  if (reachedEdge || hasEndNow) {
    var path = new windmill.Path(state.coords, this.width, this.height);
    var groupings = path.makeGroupings(sideCoords, true /* opt_skipFinalize */);
    var maxSides = groupings.length;
    // Assume all ends are at sides.
    if (maxSides != (reachedEdge ? 2 : 1)) {
      throw Error();
    }
    if (maxSides == 1 && !hasEndNow) {
      throw Error();
    }
    // Now, we have to give everything length 2.
    var valid = ['maybe','maybe'];
    var hasEndSide = [false, false];
    // left is 0, right is 1. Swap the groupings if they don't follow that.
    if (coordKey(sideCoords[1]) in groupings[0].coords) {
      groupings = [groupings[1], groupings[0]];
    }
    if (reachedEdge) {
      var endList = this.endList;
      var hasEnd = function(group) {
        return goog.array.some(endList, function(end) {
          return path.groupingIncludes(group, end.coord, end.drawType);
        });
      }
      hasEndSide = [hasEnd(groupings[0]), hasEnd(groupings[1])];
    }
    for (var side = 0; side <= 1; side++) {
      if (!groupings[side]) {
        continue;
      }
      // Look at validity if we're ending here, but if not, don't bother looking at validity if
      // the other side doesn't have an end segment, because we're not going down that path anyway.
      if (hasEndNow || hasEndSide[1 - side]) {
        var newSpecial = (side == 0 ? state.left : state.right).clone();
        console.log(`valid check side ${side}`);
        valid[side] = goog.object.every(groupings[side].coords, function(coord) {
          var result = this.validateSides(coord, newSpecial);
          console.log(`valid check side ${side} coord ${coord.i},${coord.j}: ${result.valid}`);
          return result.valid;
        }, this);
        // We may want to call newSpecial.validate() under certain circumstances, the
        // non-incremental version, to limit the search tree.
      }
    }
    // If have end now, we must finish.
    canMove.finish = hasEndNow;
    canMove.finishValid = valid[0] && valid[1];
    canMove.left = hasEndSide[0] && valid[1];
    canMove.right = hasEndSide[1] && valid[0];
    console.log(`has end: ${hasEndNow}, ${hasEndSide}. valid: ${valid}`);
  }
  if (canMove.finish) {
    // Yeah, we'll need to continue for multiple finishes. But good enough for now, damnit.
    console.log('FINISH VALID: ' + canMove.finishValid);
    return [];
  }

  for (var horizontal = 0; horizontal <= 1; horizontal++) {
    attempt:
    for (var delta = -1; delta <= 1; delta += 2) {
      var move = this.classifyMove(state.coords, horizontal ? delta : 0, horizontal ? 0 : delta);
      if (move == null) {
        continue;
      }
      // Now, determine if this is one of those edge reaching moments.
      if (reachedEdge && sideCoords) {
        // If we went left, our left should == the previous segment left.
        if (coordKey(sideCoords[0]) == coordKey(move.sideCoords[0]) && !canMove.left) {
         continue;
        }
        // Likewise for right.
        if (coordKey(sideCoords[1]) == coordKey(move.sideCoords[1]) && !canMove.right) {
         continue;
        }
      }
      var newSpecial = [state.left, state.right];
      // Determine if the left and right groupings are still valid, update their state.
      // left is 0.
      for (var side = 0; side <= 1; side++) {
        var sideCoord = move.sideCoords[side];
        var special = newSpecial[side];
        var result = this.validateSides(sideCoord, special, move.target);
        if (!result.valid) {
          continue attempt;
        }
        if (result.next) {
          newSpecial[side] = result.next;
        }
      }
      nexts.push(state.grow(move.target, thisEdge, newSpecial[0], newSpecial[1]));
    }
  }
  return nexts;
}


/** @constructor */
windmill.solve.SearchGrouping = function(start) {
  // The start node. Not currently used, but seems important.
  this.start = start;
  // Map of colors
  this.squares = {};
  // Map of colors to number
  this.stars = {};
}
var SearchGrouping = windmill.solve.SearchGrouping;

SearchGrouping.prototype.specialKey = function() {
  // The key that changes when we find interesting state.
  // Prefer BFS when things are special, DFS when they're not.
  var squares = goog.object.getKeys(this.squares);
  var stars = [];
  goog.object.forEach(this.stars, function(count, star) {
    stars.push(star + ':' + count);
  })
  return [squares.join(','), stars.join(',')].join('-');
}
SearchGrouping.prototype.clone = function() {
  var o = new SearchGrouping();
  o.squares = goog.object.clone(this.squares);
  o.stars = goog.object.clone(this.stars);
  o.start = this.start;
  return o;
}
SearchGrouping.prototype.validate = function() {
  var valid = (
      goog.object.getCount(this.squares) <= 1 &&
      goog.object.every(this.stars, function(count) {
        return count == 2;
      }));
}


// Visualization for backtracking during solving.
/** @constructor */
windmill.solve.Zipper = function(grid, ss) {
  this.grid = grid;
  this.head = ss;
  this.alts = grid.possibleMoves(ss);
  this.tail = [];
  this.curSnake = null;
}
var Zipper = windmill.solve.Zipper;

Zipper.prototype.next = function() {
  if (this.alts.length) {
    var newHead = this.alts.shift();
    this.tail.push([this.head, this.alts]);
    this.head = newHead;
    this.alts = this.grid.possibleMoves(newHead);
    this.show();
  } else {
    this.pop();
  }
}
Zipper.prototype.pop = function() {
  if (!this.tail.length) {
    return;
  }
  var newState = this.tail.pop();
  this.head = newState[0];
  this.alts = newState[1];
  this.show();
}
Zipper.prototype.show = function() {
  if (this.curSnake) {
    this.curSnake.fade(500);
  }
  this.curSnake = this.head.show();
}


/** @constructor */
windmill.solve.SearchState = function(coord) {
  this.coords = [coord];
  this.left = new SearchGrouping();
  this.right = new SearchGrouping();
  this.prevEdgeType = null;
}
var SearchState = windmill.solve.SearchState;

SearchState.prototype.key = function() {
  return [goog.array.map(this.coords, coordKey).join(';'), this.left.key(), this.right.key(), this.prevEdgeType].join('|');
}
SearchState.prototype.grow = function(coord, edge, newLeft, newRight) {
  var o = new SearchState();
  o.coords = goog.array.concat(this.coords, coord);
  o.left = newLeft;
  o.right = newRight;
  o.prevEdgeType = edge;
  // For debug purposes.
  var top = this.coords[this.coords.length - 1];
  o.direction = (coord.i==top.i?['up','down'][coord.j>top.j?1:0]:['left','right'][coord.i>top.i?1:0])
  return o;
}
SearchState.prototype.show = function() {
  var snake = new windmill.Snake(this.coords[0], document.getElementById('gridPath'));
  snake.movement = goog.array.clone(this.coords);
  snake.render();
  return snake;
}
var getLeftRightSideCoords = function(i, j, di, dj) {
  var leftCoord, rightCoord;
  if (di == 1) {
    leftCoord = {i: i, j: j-1};
    rightCoord = {i: i, j: j};
  } else if (di == -1) {
    leftCoord = {i: i-1, j: j};
    rightCoord = {i: i-1, j: j-1};
  } else if (dj == 1) {
    leftCoord = {i: i, j: j};
    rightCoord = {i: i-1, j: j};
  } else if (dj == -1) {
    leftCoord = {i: i-1, j: j-1};
    rightCoord = {i: i, j: j-1};
  }
  return [leftCoord, rightCoord];
}

});
