goog.provide('windmill.Shape');

goog.require('goog.array');
goog.require('goog.functions');


goog.scope(function() {

// TODO: Make a this Shape class, rather than using
// {grid: !Array.<boolean>, width: number, height: number}
// Also TODO: Use a JS bigint data structure rather than Array.<boolean> for
// improved performance, but that's further down the line...
windmill.Shape = {};
var Shape = windmill.Shape;


// Expand the shape by increasing the left or top offset by the given amount,
// and to the given width and height.
// Also mutate coords in the old grid system to move to the new grid system.
Shape.expand = function(shape, left, top, width, height, opt_relativeCoords) {
  if (width < shape.width + left || height < shape.height + top) {
    throw Error();
  }
  if (width == shape.width && height == shape.height) {
    return shape;
  }
  var expanded = {
    width: width,
    height: height,
    grid: goog.array.map(
        goog.array.repeat(undefined, width * height),
        function(ignore, index) {
          var i = index % width;
          var j = Math.floor(index / width);
          return i >= left && j >= top &&
            i < left + shape.width && j < top + shape.height &&
            !!shape.grid[(i - left) + shape.width*(j - top)];
        })
  }
  if (shape.offset) {
    expanded.offset = {
      i: shape.offset.i - left,
      j: shape.offset.j - top
    }
  }
  if (opt_relativeCoords) {
    goog.array.forEach(opt_relativeCoords, function(coord) {
      coord.i += left;
      coord.j += top;
    });
  }
  return expanded;
}
// Reduce the shape to eliminate all 'whitespace'.
// Also mutate coords in the old grid system to move to the new grid system.
Shape.reduce = function(shape, opt_relativeCoords) {
  var w = shape.width;
  var mini = Infinity, minj = Infinity, maxi = -Infinity, maxj = -Infinity;
  for (var index = 0; index < shape.grid.length; index++) {
    var i = index % w;
    var j = Math.floor(index / w);
    if (shape.grid[index]) {
      mini = Math.min(mini, i);
      maxi = Math.max(maxi, i);
      minj = Math.min(minj, j);
      maxj = Math.max(maxj, j);
    }
  }
  if (!isFinite(mini)) {
    return {grid: [], width: 0, height: 0, offset: shape.offset};
  }
  var width = maxi - mini + 1;
  var height = maxj - minj + 1;
  if (width == shape.width && height == shape.height) {
    return shape;
  }
  var reduced = {
    width: width,
    height: height,
    grid: goog.array.filter(shape.grid, function(value, index) {
      var i = index % w;
      var j = Math.floor(index / w);
      return mini <= i && i <= maxi && minj <= j && j <= maxj;
    })
  }
  if (shape.offset) {
    reduced.offset = {
      i: shape.offset.i + mini,
      j: shape.offset.j + minj
    }
  }
  if (opt_relativeCoords) {
    goog.array.forEach(opt_relativeCoords, function(coord) {
      coord.i -= mini;
      coord.j -= minj;
    });
  }
  return reduced;
}
Shape.print = function(shape) {
  if (!shape || shape.width * shape.height == 0) {
    console.log('It\'s a Christmas miracle!');
    return;
  }
  var row = 0;
  var s = [];
  for (var index = 0; index < shape.grid.length; index++) {
    s.push(shape.grid[index] ? '▢' : '·');
    if ((index+1) % shape.width == 0) {
      console.log((row++) + ' >' + s.join('') + '<');
      s = [];
    }
  }
}
Shape.getDimensions = function(shapes) {
  if (!shapes.length) {
    return null;
  }
  var width = -Infinity, height = -Infinity, count = 0;
  goog.array.forEach(shapes, function(shape) {
    width = Math.max(width, shape.width);
    height = Math.max(height, shape.height);
    if (shape.free) {
      width = Math.max(width, shape.height);
      height = Math.max(height, shape.width);
    }
    count += goog.array.count(shape.grid, goog.functions.identity);
  });
  return {width: width, height: height, count: count};
}

// Take a shape, an offset in that shape's coordinate system,
// and the width of the target ('view') coordinate system.
// Produce a function which takes an index in view coordinate
// system and produces an index in the shape's coordinate system.
// If you are certain the view shape fits entirely within this shape,
// the coordinates will be valid. Otherwise we need to explicitly check
// bounds, so pass in a truthy opt_checkValid.
Shape.newIndexTransformer = function(shape, i, j, viewWidth, opt_checkValid) {
  var baseOffset = i + j*shape.width;
  // Maybe just split this into 2 functions, to minimize branching.
  return function(index) {
    var viewJOffset = Math.floor(index / viewWidth);
    // TODO: Find where this should be passed in and pass it in.
    // Otherwise, allows http://i.imgur.com/NqDrkNw.png to happen in
    // combination with other bug from fix commit.
    if (opt_checkValid || true) {
      var viewI = (index % viewWidth) + i;
      if (viewI < 0 || viewI >= shape.width ||
          viewJOffset + j < 0 || viewJOffset + j >= shape.height) {
        return null;
      }
    }
    var extraOffset = viewJOffset*(shape.width - viewWidth);
    return index + baseOffset + extraOffset;
  }
}

// Fit shape on grid, allowing for negatives acording to negInfo,
// but never allowing cells in opt_blacklistedGrid (which must be in same
// coordinate system as grid after an optional offset).
// In the presence of blacklisted grid, we will not require all cells in the
// shape to be on main grid, just at least one.
Shape.getGridFits = function(
    grid, shape, negInfo, opt_blacklist, opt_blacklistOffset) {
  var negativesRemaining = !!negInfo;
  negInfo = negInfo || {width: 0, height: 0, count: 0};
  var coords = [];
  if (shape.width > grid.width+negInfo.width*2 ||
      shape.height > grid.height+negInfo.height*2) {
    return coords;
  }
  var missingIndices, missingCount;
  var validGridIndex = true;
  for (var i = -negInfo.width;
      i <= grid.width - shape.width + negInfo.width;
      i++) {
    tryCoord:
    for (var j = -negInfo.height;
        j <= grid.height - shape.height + negInfo.height;
        j++) {
      if (negativesRemaining) {
        missingIndices = [];
        missingCount = 0;
      }
      var gridTransformer = Shape.newIndexTransformer(
          grid, i, j, shape.width, negativesRemaining);
      var blacklistTransformer = null;
      if (opt_blacklist) {
        var offset = opt_blacklistOffset || {i: 0, j: 0};
        blacklistTransformer = Shape.newIndexTransformer(
            opt_blacklist, offset.i, offset.j, grid.width, negativesRemaining);
      }
      for (var index = 0; index < shape.width * shape.height; index++) {
        var gridIndex = gridTransformer(index);
        if (shape.grid[index] &&
            ((gridIndex == null || !grid.grid[gridIndex]) ||
                (blacklistTransformer &&
                 opt_blacklist.grid[blacklistTransformer(gridIndex)]))) {
          if (negativesRemaining && missingCount < negInfo.count) {
            // Establish missing indices in the polyomino's coordinates.
            // Fun JS feature: sparse arrays.
            missingIndices[index] = true;
            missingCount++; 
          } else {
            continue tryCoord;
          }
        }
      }
      var answer = {i: i, j: j, shape: shape};
      // Note that if missingCount > 0, missingIndices is now its own shape.
      // Albeit a sparse one.
      if (missingCount > 0) {
        answer.negativeShape = {
          grid: missingIndices,
          width: shape.width,
          height: shape.height
        };
      }
      coords.push(answer);
    }
  }
  return coords;
}
// Sets a shape, as returned by getGridFits, on the grid the given grid
// offset. If getGridFits was calculated using a different intermediate grid,
// opt_addlTransform should be used to map it to the given grid.
Shape.setOnGrid = function(grid, coord, value, opt_addlTransform) {
  var i = coord.i, j = coord.j, shape = coord.shape;
  var gridTransformer =
      Shape.newIndexTransformer(grid, i, j, shape.width, true);
  for (var index = 0; index < shape.width * shape.height; index++) {
    if (shape.grid[index]) {
      var gridIndex = gridTransformer(index);
      if (opt_addlTransform) {
        gridIndex = opt_addlTransform(gridIndex);
      }
      if (gridIndex != null) {
        grid.grid[gridIndex] = value;
      }
    }
  }
}
// Add a 'multiple' field to the shape which indicates if it contains
// multiple connected components or not.
// This is very useful for reducing branching complexity in shape search.
Shape.setMultiple = function(shape) {
  // Use vanilla flood fill.
  // We don't want to mutate the grid, so use an auxiliary array
  // to indicate that a cell has been visited and 'turned off'.
  var colored = [];
  var grid = shape.grid;
  var start = goog.array.indexOf(grid, true);
  if (start == -1) {
    shape.multiple = false;
    return;
  }
  var queue = [start];
  while (queue.length) {
    var node = queue.pop();
    var west = node;
    var east = node;
    var lineStart = Math.floor(node / shape.width) * shape.width
    var lineEnd = lineStart + shape.width;
    for (; west > lineStart && grid[west] && !colored[west]; west--) {};
    for (; east < lineEnd && grid[east] && !colored[east]; east++) {};
    for (var index = west; index < east; index++) {
      colored[index] = true;
      var north = index - shape.width;
      var south = index + shape.width;
      if (north >= 0 && grid[north] && !colored[north]) {
        queue.push(north);
      }
      if (south < grid.length && grid[south] && !colored[south]) {
        queue.push(south);
      }
    }
  }
  shape.multiple = !!goog.array.find(grid, function(val, index) {
    return val && !colored[index];
  });
}

});
