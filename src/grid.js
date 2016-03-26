goog.provide('windmill.Grid');

goog.require('windmill.keys');
goog.require('windmill.GridProto');

goog.scope(function() {
var GridProto = windmill.GridProto;
var Entity = GridProto.Entity;
var Shape = GridProto.Shape;
var Type = GridProto.Type;
var SymmetryType = GridProto.SymmetryType;
var Color = GridProto.Color;
var Storage = GridProto.Storage;
var Orientation = GridProto.Orientation;
// Non wire.
var DrawType = GridProto.DrawType;

var shapeKey = windmill.keys.shapeKey;

/** @constructor */
windmill.Grid = function() {
  this.num = Grid.num_++;
  // Also need to set default width and height.
  // Do not render just yet.
  this.initialize(5, 5);
}
var Grid = windmill.Grid;
Grid.num_ = 0;

// Initialize the grid.
// If there is a grid renderer, you almost always want to call render
// after this (once the render el is in the document, of course.)
// TODO: Split this into two methods, one for pre-data and one for blank canvas
// (which should be a random layout).
Grid.prototype.initialize = function(width, height, opt_data) {
  var storage = null;
  if (opt_data) {
    try {
      if (!opt_data.endsWith('_0')) {
        return false;
      }
      opt_data = opt_data.substring(0, opt_data.length - 2);
      opt_data = opt_data.replace(/_/g, '/').replace(/-/g, '+');
      storage = Storage.decode64(opt_data);
      if (!storage.entity || !storage.width) {
        storage = null;
      } else {
        var expandedEntities = [];
        goog.array.forEach(storage.entity, function(e) {
          for (var i = 0; i < (e.count || 1); i++) {
            expandedEntities.push(e);
          }
        });
        storage.entity = expandedEntities;
        if (storage.entity.length % storage.width != 0) {
          throw Error();
        }
        var storeHeight = Math.floor(storage.entity.length / storage.width);
        width = Math.floor(storage.width/2);
        height = Math.floor(storeHeight/2);
      }
    } catch (e) {
      // Swallow
    }
    if (storage == null) {
      return false;
    }
  }
  this.width = width;
  this.height = height;
  this.storeWidth = this.width*2 + 1;
  this.storeHeight = this.height*2 + 1;
  // Grid state.
  if (storage) {
    this.entities = storage.entity;
    this.symmetry = storage.symmetry || SymmetryType.NONE;
    this.sanitize();
  } else {
    this.entities = [];
    for (var i = 0; i < this.storeWidth * this.storeHeight; i++) {
      this.entities[i] = new Entity();
    }
    this.symmetry = SymmetryType.NONE;
    // Some freebies.
    // TODO: More configurations.
    this.pointEntity(0, this.height, new Entity(Type.START));
    this.pointEntity(this.width, 0, new Entity(
          Type.END, undefined, new Orientation(1, 0)));
  }
  return true;
}

Grid.prototype.getDrawType = function(a, b) {
  if (a % 2 == 0 && b % 2 == 0) {
    return DrawType.POINT;
  } else if (a % 2 == 1 && b % 2 == 1) {
    return DrawType.CELL;
  } else if (a % 2 == 0) {
    return DrawType.VLINE;
  } else if (b % 2 == 0) {
    return DrawType.HLINE;
  } else {
    throw Error();
  }
}
Grid.prototype.info = function(i, j, type) {
  if (!goog.DEBUG) {
    return;
  }
  return type + '[' + i + ',' + j + ']';
}
// jQuery-style entity getter/setter.
Grid.prototype.entity = function(a, b, opt_val, opt_info) {
  var index = a + this.storeWidth*b;
  var inRange = a >= 0 && b >= 0 && a < this.storeWidth && b < this.storeHeight;
  if (opt_val && false) {
    console.log([opt_info, a + '―', b + '|', index].join(','));
  }
  if (opt_val) {
    if (!inRange) {
      throw Error();
    }
    this.entities[index] = opt_val;
  } else {
    if (!inRange) {
      return null;
    }
    return this.entities[index];
  }
}
// Should add one for entity by drawtype.
Grid.prototype.cellKeyEntity = function(key, opt_val) {
  return this.cellEntity(key.i, key.j, opt_val);
}
Grid.prototype.pointKeyEntity = function(key, opt_val) {
  return this.pointEntity(key.i, key.j, opt_val);
}
Grid.prototype.cellEntity = function(i, j, opt_val) {
  return this.entity(i*2 + 1, j*2 + 1, opt_val, this.info(i, j, '□'));
}
Grid.prototype.lineBetweenEntity = function(i1, j1, i2, j2, opt_val) {
  if (Math.abs(i1 - i2) + Math.abs(j1 - j2) != 1) {
    throw Error(arguments);
  }
  return this.lineEntity(
      Math.min(i1, i2), Math.min(j1, j2), i1 == i2, opt_val);
}
Grid.prototype.lineEntity = function(i, j, isDown, opt_val) {
  var goDown = isDown ? 1 : 0;
  return this.entity(
      i*2 + (1 - goDown), j*2 + goDown, opt_val,
      this.info(i, j, goDown ? '|' : '―'));
}
Grid.prototype.lineKeyEntity = function(key, opt_val) {
  return this.lineEntity(key.i, key.j, key.isDown, opt_val);
}
Grid.prototype.pointEntity = function(i, j, opt_val) {
  return this.entity(i*2, j*2, opt_val, this.info(i, j, '•'));
}
Grid.prototype.drawTypeEntity = function(coord, drawType, opt_val) {
  if (drawType == DrawType.CELL) {
    return this.cellEntity(coord.i, coord.j, opt_val);
  } else if (drawType == DrawType.POINT) {
    return this.pointEntity(coord.i, coord.j, opt_val);
  } else {
    return this.lineEntity(coord.i, coord.j,
        drawType == DrawType.VLINE, opt_val);
  }
}
Grid.prototype.getHash = function() {
  var isEmpty = function(e) {
    return (!e.type || e.type == Type.BASIC) &&
        !e.color && !e.shape && !e.orientation;
  }
  // Run length encode empty entities.
  // wow. such imperative. much state invariants.
  var count = 0;
  var entities = [];
  goog.array.forEach(this.entities, function(e, i) {
    var empty = isEmpty(e);
    if (empty) {
      count++;
      if (i < this.entities.length - 1) {
        return;
      }
    }
    if (count) {
      var newE = new Entity();
      if (count > 1) {
        newE.count = count;
      }
      count = 0;
      entities.push(newE);
    }
    if (!empty) {
      entities.push(e);
    }
  }, this);
  var storage = new Storage(this.storeWidth, entities);
  if (this.symmetry && this.symmetry != SymmetryType.NONE) {
    storage.symmetry = this.symmetry;
  }
  var encode = storage.encode64();
  // Make it more URL-safe.
  // Note that this only affects 0x3E and 0x3F, which does not occur
  // much in protobufs due to how it encodes things.
  encode = encode.replace(/\//g, '_').replace(/\+/g, '-');
  return encode + '_0';
}
// Return a representation of an entity Soy will like better.
// Either value is defined, or a and b are defined, or both.
// If that's not the case or the entity is invalid, return null.
// We can't just take in a and b arguments because we need to get
// representations for pending entities.
// TODO: Change this to use forEachEntity?
// TODO: Also, why exactly can't we just pass the proto into Soy directly?
Grid.prototype.getEntityRepr = function(
    opt_value, opt_a, opt_b, opt_addEndable) {
  var coordsDefined = opt_a != undefined && opt_b != undefined;
  if (opt_value == undefined && !coordsDefined) {
    // This will mainly happen when there is no edit entity.
    return null;
  }
  var value = opt_value || this.entities[opt_a + this.storeWidth*opt_b];
  var type = value.type || Type.BASIC;
  var content = {
    type: type
  };
  if (coordsDefined) {
    content.i = Math.floor(opt_a/2);
    content.j = Math.floor(opt_b/2);
    content.drawType = this.getDrawType(opt_a, opt_b);
  }
  var extras = {};
  if (value.orientation && type == Type.END) {
    extras.horizontal = value.orientation.horizontal;
    extras.vertical = value.orientation.vertical;
    if (Math.abs(extras.horizontal) + Math.abs(extras.vertical) != 1) {
      // Should we try to infer one?
      return null;
    }
  }
  if (type == Type.TRIANGLE) {
    extras.count = value.triangle_count || 1;
  }
  if (opt_addEndable && coordsDefined) {
    extras.endable = !!this.getEndPlacement(content.i, content.j);
  }
  extras.color = goog.isDefAndNotNull(value.color) ? value.color : null;
  if ((type == Type.SQUARE || type == Type.STAR) && !extras.color) {
    return null;
  }
  if (type == Type.TETRIS) {
    var shape = value.shape;
    if (!shape || !shape.grid) {
      return null;
    }
    var size = shape.grid.length;
    if (shape.width <= 0 || size == 0 || size % shape.width != 0) {
      return;
    }
    var height = Math.floor(size / shape.width);
    var index = 0;
    var rows = [];
    for (var m = 0; m < height; m++) {
      var row = [];
      for (var n = 0; n < shape.width; n++) {
        row.push(shape.grid[index++]);
      }
      rows.push(row);
    }
    extras.shape = {
      width: shape.width,
      height: height,
      rows: rows,
      repr: shapeKey(shape),
      free: shape.free,
      negative: shape.negative
    }
  }
  content.extras = extras;
  return content;
}
Grid.prototype.getEntityReprs = function(opt_addEndable) {
  var contents = [];
  for (var a = 0; a < this.storeWidth; a++) {
    for (var b = 0; b < this.storeHeight; b++) {
      var entity = this.getEntityRepr(undefined, a, b, opt_addEndable);
      if (entity) {
        contents.push(entity);
      }
    }
  }
  return contents;
}
Grid.prototype.forEachEntity = function(fn, opt_scope) {
  for (var a = 0; a < this.storeWidth; a++) {
    for (var b = 0; b < this.storeHeight; b++) {
      var value = this.entities[a + this.storeWidth*b];
      var drawType = this.getDrawType(a, b);
      fn.call(opt_scope, value, Math.floor(a/2), Math.floor(b/2), drawType);
    }
  }
}
Grid.prototype.setSymmetry = function(symmetry) {
  this.symmetry = symmetry;
  this.sanitize();
}
Grid.prototype.setSize = function(width, height) {
  var lastStoreWidth = this.storeWidth;
  var lastStoreHeight = this.storeHeight;
  var lastEntities = this.entities;

  this.width = width;
  this.height = height;
  this.storeWidth = this.width*2 + 1;
  this.storeHeight = this.height*2 + 1;
  this.entities = [];

  for (var b = 0; b < this.storeHeight; b++) {
    for (var a = 0; a < this.storeWidth; a++) {
      if (a < lastStoreWidth && b < lastStoreHeight) {
        this.entities[a + this.storeWidth*b] = lastEntities[a + lastStoreWidth*b];
      } else {
        this.entities[a + this.storeWidth*b] = new Entity();
      }
    }
  }
}
Grid.prototype.sanitize = function() {
  var sym = this.getSymmetry();
  if (!sym) {
    return;
  }
  this.forEachEntity(function(value, i, j, drawType) {
    if (drawType == DrawType.POINT &&
        (value.type == Type.START || value.type == Type.END)) {
      var ref = sym.reflectPoint({i: i, j: j});
      var refValue = this.pointEntity(ref.i, ref.j);
      if (i == ref.i && j == ref.j) {
        this.pointEntity(i, j, new Entity());
      } else if (value.type != refValue.type) {
        if (value.type == Type.END) {
          value = new Entity(value);
          value.orientation = this.getEndPlacement(ref.i, ref.j);
        }
        this.pointEntity(ref.i, ref.j, value);
      }
    }
  }, this);
}
Grid.prototype.getSymmetry = function() {
  if (this.symmetry == SymmetryType.NONE) {
    return null;
  } else {
    return new Grid.Symmetry(this.symmetry, this.width, this.height);
  }
}
// Returns the automatic end orientation at a coord i, j.
// This is symmetrical for all coordinates and symmetries.
Grid.prototype.getEndPlacement = function(i, j) {
  for (var di = -1; di <= 1; di += 2) {
    var line = this.lineBetweenEntity(i, j, i + di, j);
    if (!line || line.type == Type.NONE) {
      return new Orientation(di, 0);
    }
  }
  for (var dj = -1; dj <= 1; dj += 2) {
    var line = this.lineBetweenEntity(i, j, i, j + dj);
    if (!line || line.type == Type.NONE) {
      return new Orientation(0, dj);
    }
  }
  return null;
}

/** @constructor */
Grid.Symmetry = function(type, width, height) {
  this.type = type;
  this.width = width;
  this.height = height;
}
Grid.Symmetry.prototype.reflectPoint = function(coord) {
  if (this.type == SymmetryType.HORIZONTAL) {
    return {i: this.width - coord.i, j: coord.j};
  } else if (this.type == SymmetryType.VERTICAL) {
    return {i: coord.i, j: this.height - coord.j};
  } else if (this.type == SymmetryType.ROTATIONAL) {
    return {i: this.width - coord.i, j: this.height - coord.j};
  } else {
    throw Error(this.type);
  }
}
Grid.Symmetry.prototype.reflectDelta = function(delta) {
  // Avoid introducing negative zero here.
  var negate = function(n) {
    return n == 0 ? n : -n;
  }
  if (this.type == SymmetryType.HORIZONTAL) {
    return {di: negate(delta.di), dj: delta.dj};
  } else if (this.type == SymmetryType.VERTICAL) {
    return {di: delta.di, dj: negate(delta.dj)};
  } else if (this.type == SymmetryType.ROTATIONAL) {
    return {di: negate(delta.di), dj: negate(delta.dj)};
  } else {
    throw Error(this.type);
  }
}

});
