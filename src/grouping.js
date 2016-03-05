goog.provide('windmill.Grouping');
goog.provide('windmill.Path');

goog.require('windmill.GridProto');
goog.require('windmill.keys');
goog.require('goog.array');
goog.require('goog.functions');
goog.require('goog.object');

goog.scope(function() {

var GridProto = windmill.GridProto;
var DrawType = GridProto.DrawType;

var coordKey = windmill.keys.coordKey;
var lineKey = windmill.keys.lineKey;

/** @constructor */
windmill.Path = function(coords, width, height) {
  // TODO: Also take in a grid shape, to enable non-standard grids.
  this.coords = coords;
  this.coordsMap = goog.array.toObject(coords, coordKey);
  var lines = [];
  for (var i = 1; i < coords.length; i++) {
    var c1 = coords[i-1];
    var c2 = coords[i];
    lines.push({
      i: Math.min(c1.i, c2.i),
      j: Math.min(c1.j, c2.j), isDown: c1.i == c2.i
    });
  }
  this.lines = lines;
  this.linesMap = goog.array.toObject(lines, lineKey);
  this.width = width;
  this.height = height;
}
var Path = windmill.Path;

Path.prototype.makeGroupings = function(opt_startCoords, opt_skipFinalize) {
  var allCoords = {};
  for (var i = 0; i < this.width; i++) {
    for (var j = 0; j < this.height; j++) {
      var coord = {i: i, j: j};
      allCoords[coordKey(coord)] = new GroupingDisjointSet(coord, allCoords);
    }
  }
  var startCoords = null;
  if (opt_startCoords) {
    startCoords = goog.array.toObject(opt_startCoords, coordKey);
  }
  var searchCoords = startCoords == null ? allCoords :
      goog.object.map(startCoords, function(coord, key) {
        return allCoords[key];
      });

  goog.object.forEach(searchCoords, function(start) {
    if (!start) {
      // Can happen if a start coord is out of bounds, which is allowed.
      return;
    } 
    var queue = [start.data.seed];
    while (queue.length) {
      var coord = queue.pop();
      var group = allCoords[coordKey(coord)];
      if (group.visited) {
        continue;
      }
      group.visited = true;
      var texts = [];
      goog.array.forEach(this.getNeighbors(coord), function(neighbor) {
        queue.push(neighbor);
        var neighborGroup = allCoords[coordKey(neighbor)];
        group.union(neighborGroup);
      })
    }
  }, this);
  var groupMap = {};
  var totalCount = {};
  goog.object.forEach(allCoords, function(group) {
    var key = coordKey(group.data.seed);
    if (group.data.count && !(key in groupMap) && (key in searchCoords)) {
      if (!opt_skipFinalize) {
        group.data.finalize();
      }
      groupMap[key] = group.data;
    }
    totalCount[key] = group.data.count;
  });
  for (var j = 0; j < this.height; j++) {
    var s = [];
    for (var i = 0; i < this.width; i++) {
      coord = {i: i, j: j};
      s.push(allCoords[coordKey(coord)].getSeed());
    }
    //console.log(j + ' >' + s.join('') + '<');
  }
  //console.log(totalCount);
  return goog.object.getValues(groupMap);
}
Path.prototype.groupingIncludes = function(group, coord, drawType) {
  var width = this.width, height = this.height;
  // Assumption: At least one call to cell is a coord that exists.
  // All groupings trivially include out-of-bounds points, otherwise.
  var cell = function(di, dj) {
    return (coordKey({i: coord.i+di, j:coord.j+dj}) in group.coords) ||
        coord.i + di < 0 || coord.j + dj < 0 ||
        coord.i + di >= width || coord.j + dj >= height;
  }
  if (drawType == DrawType.CELL) {
    return cell(0, 0);
  } else if (drawType == DrawType.POINT) {
    return cell(0, 0) && cell(-1, 0) && cell(0, -1) && cell(-1, -1);
  } else if (drawType == DrawType.HLINE) {
    return cell(0, 0) && cell(0, -1);
  } else if (drawType == DrawType.VLINE) {
    return cell(0, 0) && cell(-1, 0);
  } else {
    return false;
  }
}
Path.prototype.getNeighbors = function(c) {
  var vertical = true;
  var horizontal = false;
  var neighbors = [];
  // Left
  if (c.i > 0 && !this.hasLine(c.i, c.j, vertical)) {
    neighbors.push({i: c.i-1, j: c.j});
  }
  // Right
  if (c.i < this.width-1 && !this.hasLine(c.i+1, c.j, vertical)) {
    neighbors.push({i: c.i+1, j: c.j});
  }
  // Up
  if (c.j > 0 && !this.hasLine(c.i, c.j, horizontal)) {
    neighbors.push({i: c.i, j: c.j-1});
  }
  // Down
  if (c.j < this.height-1 && !this.hasLine(c.i, c.j+1, horizontal)) {
    neighbors.push({i: c.i, j: c.j+1});
  }
  return neighbors;
}
Path.prototype.hasLine = function(i, j, isDown) {
  return lineKey({i: i, j: j, isDown: isDown}) in this.linesMap;
}

/** @constructor */
windmill.Grouping = function(coord) {
  this.coords = {};
  this.coords[coordKey(coord)] = coord;
  this.seed = coord;
  this.count = 1;
  this.topLeft = null;
  this.bottomRight = null;
  this.width = -1;
  this.height = -1;
  this.shape = null;
}
var Grouping = windmill.Grouping;

Grouping.prototype.finalize = function() {
  if (this.count == 0) {
    throw Error();
  }
  // TODO: Dependency on shape. Shouldn't this logic be in shape anyway?
  var is = [];
  var js = [];
  goog.object.forEach(this.coords, function(coord) {
    is.push(coord.i);
    js.push(coord.j);
  });
  var minc = this.topLeft =
      {i: Math.min.apply(null, is), j: Math.min.apply(null, js)};
  var maxc = this.bottomRight =
      {i: Math.max.apply(null, is), j: Math.max.apply(null, js)};
  this.width = maxc.i - minc.i + 1;
  this.height = maxc.j - minc.j + 1;
  var grid = [];
  for (var j = 0; j < this.height; j++) {
    for (var i = 0; i < this.width; i++) {
      grid.push(coordKey({i: minc.i+i, j: minc.j+j}) in this.coords);
    }
  }
  this.shape = {grid: grid, width: this.width, height: this.height};
}

/** @constructor */
var GroupingDisjointSet = function(coord, allCoords) {
  this.data = new Grouping(coord);
  this.allCoords = allCoords;
  this.visited = false;
}
GroupingDisjointSet.seeds = {};
GroupingDisjointSet.prototype.getSeed = function() {
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  var key = coordKey(this.data.seed);
  if (!(key in GroupingDisjointSet.seeds)) {
    var size = goog.object.getCount(GroupingDisjointSet.seeds);
    GroupingDisjointSet.seeds[key] = alphabet[size];
  }
  return GroupingDisjointSet.seeds[key];
}
GroupingDisjointSet.prototype.union = function(repr) {
  if (this.data == repr.data || repr.data.count == 0) {
    return;
  }
  var otherData = repr.data;
  goog.object.forEach(otherData.coords, function(otherCoord, key) {
    // This is not the most efficient, but this is optimizing for simplicity.
    var other = this.allCoords[key];
    this.data.count += 1;
    other.data.count -= 1;
    this.data.coords[key] = otherCoord;
    //delete other.data.coords[key];
    other.data = this.data;
  }, this);
  if (otherData.count > 0) {
    throw Error();
  }
}

});
