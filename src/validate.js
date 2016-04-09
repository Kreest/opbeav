goog.provide('windmill.validate');

goog.require('windmill.Grid');
goog.require('windmill.Path');
goog.require('windmill.Shape');
goog.require('windmill.keys');
goog.require('goog.array');
goog.require('goog.functions');
goog.require('goog.object');


goog.scope(function() {
// Other features: Multiple snakes, color snakes (for START and HEXAGON).
var GridProto = windmill.GridProto;
var Entity = GridProto.Entity;
var Type = GridProto.Type;
var Color = GridProto.Color;
var Storage = GridProto.Storage;
var Orientation = GridProto.Orientation;
// Non wire.
var DrawType = GridProto.DrawType;

var Shape = windmill.Shape;

var coordKey = windmill.keys.coordKey;
var fullShapeKey = windmill.keys.fullShapeKey;
var lineKey = windmill.keys.lineKey;
var multiShapeKey = windmill.keys.multiShapeKey;
var shapeKey = windmill.keys.shapeKey;


windmill.validate = {};
windmill.validate.getErrors = function(grid, movement, secondaryMovement) {
  var p;
  if (secondaryMovement) {
    p = new windmill.Path(
        goog.array.concat(movement, secondaryMovement),
        grid.width,
        grid.height,
        [movement.length]);
  } else {
    p = new windmill.Path(
        movement, grid.width,
        grid.height);
  }
  var originalErrors = [];
  // Per-entity checks
  grid.forEachEntity(function(value, i, j, drawType) {
    var type = value.type || Type.BASIC;
    var coord = {i: i, j: j};
    var hasError = false;
    if (type == Type.HEXAGON) {
      if (drawType == DrawType.POINT) {
        if (!(coordKey(coord) in p.coordsMap)) {
          hasError = true;
        }
      } else if (drawType == DrawType.HLINE || drawType == DrawType.VLINE) {
        if (!(lineKey({
              i: coord.i,
              j: coord.j,
              isDown: drawType == DrawType.VLINE
            }) in p.linesMap)) {
          hasError = true;
        }
      }
    } else if (type == Type.TRIANGLE) {
      var lineCount = 0;
      var addLine = function(di, dj, isDown) {
        if (lineKey({
              i: coord.i + di,
              j: coord.j + dj,
              isDown: isDown
            }) in p.linesMap) {
          lineCount++;
        }
      }
      addLine(0, 0, true);
      addLine(0, 0, false);
      addLine(1, 0, true);
      addLine(0, 1, false);
      var expected = value.triangle_count || 1;
      if (lineCount != expected) {
        hasError = true;
      }
    }
    if (hasError) {
      originalErrors.push({coord: coord, drawType: drawType});
    }
  });

  var allowedErrors = [];
  var specialErrors = [];
  var allErrors = [];
  var messages = [];
  var countCancelled = false;

  var groupings = p.makeGroupings();
  // Color DSL
  var all = undefined;
  var byType = function(type, opt_fn) {
    return function(val) {
      return val.cell.type == type && (opt_fn ? opt_fn(val.cell) : true);
    }
  }
  var getCount = function(vals) {
    return vals.length || null;
  }
  var filterColorsMap = function(colorsMap, opt_filter, opt_map) {
    return goog.object.filter(goog.object.map(colorsMap, function(vals) {
      if (opt_filter) {
        vals = goog.array.filter(vals, opt_filter);
      }
      if (opt_map) {
       return opt_map(vals);
      }
      return vals;
    }), function(vals) {
      // Remove 0 and empty list.
      return opt_map ? goog.isDefAndNotNull(vals) : vals.length != 0;
    });
  }
  goog.array.forEach(groupings, function(group) {
    var allVals = goog.array.map(goog.object.getValues(group.coords),
        function(coord) {
      var cell = grid.cellKeyEntity(coord);
      return {coord: coord, cell: cell};
    });
    // Errors...
    var expectedErrors = goog.array.count(allVals, byType(Type.ERROR));
    var remainingErrors = expectedErrors;
    var errorsFeasible = expectedErrors > 0;

    var groupingErrors = [];
    var allowedGroupingErrors = [];
    function addCellErrors(vals, opt_allowed) {
      if (opt_allowed) {
        remainingErrors -= vals.length;
      }
      goog.array.extend(
        opt_allowed ? allowedGroupingErrors : groupingErrors,
        goog.array.map(vals, function(val) {
          return {coord: val.coord, drawType: DrawType.CELL};
        }));
    }

    var colorsMap = {};
    goog.array.forEach(allVals, function(val) {
      var cell = grid.cellKeyEntity(val.coord);
      if (val.cell.type == Type.BASIC) {
        return;
      }
      var color = val.cell.color;
      // For now, don't allow arbitrary colors of all shapes, but force colored
      // ones to have that color.
      if (!color) {
        if (val.cell.type == Type.TETRIS && val.cell.shape) {
          color = val.cell.shape.negative ? Color.BLUE : Color.YELLOW;
        } else if (val.cell.type == Type.ERROR) {
          color = Color.WHITE;
        } else if (val.cell.type == Type.TRIANGLE) {
          color = Color.ORANGE;
        } else {
          return;
        }
      }
      if (!colorsMap[color]) {
        colorsMap[color] = [];
      }
      colorsMap[color].push(val);
    });
    var colorCounts = filterColorsMap(colorsMap, all, getCount);

    // First, check squares.
    var squareColorsMap = filterColorsMap(colorsMap, byType(Type.SQUARE));
    if (goog.object.getCount(squareColorsMap) > 1) {
      var squareColorCounts = [];
      goog.object.forEach(
          filterColorsMap(squareColorsMap, all, getCount),
          function(count, color) {
            squareColorCounts.push([count, color]);
          });
      // Sort with key [count, color], so lowest count first
      squareColorCounts.sort();
      // In default case, show errors for everything, or less between two colors.
      var minColorCount = 0;
      if (squareColorCounts.length == 2) {
        minColorCount = squareColorCounts[0][0];
      }
      goog.object.forEach(squareColorsMap, function(vals, color) {
        if (!minColorCount || vals.length == minColorCount) {
          addCellErrors(vals);
        }
      });
      if (remainingErrors >= 0) {
        // If we can use errors to resolve these conflicts, do it.
        // Requires sum(squareColorCounts[0:-2] <= remainingErrors
        goog.object.forEach(squareColorsMap, function(vals, color) {
          if (color != squareColorCounts[squareColorCounts.length - 1][1]) {
            addCellErrors(vals, true /* opt_allowed */);
          }
        });
      }
    }
    // Then, stars.
    // TODO: How this interacts with errors is so broken.
    // Get the two ways to resolve errors (eliminating all stars,
    // eliminating all except two of color), use that to inform
    // tetris error count, and do *this* at the very end.
    var starColorsMap = filterColorsMap(colorsMap, byType(Type.STAR));
    if (goog.object.getCount(starColorsMap) > 0) {
      goog.object.forEach(starColorsMap, function(vals, color) {
        var colorTotal = colorCounts[color];
        if (colorTotal != 2) {
          // Default case.
          addCellErrors(vals);
          // If any allowed...
          if (remainingErrors >= 0) {
            // If we can just remove all the stars, that's easy.
            // This should happen in the lone star case as well.
            var minCount = vals.length;
            // If we can remove enough stars (but not all) to leave two left, do
            // that too. So xxo -> xo, xxxo -> xo, xxx -> xx.
            if (vals.length > 1) {
              minCount = Math.min(minCount, colorTotal - 2);
            }
            addCellErrors(vals.slice(0, minCount), true /* opt_allowed */);
          }
        }
      });
    }
    // Second-to-last: non-tetris errors. Excluding tetris, as that
    // affects how we search in some cases.
    // TODO: See note above about stars.
    var errorsInGroup = [];
    if (remainingErrors >= 0) {
      // Now, look through errors not specific to groupings.
      errorsInGroup = goog.array.filter(originalErrors, function(error) {
        return p.groupingIncludes(group, error.coord, error.drawType);
      });
      remainingErrors -= errorsInGroup.length;
    }
    // If there are zero errors, it must be in tetris.
    // Tetris... the biggie.
    var tetrisVals = goog.array.filter(allVals, byType(Type.TETRIS));
    if (tetrisVals.length > 0) {
      var tetrisErrors = windmill.validate.validateTetris_(
          group.shape, tetrisVals, remainingErrors >= 0 ? remainingErrors : 0);
      if (!tetrisErrors.success) {
        if (tetrisErrors.allowed) {
          // Length should be exactly equal to exactly remainingErrors.
          addCellErrors(tetrisErrors.allowed, true /* optAllowed */);
        } else {
          // We're not going to bother figure out how much under Tetris gets us.
          errorsFeasible = false;
        }
        addCellErrors(tetrisVals);
      }
      if (tetrisErrors.multipleErrors) {
        messages.push('Won\'t mix multiple Ys and polyominos ' +
            '(missing feature).');
      }
      if (tetrisErrors.timedOut) {
        messages.push('Timed out validating polyominos. Too clever!');
      }
      if (tetrisErrors.countCancelled) {
        countCancelled = true;
      }
    }
    errorsFeasible &= remainingErrors == 0;
    if (errorsFeasible) {
      if (errorsInGroup.length) {
        goog.array.extend(allowedErrors, errorsInGroup);
        goog.array.forEach(errorsInGroup, function(err) {
          goog.array.remove(originalErrors, err);
        });
      }
      goog.array.extend(allowedErrors, allowedGroupingErrors);
      if (allowedGroupingErrors.length + errorsInGroup.length !=
          expectedErrors) {
        throw new Error();
      }
    } else {
      addCellErrors(goog.array.filter(allVals, byType(Type.ERROR)));
      goog.array.extend(allErrors, groupingErrors);
    }
  });
  goog.array.extend(allErrors, originalErrors);
  // Slight annoyingness optimization: Only do this on success.
  if (countCancelled && !allErrors.length) {
    messages.push('Warning: cancelling blue and yellow polyominos based on ' +
        'count, not shape (missing feature).');
  }
  return {
    errors: allErrors,
    allowedErrors: allowedErrors,
    specialErrors: specialErrors,
    messages: messages
  };
}

windmill.validate.validateTetris_ = function(
    gridShape, tetrisVals, expectedErrors) {
  var result = {success: false};
  if (tetrisVals.length == 0) {
    result.success = true;
    return result;
  }
  var trivialErrorCancellation = tetrisVals.length == expectedErrors;
  var tetrisState = new TetrisState(tetrisVals, gridShape);

  result.success = windmill.validate.attemptTetris_(
      tetrisState,
      tetrisState.getValidationAttempts(0)[0],
      result);
  if (expectedErrors == 0 || trivialErrorCancellation) {
    if (trivialErrorCancellation) {
      result.allowed = tetrisVals;
    }
    return result;
  } else {
    if (expectedErrors > 1) {
      // Requires quadratic+ filtering of stuff... eh.
      result.multipleErrors = true;
      return result;
    }
    if (!result.success) {
      var attempts = tetrisState.getValidationAttempts(1);
      goog.array.some(attempts, function(attempt) {
        if (windmill.validate.attemptTetris_(tetrisState, attempt, result)) {
          result.allowed = attempt.excluded;
          return true;
        }
        return false;
      });
    }
    return result;
  }
}

windmill.validate.attemptTetris_ = function(tetrisState, attempt, result) {
  var search = windmill.validate.attemptTetrisSearch_(
      tetrisState, attempt, result);
  if (typeof search == 'string' && tetrisState.logLevel) {
    window['_ts'] = tetrisState;
    tetrisState.printSearch(search);
  }
  return !!search;
}
windmill.validate.attemptTetrisSearch_ =
    function(tetrisState, attempt, result) {
  if (attempt.positiveCount == attempt.negativeCount) {
    result.countCancelled = true;
    return true;
  } else if (attempt.positiveCount < attempt.negativeCount) {
    return false;
  } else if (
      !((attempt.positiveCount - attempt.negativeCount ==
            tetrisState.gridCount) ||
        attempt.positiveCount == attempt.negativeCount)) {
    return false;
  }
  // How to handle (5x5 chunk, handful of negatives) case?
  // Allow placement of blocks which do not fit in bounds,
  // to a certain # of negative spaces
  var iters = 0;
  var queue = [tetrisState.getStartState(attempt)];
  while (queue.length) {
    // TODO: Use stateId for this, better indicator of CPU used.
    if ((++iters) % 50 == 0 && tetrisState.timedOut()) {
      result.timedOut = true;
      return false;
    }
    // It really does need to be BFS (an actual queue) for demonic cases.
    // TODO: This works very poorly when branching factor is very high,
    // for instance with dozens of unimos. Can we use more depth there?
    var node = queue.shift();
    // Success??
    // First: No more grid (only gets 0 width and height if empty).
    if (node.grid.width == 0 &&
        node.grid.height == 0 &&
        // Second: No more nodes to place.
        node.remaining.length == 0 &&
        // Third: No more negatives which need to be used.
        node.negative.length == 0 &&
        // Fourth: No negative outside-of-grid spaces that need to be
        // compensated for.
        !node.negativeGrid) {
      // It's a Christmas miracle!
      return node.key;
    }
    if (node.key in tetrisState.gridProgressTransitions) {
      continue;
    }
    var transitions = [];
    // There are two types of states: we have to remove cells from the grid by filling in
    // positives, or we already used up negative spaces to do the first thing and we need to
    // expand the grid by adding negatives.
    //
    // Pathological case:
    // Note that as soon as we use up any negatives, we immediately try to place them all, even if
    // there are still positives to go. So the worst case would be if we have to try all of the
    // permutations of negatives before trying the only place a single positive could be. (think
    // n negative vertical pieces of size 1 to n, and a n-by-n staircase half-block).
    //
    // TODO: This can be compensated for by first allowing removing tetris pieces with a negative
    // grid present, and second choosing the piece by safety score independent of negativity.
    // Also, prefer to use negatives without grid additions, greatly preferring to
    // avoid those branches.
    // Maximally prefer branches which will in the most grid nodes.
    // Way to represent removing tetrises with a negative grid: mark nodes
    // in the negative grid as having counts of just how negative they are.
    // Meanwhile, just put a cap on the number of iterations.
    // Why not play a nice game of fez instead??!
    // TODO: Implement better logging than commenting out lines of code.
    //console.log(`Node ==================== ndi${node.stateId}`); Shape.print(node.grid);
    if (node.negativeGrid && node.negative.length) {
      // Fill in the negatives.
      //console.log('Negative grid ===================='); Shape.print(node.negativeGrid);
      var unique = uniqueShapes(node.negative);
      goog.array.forEach(unique.uniqueShapes, function(tetris) {
        //console.log('Tetris --------' + (tetris.multiple ? 'm' : '.')); Shape.print(tetris);
        var newStates = windmill.validate.addNegativeToGrid_(
            node.grid, node.negativeGrid, tetris, tetrisState.shapeOrientations);
        if (!newStates.length) {
          return;
        }
        var remainingNegative = unique.removeFn(tetris);
        goog.array.forEach(newStates, function(newState) {
          var newGrid = newState.grid;
          var newNegativeGrid = newState.negativeGrid;
          //console.log(`Result -------- ${remainingNegative.length} remaining, id${stateId}`); Shape.print(newGrid);
          //console.log(`Result negative --------`); Shape.print(newNegativeGrid);

          var state = {grid: newGrid, remaining: node.remaining, negative: remainingNegative};
          if (newNegativeGrid) {
            state.negativeGrid = newNegativeGrid;
          }
          var key = tetrisState.registerGridProgressKey(state);
          // Actually, we do even need to calculate the key?
          // See note below on gridProgressTransitions mutation.
          //console.log(`${node.key} -> ${state.key}`);
          transitions.push(key);
          queue.push(state);
        });
      });
    } else if (node.remaining) {
      // We're in positive land.
      // Get the biggest negative dimensions, which determines
      // how crazy we are about placing out of bounds.
      var maxNeg = Shape.getDimensions(node.negative);
      var unique = uniqueShapes(node.remaining);
      goog.array.forEach(unique.uniqueShapes, function(tetris) {
        //console.log('Tetris --------' + (tetris.multiple ? 'm' : '.')); Shape.print(tetris);
        var newStates = windmill.validate.removeTetrisFromGrid_(node.grid, tetris, tetrisState.shapeOrientations, maxNeg);
        if (!newStates.length) {
          return;
        }
        var remaining = unique.removeFn(tetris);
        goog.array.forEach(newStates, function(newState) {
          var newGrid = newState.grid;
          //console.log(`Result -------- ${remaining.length} remaining, id${stateId}`); Shape.print(newGrid);
          var state = {grid: newGrid, remaining: remaining, negative: node.negative};
          if (newState.negativeGrid) {
            state.negativeGrid = newState.negativeGrid;
          }
          state.index = newState.index;
          var key = tetrisState.registerGridProgressKey(state);
          transitions.push(key);
          queue.push(state);
        });
      });
    }
    // TODO: The value in this map isn't really used for anything.
    // A boolean would probably be fine.
    tetrisState.registerGridProgressTransition(node.key, transitions);
  }
  return false;
}

windmill.validate.addNegativeToGrid_ =
    function(grid, negativeGrid, originalTetris, shapeOrientations) {
  var tetrises = originalTetris.free && shapeOrientations
      ? shapeOrientations[shapeKey(originalTetris)]
      : [originalTetris];
  var coords = [];
  var requiredAdditions = 1;
  if (tetrises.length == 1) {
    var shapeCount = goog.array.count(originalTetris.grid, goog.functions.identity);
    var gridCount = goog.array.count(negativeGrid.grid, goog.functions.identity);
    if (shapeCount == gridCount) {
      requiredAdditions = shapeCount;
    }
  }
  goog.array.forEach(tetrises, function(tetris) {
    var negInfo = {
        width: tetris.width,
        height: tetris.height,
        count: tetris.width*tetris.height - requiredAdditions};
    var reverseGridOffset = {
      i: -negativeGrid.offset.i,
      j: -negativeGrid.offset.j
    }
    goog.array.extend(
        coords,
        Shape.getGridFits(negativeGrid, tetris, negInfo, grid, reverseGridOffset));
  });
  return goog.array.filter(goog.array.map(coords, function(coord) {
    var i = coord.i, j = coord.j, tetris = coord.shape;
    // Need to update both negative grid (remove placed tetris) and regular grid
    // (add placed tetris not already in negative grid)
    var newGrid = grid;
    var newNegativeGrid = {
      grid: goog.array.clone(negativeGrid.grid),
      width: negativeGrid.width,
      height: negativeGrid.height,
      offset: {i: negativeGrid.offset.i, j: negativeGrid.offset.j}
    };
    // First, regular negative grid cancellation. Super-straightforward.
    Shape.setOnGrid(newNegativeGrid, coord, false);
    newNegativeGrid = Shape.reduce(newNegativeGrid);
    // Now, modifications to main grid. Negative of negative becomes positive.
    if (coord.negativeShape) {
      var gridLeft = Math.abs(Math.min(0, i));
      var gridTop = Math.abs(Math.min(0, j));
      var tetrisLeft = Math.max(0, i);
      var tetrisTop = Math.max(0, j);
      newGrid = Shape.expand(newGrid,
          gridLeft,
          gridTop,
          Math.max(gridLeft + newGrid.width, tetrisLeft + tetris.width),
          Math.max(gridTop + newGrid.height, tetrisTop + tetris.height),
          [coord, newNegativeGrid.offset]);
      var negativeGridToGridTransform = Shape.newIndexTransformer(
          grid, -negativeGrid.offset.i, -negativeGrid.offset.j,
          negativeGrid.width);
      // Clone the shape if necessary.
      if (grid == newGrid) {
        newGrid = {
          grid: goog.array.clone(grid.grid),
          width: grid.width,
          height: grid.height
        };
      }
      Shape.setOnGrid(newGrid, coord, true, negativeGridToGridTransform);
      newGrid = Shape.reduce(newGrid, [newNegativeGrid.offset]);
      Shape.setMultiple(newGrid);
    }
    return {
      grid: newGrid,
      negativeGrid: newNegativeGrid.width ? newNegativeGrid : null
    }
  }), goog.functions.identity);
}
windmill.validate.removeTetrisFromGrid_ = function(
    grid, originalTetris, shapeOrientations, negInfo) {
  // TODO: Allow doing this with a negativeGrid (requires being able to double-count
  // nodes for filling in negatives).
  var negativesRemaining = !!negInfo;
  var tetrises = originalTetris.free && shapeOrientations
      ? shapeOrientations[shapeKey(originalTetris)]
      : [originalTetris];
  var coords = [];
  goog.array.forEach(tetrises, function(tetris) {
    goog.array.extend(coords, Shape.getGridFits(grid, tetris, negInfo));
  });
  return goog.array.filter(goog.array.map(coords, function(coord, index) {
    // Actually fill in the grid with the shape.
    // If we need negatives to do this, fill in the real grid with the caveat
    // that the negative space must be first filled in to continue.
    var i = coord.i, j = coord.j, tetris = coord.shape;
    var newGrid = grid;
    var negativeGrid = null;
    if (coord.negativeShape) {
      var negativeGridOffset = {i: i, j: j};
      // Expand the real grid and negative grid as necessary.
      // For the real grid, push it down and right if the tetris match is off in left field,
      // like negative i or j.
      var gridLeft = Math.abs(Math.min(0, i));
      var gridTop = Math.abs(Math.min(0, j));
      // Now the same for tetris, push it down and right if it's in the middle
      // of the grid.
      // Aka translate the tetris coordinate system to the new grid coordinate system.
      var tetrisLeft = Math.max(0, i);
      var tetrisTop = Math.max(0, j);
      // Left offset, right offset, total width, total height.
      newGrid = Shape.expand(newGrid,
          gridLeft,
          gridTop,
          Math.max(gridLeft + newGrid.width, tetrisLeft + tetris.width),
          Math.max(gridTop + newGrid.height, tetrisTop + tetris.height),
          [coord, negativeGridOffset]);
      // Add negative grid, which is currently in the tetris coord system.
      negativeGrid = coord.negativeShape;
      //console.log('********** Prenegative'); Shape.print(negativeGrid);
      negativeGrid.offset = negativeGridOffset;
      negativeGrid = Shape.reduce(negativeGrid);
      //console.log('********** Negative'); Shape.print(negativeGrid);
    }
    // Clone the shape if necessary.
    if (grid == newGrid) {
      newGrid = {
        grid: goog.array.clone(grid.grid),
        width: grid.width,
        height: grid.height
      };
    }
    Shape.setOnGrid(newGrid, coord, false);

    // Do some simplifications if we're subtracting normally.
    newGrid = Shape.reduce(newGrid, negativeGrid ? [negativeGrid.offset] : undefined);
    // Don't unnecessarily split up connected components to limit search space.
    // Except if the grid or tetris is split up, or there are negatives in our future.
    Shape.setMultiple(newGrid);
    if (!(tetris.multiple || grid.multiple || negativesRemaining) && newGrid.multiple) {
      return null;
    }

    var answer = {grid: newGrid};
    if (negativeGrid) {
      answer.negativeGrid = negativeGrid;
    }
    answer.index = index;
    return answer;
  }), goog.functions.identity);
}

/** @constructor */
var TetrisState = function(vals, grid) {
  // Map from shape key to list of orientations.
  this.shapeOrientations = {};
  // State is: list of remaining shapes (including their orientations)
  this.gridProgressByKey = {};
  this.gridProgressTransitions = {};
  this.reverseGridProgressTransitions = {};
  this.statesById = {};
  this.grid = grid;
  Shape.setMultiple(grid);
  // All shape information.
  this.gridCount = goog.array.count(grid.grid, goog.functions.identity);
  this.positive = [];
  this.negative = [];
  this.positiveCount = 0;
  this.negativeCount = 0;
  this.shapeLocations = {};
  this.stateId = 100;
  // To debug polyominos: 0 for nothing, 1 for success, 2 for all.
  this.logLevel = 0;

  goog.array.forEach(vals, function(val) {
    var shape = val.cell.shape;
    var count = goog.array.count(shape.grid, goog.functions.identity);
    var repr = {
      grid: shape.grid,
      width: shape.width,
      height: shape.grid.length / shape.width
    };
    Shape.setMultiple(repr);
    if (shape.free) {
      repr = this.registerFreeShape(repr);
    }
    this.shapeLocations[fullShapeKey(repr)] = val;
    if (shape.negative) {
      this.negative.push(repr);
      this.negativeCount += count;
    } else {
      this.positive.push(repr);
      this.positiveCount += count;
    }
  }, this);
  var safetyScore = function(s) {
    // How safe to try out first?
    // i.e. Prunes the most future options to try sooner.
    // Score: Size * Number of cc / Number of orientations
    return (s.width*s.height) * (s.multiple ? 2 : 1) /
        (s.index ? s.index + 1 : 1);
  }
  var safestFirst = function(s1, s2) {
    return safetyScore(s2) - safetyScore(s1);
  };
  this.positive.sort(safestFirst);
  this.negative.sort(safestFirst);
  // Some pathological situation avoiding.
  this.startTime = new Date();
}
TetrisState.prototype.timedOut = function() {
  return !this.logLevel && new Date() - this.startTime > 4*1000;
}
TetrisState.prototype.printSearch = function(end) {
  var key = end;
  var i = 100;
  var remainingShapes = function(shapes) {
    return goog.array.map(shapes, function(remain) {
      var height = remain.grid.length / remain.width;
      return remain.width + 'x' + remain.height + ' ' +
          goog.array.map(remain.grid, function(r) { return 0 + r; });
    }).join(', ');
  }
  while (key && i-- > 0) {
    var state = this.gridProgressByKey[key];
    console.log('State ' + state.stateId + ' ============== ' + state.index);
    console.log('----- Grid');
    Shape.print(state.grid);
    console.log('Remaining: ' + remainingShapes(state.remaining));
    console.log('----- Negative grid');
    if (state.negativeGrid) {
      Shape.print(state.negativeGrid);
    }
    if (state.negative.length) {
      console.log('Remaining: ' + remainingShapes(state.negative));
    }
    key = this.reverseGridProgressTransitions[key];
  }
}
TetrisState.prototype.registerGridProgressTransition =
    function(from, tos) {
  this.gridProgressTransitions[from] = tos;
  if (!this.logLevel) {
    return;
  }
  goog.array.forEach(tos, function(to) {
    this.reverseGridProgressTransitions[to] = from;
  }, this);
}
TetrisState.prototype.registerGridProgressKey = function(state) {
  var key = multiShapeKey(
      state.grid, state.remaining, state.negative, state.negativeGrid);
  state.key = key;
  if (this.logLevel) {
    state.stateId = this.stateId++;
    this.statesById[state.stateId] = key;
  }
  if (!(key in this.gridProgressByKey)) {
    this.gridProgressByKey[key] = state;
  }
  return key;
}
TetrisState.prototype.rotateClockwise = function(grid, width) {
  // Static utility function, could move to shape.js
  var height = grid.length / width;
  var newGrid = Array(grid.length);
  var index = 0;
  // Read up from bottom left.
  for (var i = 0; i < width; i++) {
    for (var j = width * (height - 1) + i; j >= 0; j -= width) {
      newGrid[index++] = grid[j];
    }
  }
  return newGrid;
}
TetrisState.prototype.registerFreeShape = function(originalShape) {
  var originalKey = shapeKey(originalShape);
  if (originalKey in this.shapeOrientations) {
    var orient = this.shapeOrientations[originalKey];
    return orient[0];
  }
  var orientationSet = {};
  orientationSet[originalKey] = originalShape;
  var curShape = originalShape;
  for (var index = 0; index < 3; index++) {
    var newGrid = this.rotateClockwise(curShape.grid, curShape.width);
    curShape = {height: curShape.width, width: curShape.height, grid: newGrid};
    var newKey = shapeKey(curShape);
    if (!(newKey in orientationSet)) {
      orientationSet[newKey] = curShape;
    }
  }
  var orientations = [];
  goog.object.forEach(orientationSet, function(shape, key) {
    this.shapeOrientations[key] = orientations;
    orientations.push(shape);
    shape.multiple = originalShape.multiple;
    shape.free = true;
  }, this);
  return orientations[0];
}
TetrisState.prototype.getValidationAttempts = function(expectedErrors) {
  var attempts = [];
  if (expectedErrors == 0 || expectedErrors > 1) {
    attempts.push(new TetrisValidationAttempt(
          this.positive,
          this.negative,
          this.positiveCount,
          this.negativeCount));
  } else {
    // This should really be recursive (urg) for >1 case
    var pos = uniqueShapes(this.positive);
    goog.array.forEach(pos.uniqueShapes, function(shape) {
      var count = goog.array.count(shape.grid, goog.functions.identity);
      attempts.push(new TetrisValidationAttempt(
            pos.removeFn(shape),
            this.negative,
            this.positiveCount - count,
            this.negativeCount,
            [this.shapeLocations[fullShapeKey(shape)]]));
    }, this);
    var neg = uniqueShapes(this.negative);
    goog.array.forEach(neg.uniqueShapes, function(shape) {
      var count = goog.array.count(shape.grid, goog.functions.identity);
      attempts.push(new TetrisValidationAttempt(
            this.positive,
            neg.removeFn(shape),
            this.positiveCount,
            this.negativeCount - count,
            [this.shapeLocations[fullShapeKey(shape)]]));
    }, this);
  }
  return attempts;
}
TetrisState.prototype.getStartState = function(attempt) {
  var grid = this.grid;
  var negativeGrid = null;
  if (attempt.positive == attempt.negative) {
    grid = {grid: [], width: 0, height: 0};
    negativeGrid = {grid: [], width: 0, height: 0};
  }
  var startNode = {
      grid: grid,
      remaining: attempt.positive,
      negative: attempt.negative,
      negativeGrid: negativeGrid,
  };
  this.registerGridProgressKey(startNode);
  return startNode;
}

/** @constructor */
var TetrisValidationAttempt = function(
    positive, negative, positiveCount, negativeCount, opt_excluded) {
  this.positive = positive;
  this.negative = negative;
  this.positiveCount = positiveCount;
  this.negativeCount = negativeCount;
  this.excluded = opt_excluded || [];
}
var uniqueShapes = function(shapes) {
  var uniqueRemaining = [];
  goog.array.removeDuplicates(shapes, uniqueRemaining, shapeKey);
  return {
    uniqueShapes: uniqueRemaining,
    removeFn: function(shape) {
      var left = goog.array.clone(shapes);
      if (!goog.array.remove(left, shape)) {
        throw Error();
      }
      return left;
    }
  }
}

});
