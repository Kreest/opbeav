goog.provide('windmill.GridRenderer');
goog.provide('windmill.GridUi');
goog.provide('windmill.GridUiHook');

goog.require('windmill.Grid');
goog.require('windmill.GridProto');
goog.require('windmill.Shape');
goog.require('windmill.Snake');
goog.require('windmill.constants.UI');
goog.require('windmill.keys');
goog.require('windmill.templates');
goog.require('windmill.validate');
goog.require('goog.array');
goog.require('goog.events.EventHandler');
goog.require('goog.soy');
goog.require('goog.dom.classlist');


goog.scope(function() {
var GridProto = windmill.GridProto;
var Entity = GridProto.Entity;
var Type = GridProto.Type;
var Color = GridProto.Color;
var Storage = GridProto.Storage;
var Orientation = GridProto.Orientation;
// Non wire.
var DrawType = GridProto.DrawType;

var Shape = windmill.Shape;
var Snake = windmill.Snake;
var UI = windmill.constants.UI;

var coordListKey = windmill.keys.coordListKey;


/** @constructor */
windmill.GridRenderer = function(grid, opt_gridBase) {
  this.grid = grid;
  this.customEl = opt_gridBase || null;
}
var GridRenderer = windmill.GridRenderer;

GridRenderer.prototype.getRenderWidth = function() {
  return (this.grid.width+1)*100;
}
GridRenderer.prototype.getRenderHeight = function() {
  return (this.grid.height+1)*100;
}
GridRenderer.prototype.render = function(opt_contents) {
  var contents = this.grid.getEntityReprs();
  window.requestAnimationFrame(goog.bind(this.renderContents, this, contents));
}
GridRenderer.prototype.renderContents = function(contents) {
  if (!this.customEl) {
    var svgEl = goog.asserts.assert(document.getElementById('grid'), 'grid');
    svgEl.setAttribute('width', this.getRenderWidth());
    svgEl.setAttribute('height', this.getRenderHeight());
  }
  // Now, the rendering.
  var gridSvg = windmill.templates.gridSvg({
    contents: contents
  });
  var renderEl = this.customEl ||
      goog.asserts.assert(document.getElementById('gridBase'), 'gridBase');
  renderEl.innerHTML = gridSvg;
}

/** @constructor */
windmill.GridUiHook = function() {
  // Monkey patch'd.
  this.showToast = function(message) {};
  this.onSuccess = function(path) {};
  this.alerted = {};
}
var GridUiHook = windmill.GridUiHook;
GridUiHook.prototype.fyi = function(message, opt_allowDup) {
  if (!opt_allowDup && message in this.alerted) {
    return;
  }
  this.alerted[message] = 1;
  this.showToast(message);
}

/** @constructor */
windmill.GridUi = function(grid, uiHook) {
  this.grid = grid;
  this.renderer = new GridRenderer(grid);
  this.navigationSelector = new GridUi.NavigationSelector(grid);
  this.uiHook = uiHook;
  // UI state. Lots of it.
  // These are independent of resets.
  this.editEntity = null;
  this.backgroundEditEntity = null;
  // These can be reset.
  this.snake = null;
  this.lockStatus = 'no';
  this.eventHandler = null;
  this.snakeHandler = null;
  // The rest can just be reset in initialized
  // without looking at previous values.
  this.initialize();
}
var GridUi = windmill.GridUi;
GridUi.prototype.initialize = function() {
  this.puzzleVersion = 0;
  this.solvedPuzzleVersion = -1;
  this.solvedPuzzlePath = null;
  // UI interaction state.
  if (this.eventHandler) {
    this.eventHandler.dispose();
  }
  if (this.lockStatus != 'no' || this.lockStatus != 'never') {
    var exitLock = document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;
    if (exitLock) {
      exitLock.call(document);
    }
    this.lockStatus = 'no';
  }
  this.pendingStartCoords = null;
  this.pendingStartTime = null;
  this.eventHandler = null;
  if (this.snakeHandler) {
    this.snakeHandler.dispose();
  }
  this.snakeHandler = null;
  if (this.snake) {
    this.snake.fade();
  }
  this.snake = null;
}
GridUi.prototype.render = function(opt_contents) {
  var endable = this.editEntity && this.editEntity.type == Type.END;
  var contents = this.grid.getEntityReprs(endable /* opt_addEndable */);
  window.requestAnimationFrame(goog.bind(this.renderContents, this, contents));
}
GridUi.prototype.renderContents = function(contents) {
  this.renderer.renderContents(contents);
  // Now, set up the right event handlers.
  // Because everything is rendered anew (not incrementally),
  // throw away all event listeners.
  if (this.eventHandler) {
    this.eventHandler.dispose();
  }
  this.eventHandler = new goog.events.EventHandler(this);

  document.getElementById('extras').innerHTML = windmill.templates.gridHtml({
    contents: contents,
    editEntity: this.grid.getEntityRepr(this.editEntity)
  });
  var parseData = function(n) {
    n = parseInt(n);
    if (isNaN(n)) {
      throw Error();
    }
    return n;
  };
  var parseDataC = function(el) {
    var data = el.getAttribute('data-c').split(',');
    if (data.length != 3) {
      throw Error();
    }
    data = goog.array.map(data, parseData);
    return {drawType: data[0], coord: {i: data[1], j: data[2]}};
  }
  var parseDataOp = function(el) {
    return parseData(el.getAttribute('data-op'));
  }
  // Set up events to handle for initialization.
  goog.array.forEach(
      document.getElementById('extras').querySelectorAll('*[data-c]'),
      function(el) {
    var node = parseDataC(el);
    var edit = parseDataOp(el);
      // Currently, only start on points.
    this.eventHandler.listen(el, 'click', function(ce) {
      var e = ce.getBrowserEvent();
      // Wait for click to finish.
        if (node.drawType == DrawType.POINT && !edit) {
          if (this.initializeSnake(
                  node.coord, e.pageX, e.pageY)) {
            e.stopPropagation();
          }
        } else if (edit) {
          // Prevent the snake from disappearing on insertion.
          e.stopPropagation();
          this.attemptInsert(node.coord, node.drawType, el);
        }
    });
    this.eventHandler.listen(el, 'touchstart', function(ce) {
      var e = ce.getBrowserEvent();
      if (node.drawType == DrawType.POINT && node.play) {
        this.initializeSnake(
            node.coord,
            e.touches[0].pageX, e.touches[0].pageY,
            true /* optIsTouch */);
      }
    });
  }, this);
  this.eventHandler.listen(
      document.getElementById('content'), 'click', function() {
    // Should probably be an explicit state machine. But this handles the
    // case of snake hanging around after success, where snake handler is
    // removed so no more mouse follows happen. This could be state in the
    // handler itself.
    if (this.snake && !this.snakeHandler) {
      this.finishSnake();
    }
  });
  var lockUninitialized = true;
  this.eventHandler.listen(
      document,
      ['pointerlockchange', 'mozpointerlockchange', 'webkitpointerlockchange',
       'pointerlockerror', 'mozpointerlockerror', 'webkitpointerlockerror'],
      function(e) {
    if (this.lockStatus != 'never') {
      // Unfortunately, moz doesn't count unaccepted locks.
      var docPointerLock = !!(document.pointerLockElement ||
          document.mozPointerLockElement ||
          document.webkitPointerLockElement);
      this.onPointerLock(docPointerLock);
    }
    if (e.type.endsWith('lockerror')) {
      this.lockStatus = 'never';
    }
  });
}
GridUi.prototype.dispose = function() {
  if (this.eventHandler) {
    this.eventHandler.dispose();
  }
  if (this.snakeHandler) {
    this.snakeHandler.dispose();
  }
  // dispose technically means 'I never want to see this
  // object again', but let's be generous/safe.
  this.eventHandler = this.snakeHandler = null;
}
GridUi.prototype.clearEditEntity = function() {
  this.editEntity = null;
  this.render();
}
GridUi.prototype.setEditEntity = function(data) {
  // This method *always* renders anew.
  this.editEntity = null;
  if (data.width != this.grid.width || data.height != this.grid.height) {
    this.grid.initialize(data.width, data.height);
  }
  var entityMap = {
    'basic': Type.BASIC,
    'start': Type.START,
    'end': Type.END,
    'disjoint': Type.DISJOINT,
    'hexagon': Type.HEXAGON,
    'square': Type.SQUARE,
    'star': Type.STAR,
    'tetris': Type.TETRIS,
    'negative': Type.TETRIS,
    'error': Type.ERROR,
    'triangle': Type.TRIANGLE
  }
  if (!(data.type in entityMap)) {
    this.render();
    return;
  }
  var type = entityMap[data.type];
  var e = new Entity(type);
  if (data.color && (type == Type.STAR || type == Type.SQUARE)) {
    e.color = data.color;
  }
  if (type == Type.TRIANGLE) {
    e.triangle_count = ((data.count || 0) % 3) + 1;
  }
  if (type == Type.TETRIS) {
    var fixGrid = goog.array.map(
        goog.array.clone(data.grid),
        function(b) {return !!b;});
    var shape = {
      width: data.gridWidth,
      height: Math.floor(data.grid.length / data.gridWidth),
      grid: fixGrid
    };
    shape = Shape.reduce(shape);
    if (!shape.grid.length) {
      this.render();
      return;
    }
    var shapeProto = new GridProto.Shape();
    shapeProto.grid = shape.grid;
    shapeProto.width = shape.width;
    if (!data.gridFixed) {
      shapeProto.free = true;
    }
    if (data.type == 'negative') {
      shapeProto.negative = true;
    }
    e.shape = shapeProto;
  }
  // This entity is great, although if it's and end nub, we can't figure
  // out the orientation until we place it.
  // Also, update the background if it's there, otherwise the real one.
  if (this.backgroundEditEntity) {
    this.backgroundEditEntity = e;
  } else {
    this.editEntity = e;
  }
  this.render();
}
GridUi.prototype.attemptInsert = function(coord, drawType, el) {
  if (!this.editEntity) {
    return;
  }
  if (el.getAttribute('data-op') == '1') {
    // Regular insertion
    var entity = new Entity(this.editEntity);
    if (entity.type == Type.END) {
      var orient = this.grid.getEndPlacement(coord.i, coord.j);
      if (!orient) {
        return;
      }
      entity.orientation = orient;
    }
    this.puzzleVersion++;
    this.grid.drawTypeEntity(coord, drawType, entity);
    el.setAttribute('data-op', 2);
    goog.dom.classlist.add(el, 'isRemoval');
  } else {
    // Removal
    this.puzzleVersion++;
    this.grid.drawTypeEntity(coord, drawType, new Entity());
    if (this.editEntity.type != Type.BASIC) {
      el.setAttribute('data-op', 1);
      goog.dom.classlist.remove(el, 'isRemoval');
    }
  }
  this.render();
}
GridUi.prototype.initializeSnake = function(
    coords, mouseX, mouseY, opt_isTouch) {
  if (this.snake) {
    return false;
  }
  var gridElem = document.getElementById('gridPath');
  var reqLock = gridElem.requestPointerLock ||
      gridElem.mozRequestPointerLock ||
      gridElem.webkitRequestPointerLock;
  if (!reqLock && !opt_isTouch) {
    this.uiHook.fyi('FYI: For easier line-drawing, ' +
        'use a web browser with pointer lock (not Safari or IE)');
  }
  if (reqLock && this.lockStatus != 'never' &&
      this.lockStatus != 'pending' && !opt_isTouch) {
    this.pendingStartCoords = coords;
    this.pendingStartTime = new Date();
    this.lockStatus = 'pending';
    reqLock.call(gridElem);
  } else {
    this.initializeSnakeInternal(coords, {x: mouseX, y: mouseY}, opt_isTouch);
  }
  return true;
}
GridUi.prototype.onPointerLock = function(turnt) {
  if (turnt) {
    if (this.lockStatus == 'pending' &&
           (this.snake ||
               (this.pendingStartCoords &&
                   (!this.pendingStartTime ||
                    new Date() - this.pendingStartTime <= 30*1000)))) {
      this.lockStatus = 'yes';
      var coords = this.pendingStartCoords;
      this.pendingStartCoords = null;
      this.pendingStartTime = null;
      if (this.snake) {
        this.snake.setTargetingMouse(false);
        return;
      } else {
        // TODO: Update for non-point start points.
        var entity = this.grid.pointEntity(coords.i, coords.j);
        if (entity && entity.type == Type.START) {
          this.initializeSnakeInternal(coords, null);
          return;
        }
      }
    }
    // Something went wrong. Clean up the mess.
    this.lockStatus = 'no';
    var exitLock = document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;
    if (exitLock) {
      exitLock.call(document);
    }
  } else {
    if (this.lockStatus == 'yes') {
      this.lockStatus = 'no';
      if (this.snake) {
        this.finishSnake();
      }
    } else if (this.lockStatus == 'pending') {
      this.lockStatus = 'no';
      this.pendingStartCoords = null;
      this.pendingStartTime = null;
    }
  }
}
GridUi.prototype.initializeSnakeInternal = function(
    coords, opt_mouseCoords, opt_isTouch) {
  this.snake = new Snake(
      coords, document.getElementById('gridPath'), opt_mouseCoords);
  this.snakeHandler = new goog.events.EventHandler(this);
  var ignoreNextClick = false;
  // TODO: This doesn't actually seem to work anymore. Why??
  if (opt_isTouch) {
    var firstDown = true;
    var lastYDistance = null;
    var lastTouch = null;
    this.snakeHandler.listen(document, 'touchmove', function(ce) {
      var e = ce.getBrowserEvent();
      var touch = e.touches[0];
      if (firstDown && (!lastTouch || touch.pageY > lastTouch.pageY)) {
        // We don't currently have state to determine direction.
        ce.preventDefault();
        if (lastTouch) {
          firstDown = false;
        }
      }
      lastTouch = touch;
      var yDistance = !touch.radiusX ?
          Math.max(touch.radiusX, touch.radiusY)*2 : 175;
      lastYDistance = yDistance;
      this.snake.setMouse(touch.pageX, touch.pageY - yDistance);
    });
    this.snakeHandler.listen(document, 'touchend', function(ce) {
      if (lastYDistance) {
        var head = this.snake.getHead();
        var extras = document.getElementById('pathExtras');
        extras.innerHTML = windmill.templates.touchIndicator({
          x: head.x, y: head.y + lastYDistance
        });
        extras.style.setProperty('display', 'block');
        // Don't bother using snakeHandler.
        // This indicator will go away when the element does.
        extras.lastChild.addEventListener('touchstart', function(e) {
          firstDown = true;
          ignoreNextClick = true;
          extras.style.setProperty('display', 'none');
        });
      }
    });
  } else {
    this.snakeHandler.listen(document, 'mousemove', function(ce) {
      var e = ce.getBrowserEvent();
      if (this.snake) {
        if (!this.snake.targetingMouse && e.movementX != undefined) {
          this.snake.setMouseDiff(e.movementX, e.movementY);
        } else {
          this.snake.setMouse(e.pageX, e.pageY);
        }
      }
    });
  }
  // TODO: Don't apply to 'all' if possible. (What to do instead?)
  // Note that when playing, 'all' is not available, only 'content' is.
  this.snakeHandler.listen(document.getElementById('all') ||
      document.getElementById('content'), 'click', function(e) {
    // TODO: Don't do this automatically on touch.
    setTimeout(goog.bind(function() {
      e.stopPropagation();
      if (ignoreNextClick) {
        console.log('ignored it');
        ignoreNextClick = false;
        return;
      }
      if (this.snake) {
        this.finishSnake();
      }
    }, this), 0);
  });
  window.requestAnimationFrame(goog.bind(this.updateSnake, this));
  if (this.editEntity) {
    this.backgroundEditEntity = this.editEntity;
    this.editEntity = null;
    this.render();
  }
}
GridUi.prototype.updateSnake = function() {
  // Must be called from RAF.
  if (!this.snake) {
    return;
  }
  this.snake.moveTowardsMouse(75 /* msPerGridUnit */, this.navigationSelector);
  this.snake.render();
  // TODO: Ideally avoid timeout here.
  // Is there some way to RAF and ensure it's in a different frame?
  setTimeout(goog.bind(function() {
    window.requestAnimationFrame(goog.bind(this.updateSnake, this));
  }, this), 0);
}


GridUi.prototype.finishSnake = function() {
  if (!this.snake) {
    return;
  }
  try {
    this.snake.render(true);
  } catch (e) {
    console.log(e);
  }
  // In all cases, on finish, release the pointer lock if any.
  if (this.lockStatus == 'yes') {
    this.lockStatus = 'no';
    var exitLock = document.exitPointerLock ||
        document.mozExitPointerLock ||
        document.webkitExitPointerLock;
    if (exitLock) {
      exitLock.call(document);
    }
  }
  if (document.getElementById('pathExtras').firstChild) {
    document.getElementById('pathExtras').innerHTML = '';
  }
  // Now handle: Cancellation, success, failure
  // Note that in lieu of other state, 'snake hanging around after success'
  // currently is represented by no snake handler, but existing snake.
  var finishedBefore = true;
  if (this.snakeHandler) {
    this.snakeHandler.dispose();
    this.snakeHandler = null;
    finishedBefore = false;
  }
  // Cancellation, dismissal after success
  if (!this.snake.atEnd() || finishedBefore) {
    this.disappearSnake(100);
    return;
  }
  // Success or failure at end
  var errs = windmill.validate.getErrors(this.grid, this.snake.movement);
  if (errs.messages.length) {
    var messages = [];
    goog.array.removeDuplicates(errs.messages, messages);
    var message = messages.length == 1
      ? messages[0] : messages.join(' ');
    this.fyi(message, true);
  }
  var errors = errs.errors;
  var allowedErrors = errs.allowedErrors;
  if (errors.length) {
    // Failure
    this.disappearSnake(
        1000,
        goog.array.concat(errors, allowedErrors),
        200);
  } else {
    // Success
    if (allowedErrors.length) {
      this.markErrors(allowedErrors);
    }
    if (errs.specialErrors.length) {
      setTimeout(goog.bind(function() {
        this.markErrors(errs.specialErrors, 2000, 8000);
      }, this), allowedErrors.length ? 500 : 50);
    }
    this.solvedPuzzleVersion = this.puzzleVersion;
    this.solvedPuzzlePath = coordListKey(this.snake.movement);
    this.snake.markSuccessful();
    setTimeout(goog.bind(function() {
      // Hacky way to avoid throwing.
      this.uiHook.onSuccess(this.solvedPuzzlePath);
    }, this));
    if (this.backgroundEditEntity) {
      this.editEntity = this.backgroundEditEntity;
      this.backgroundEditEntity = null;
      this.render();
    }
  }
}
GridUi.prototype.markErrors = function(
    errors, opt_timeoutMs, opt_fadeDelayMs) {
  var timeout = opt_timeoutMs || 2000;
  var fade = opt_fadeDelayMs || 50;
  if (errors && errors.length) {
    var errorEls = goog.array.map(errors, function(err) {
      return goog.soy.renderAsElement(
        windmill.templates.errorHtml, {
          i: err.coord.i,
          j: err.coord.j,
          drawType: err.drawType
        });
    });
    var errorDiv = document.getElementById('errors');
    goog.array.forEach(errorEls, function(errorEl) {
      errorDiv.appendChild(errorEl);
    });
    goog.array.forEach(errorEls, function(errorEl) {
      errorEl.style.setProperty(
          'transition', 'opacity ' + timeout + 'ms ease-out');
      setTimeout(function() {
        errorEl.style.setProperty('opacity', 0);
      }, fade);
    });
    setTimeout(function() {
      goog.array.forEach(errorEls, function(errorEl) {
        if (errorEl.parentNode) {
          errorEl.parentNode.removeChild(errorEl);
        }
      });
    }, timeout + fade);
  }
}
GridUi.prototype.disappearSnake = function(fadeMs, errors, errorDelayMs) {
  var snake = this.snake;
  this.snake = null;
  if (errors && errors.length) {
    this.markErrors(errors);
    setTimeout(function() {
      snake.fade(fadeMs);
    }, errorDelayMs);
  } else {
    snake.fade(fadeMs);
  };
  if (this.backgroundEditEntity) {
    this.editEntity = this.backgroundEditEntity;
    this.backgroundEditEntity = null;
    this.render();
  }
}

/** @constructor */
GridUi.NavigationSelector = function(grid) {
  this.grid = grid;
}
GridUi.NavigationSelector.prototype.pointIsReachable = function(
    current, di, dj) {
  var grid = this.grid;
  var thisEntity = grid.pointEntity(current.i, current.j);
  var entity = grid.pointEntity(current.i + di, current.j + dj);
  // Something's there: it's okay!
  if (entity != null) {
    var line = grid.lineBetweenEntity(
        current.i, current.j, current.i + di, current.j + dj);
    if (line != null) {
      if (line.type == Type.NONE) {
        return 'no';
      } else if (line.type == Type.DISJOINT) {
        return 'disjoint';
      }
    }
    return 'yes';
  }
  // If point is not there, we can go to the end.
  if (thisEntity.type == Type.END) {
    var o = thisEntity.orientation;
    if (o.horizontal == di && o.vertical == dj) {
      return 'end';
    }
  }
  return 'no';
}
GridUi.NavigationSelector.prototype.selectTarget = function(
    movement, di, dj, preferHorizontal) {
  var grid = this.grid;
  // Select something
  var current = movement[movement.length - 1];
  var select = {i: current.i, j: current.j};
  // First, at start, can stay still within circle.
  var result = {}
  // Determine where we can go and how far.
  var diBack, djBack;
  if (movement.length > 1) {
    var previous = movement[movement.length - 2];
    diBack = previous.i - current.i;
    djBack = previous.j - current.j;
  }
  var crossesPath = function(di, dj) {
    return goog.array.find(movement, function(coord) {
      var targetIsCoord =
          coord.i == current.i + di && coord.j == current.j + dj;
      var isBacktrack = di == diBack && dj == djBack;
      return targetIsCoord ? !isBacktrack : false;
    });
  }
  var calcProgress = function(di, dj) {
    if (di == 0 && dj == 0) {
      return 'no';
    }
    var reach = this.pointIsReachable(current, di, dj);
    var blocker = crossesPath(di, dj);
    if (reach == 'no') {
      return 0;
    } else if (reach == 'end') {
      return UI.END_LENGTH;
    } else if (reach == 'disjoint') {
      return UI.DISJOINT_LENGTH;
    }
    if (blocker) {
      var point = grid.pointEntity(blocker.i, blocker.j);
      if (!point) {
        throw Error('bad element in path');
      }
      return point.type == Type.START ? 50 : 70;
    }
    return -1;
  }
  var horizontalProgress = calcProgress.call(this, di, 0);
  var verticalProgress = calcProgress.call(this, 0, dj);
  // Optimization: Snap to line if closeby.
  // The most basic selection.
  if (horizontalProgress && verticalProgress) {
    if (preferHorizontal) {
      select.i += di;
    } else {
      select.j += dj;
    }
  } else if (horizontalProgress) {
    select.i += di;
  } else if (verticalProgress) {
    select.j += dj;
  } else {
  }
  if (select.i != current.i && horizontalProgress != -1) {
    result.maxProgress = horizontalProgress;
  }
  if (select.j != current.j && verticalProgress != -1) {
    result.maxProgress = verticalProgress;
  }
  // HACK HACK HACK
  if (result.maxProgress == UI.END_LENGTH) {
    result.isEnd = true;
  }
  result.select = select;
  return result;
}

});
