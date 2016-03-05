goog.provide('windmill.Snake');

goog.require('windmill.GridProto');
goog.require('windmill.constants.UI');
goog.require('windmill.templates');
goog.require('goog.array');
goog.require('goog.object');
goog.require('goog.style');
goog.require('goog.soy');

goog.scope(function() {
var GridProto = windmill.GridProto;
var DrawType = GridProto.DrawType;
var SegmentType = GridProto.SegmentType;

var UI = windmill.constants.UI;

/** @constructor */
windmill.Snake = function(start, draw, opt_mouseCoords) {
  this.snakeId = Snake.snakeId_++;
  // The current path.
  this.movement = [start];
  this.target = null;
  this.targetMaxProgress = null;
  this.targetIsEnd = null;
  // An ongoing path addition or subtraction.
  // Progress is from 0 to MAX_PROGRESS, target == null <=> progress == 0.
  // target cannot be MAX_PROGRESS as steady state (only when about to retract).
  this.progress = 0;
  // The board!
  this.draw = draw;
  // Misc state for execution/optimization.
  this.lastUpdateTime = null;
  this.mouseX = opt_mouseCoords ? opt_mouseCoords.x : 0;
  this.mouseY = opt_mouseCoords ? opt_mouseCoords.y : 0;
  this.frameTime = new ElapsedTime();
  this.mouseTime = new ElapsedTime();
  this.mouseHistoryX = [];
  this.mouseHistoryY = [];
  this.targetingMouse = !!opt_mouseCoords;
}
var Snake = windmill.Snake;

Snake.MAX_PROGRESS_ = UI.GRID_UNIT;
var MAX_PROGRESS = Snake.MAX_PROGRESS_;

Snake.snakeId_ = 0;
// Note: For now, both target functions are internal. Using callback.
Snake.prototype.setTargetingMouse = function(targetingMouse) {
  this.targetingMouse = targetingMouse;
}
Snake.prototype.atEnd = function() {
  return this.targetIsEnd && this.progress === this.targetMaxProgress;
}
Snake.prototype.markSuccessful = function() {
  if (this.snakeEl) {
    this.snakeEl.style.setProperty(
        'filter',
        'url(' + window.location.href.split('#')[0] + '#glow)');
  }
}
Snake.prototype.setMouse = function(mouseX, mouseY) {
  this.mouseX = mouseX;
  this.mouseY = mouseY;
  this.mouseTime.step();
}
Snake.prototype.setMouseDiff = function(mouseX, mouseY) {
  this.mouseX += mouseX;
  this.mouseY += mouseY;
  this.mouseTime.step();
}
Snake.prototype.calcMouseOnGrid = function() {
  var gridOnPage = goog.style.getPageOffset(
      document.getElementById('gridContainer'));
  var mouseOnGrid = {
    x: this.mouseX - gridOnPage.x - UI.MARGIN,
    y: this.mouseY - gridOnPage.y - UI.MARGIN
  };
  return mouseOnGrid;
}
/** @constructor */
var ElapsedTime = function() {
  this.lastUpdateTime = null;
  this.lastStep = null;
}
ElapsedTime.prototype.step = function() {
  var currentTime = new Date();
  var previousTime = this.lastUpdateTime;
  this.lastUpdateTime = currentTime;
  if (previousTime == null) {
    return null;
  }
  this.lastStep = currentTime - previousTime;
  return this.lastStep;
}
Snake.prototype.moveTowardsMouse = function(msPerGridUnit, selector) {
  var maxMovement;
  if (this.targetingMouse) {
    var elapsedMs = this.frameTime.step();
    if (elapsedMs == null) {
      return;
    }
    maxMovement = Math.floor(elapsedMs / msPerGridUnit * MAX_PROGRESS / 1.5);
    // Simplifying assumption: Max one unit per animation frame, so
    // moveTowardsTarget only needs to be called twice below.
    maxMovement = Math.min(maxMovement, MAX_PROGRESS);
  } else {
    this.mouseHistoryX.push(this.mouseX);
    this.mouseHistoryY.push(this.mouseY);
    if (this.mouseHistoryX.length > 3) {
      this.mouseHistoryX.shift();
      this.mouseHistoryY.shift();
    }
    if (!this.mouseTime.lastStep) {
      return;
    }

    // Icky... should ideally separate max distance into vertical and horizontal.
    var mdx = (this.mouseHistoryX[this.mouseHistoryX.length-1]-this.mouseHistoryX[0])/this.mouseHistoryX.length*2.5;
    var mdy = (this.mouseHistoryY[this.mouseHistoryY.length-1]-this.mouseHistoryY[0])/this.mouseHistoryY.length*2.5;
    var move = Math.max(Math.abs(mdx), Math.abs(mdy));
    maxMovement = move;  // Keep it easy...
  }
  var remaining = this.moveTowardsTarget(maxMovement, selector);
  if (remaining != undefined) {
    this.moveTowardsTarget(remaining, selector);
  }
}

Snake.prototype.moveTowardsTarget = function(maxMovement, selector) {
  var dx = null, dy = null;
  var params;
  if (this.targetingMouse) {
    var mouseOnGrid = this.calcMouseOnGrid();
    var pointOnGrid = this.getHead();
    dx = mouseOnGrid.x - pointOnGrid.x;
    dy = mouseOnGrid.y - pointOnGrid.y;
    var distanceX = mouseOnGrid.x - Math.round(mouseOnGrid.x / UI.GRID_UNIT)*UI.GRID_UNIT;
    var distanceY = mouseOnGrid.y - Math.round(mouseOnGrid.y / UI.GRID_UNIT)*UI.GRID_UNIT;
    var threshhold = UI.GRID_LINE*2;
    if (Math.abs(distanceX) <= threshhold && dy >= UI.GRID_UNIT) {
      mouseOnGrid.x -= distanceX;
    }
    if (Math.abs(distanceY) <= threshhold && dx >= UI.GRID_UNIT) {
      mouseOnGrid.y -= distanceY;
    }
    dx = mouseOnGrid.x - pointOnGrid.x;
    dy = mouseOnGrid.y - pointOnGrid.y;
    params = {
      di: Math.sign(dx),
      dj: Math.sign(dy),
      preferHorizontal: Math.abs(dx) >= Math.abs(dy)
    };
  } else {
    var mdx = (this.mouseHistoryX[this.mouseHistoryX.length-1]-this.mouseHistoryX[0])/this.mouseHistoryX.length*2.5;
    var mdy = (this.mouseHistoryY[this.mouseHistoryY.length-1]-this.mouseHistoryY[0])/this.mouseHistoryY.length*2.5;
    if (Math.abs(mdx)*5 < Math.abs(mdy)) {
      mdx = 0;
    }
    if (Math.abs(mdy)*5 < Math.abs(mdx)) {
      mdy = 0;
    }
    params = {
      di: Math.sign(mdx),
      dj: Math.sign(mdy),
      preferHorizontal: Math.abs(mdx) >= Math.abs(mdy)
    };
  }
  var di = params.di;
  var dj = params.dj;
  if (this.target == null && !this.discoverTarget(selector, params)) {
    return;
  }

  var remainingProgress = 0;
  // Want to move towards mouse along axis of concern. Don't initially want to move farther
  // than mouse, and want to figure out next target before moving there.
  // In case where we end up at target, remove target for next time.
  var current = this.movement[this.movement.length - 1];
  var isVertical = current.i == this.target.i;
  if (isVertical ? dj == 0 : di == 0) {
    if ((isVertical ? di == 0 : dj == 0) || this.targetIsEnd) {
      return;
    }
    // If not targetingMouse, the user may move in a direction we can't go.
    // In that case, we still might be able to move orthogonally, away from
    // the center of the grid line.
    // (Also, don't do this in an end cap, because any slight movement might
    // cause the entire line to get dismissed.)
    if (isVertical) {
      dj = (this.target.j > current.j) == (this.progress >= 50) ? 1 : -1;
      di = 0;
    } else {
      di = (this.target.i > current.i) == (this.progress >= 50) ? 1 : -1;
      dj = 0;
    }
  }

  // We have to do this twice because, if targetingMouse and the user moves
  // in a direction we can't go, we might still be able to realign our movement
  // from vertical to non-vertical, or vice versa, and move orthogonally.
  for (var i = 0; i < 2; i++) {
    var makingProgress = isVertical ?
        ((dj > 0) == (this.target.j > current.j)) :
        ((di > 0) == (this.target.i > current.i));
    var progressBeforeChangeRequired = Math.max(0, makingProgress ?
        (this.progress + maxMovement) - MAX_PROGRESS :
        0 - (this.progress - maxMovement));
    if (progressBeforeChangeRequired > 0) {
      maxMovement -= progressBeforeChangeRequired;
      remainingProgress += progressBeforeChangeRequired;
    }
    // First, cap by axis. Do this for the absolute value of movement, because
    // the values already agree on direction (we always move in the direction of
    // decreasing delta).
    var actualMovement = maxMovement;
    if (dx != null && dy != null) {
      var maxAxisMovement = Math.abs(Math.floor(
            (isVertical ? dy : dx) * MAX_PROGRESS / UI.GRID_UNIT));
      if (maxAxisMovement == 0 && !this.targetIsEnd) {
        // Otherwise, can move orthogonal.
        if (isVertical) {
          dj = (this.target.j > current.j) == (this.progress >= 50) ? 1 : -1;
          di = 0;
        } else {
          di = (this.target.i > current.i) == (this.progress >= 50) ? 1 : -1;
          dj = 0;
        }
        if (dx != null && dy != null) {
          var tmp = dx;
          dx = dy;
          dy = tmp;
        }
        isVertical = !isVertical;
        // Let's try again with new isVertical.
        continue;
      }
      actualMovement = Math.min(actualMovement, maxAxisMovement);
    }
    // Now artifical caps, only if making progress.
    if (makingProgress && this.targetMaxProgress != null) {
      actualMovement = Math.min(
          actualMovement,
          this.targetMaxProgress - this.progress);
    }
    this.progress += makingProgress ? actualMovement : -actualMovement;
    break;
  }
  // If we were stopped for any reason, we wouldn't be able to reach
  // a target decision.
  if (actualMovement < maxMovement) {
    return;
  }
  if (this.progress <= 0) {
    // Backtracked, so forget where we came from.
    this.clearTarget();
    this.progress = MAX_PROGRESS;
    // console.log('Backtrack, target null!');
    if (remainingProgress == 0 || !this.discoverTarget(selector, params)) {
      return;
    }
  } else if (this.progress >= MAX_PROGRESS) {
    // Move forward, so store it.
    if (this.target.i == current.i && this.target.j == current.j) {
      throw Error();
    }
    this.movement.push(this.target);
    this.clearTarget();
    this.progress = 0;
    // console.log('Forwards, target null!');
    if (remainingProgress == 0 || !this.discoverTarget(selector, params)) {
      return;
    }
  }
  return remainingProgress;
}
Snake.prototype.clearTarget = function() {
  this.target = null;
  this.targetMaxProgress = null;
  this.targetIsEnd = false;
}
Snake.prototype.discoverTarget = function(selector, params) {
  if (this.target != null) {
    return true;
  }
  var current = this.movement[this.movement.length - 1];
  var previous = this.movement.length > 1 ?
      this.movement[this.movement.length - 2] : null;
  var response = selector.selectTarget(
      this.movement, params.di, params.dj, params.preferHorizontal);
  var select = response.select;
  // Allow the case where select is absent or equal to previous value.
  if (!select || (select.i == current.i && select.j == current.j)) {
    return false;
  }
  // Otherwise, can only move in one direction at a time.
  if (Math.abs(select.i - current.i) + Math.abs(select.j - current.j) != 1) {
    throw Error('bad prev');
  }
  // And only in the direction of the mouse.
  if ((params.di != 0 &&
          Math.sign(select.i - current.i) == -Math.sign(params.di)) ||
      (params.dj != 0 &&
           Math.sign(select.j - current.j) == -Math.sign(params.dj))) {
    throw Error('too complicated');
  }
  if (previous && (select.i == previous.i && select.j == previous.j)) {
    this.movement.pop();
    this.target = current;
    this.targetMaxProgress = null;
    this.progress = MAX_PROGRESS;
  } else {
    if (select.i == current.i && select.j == current.j) {
      throw Error();
    }
    this.target = select;
    this.targetMaxProgress = goog.isDefAndNotNull(response.maxProgress) ?
        response.maxProgress : null;
    this.targetIsEnd = !!response.isEnd;
    this.progress = 0;

  }
  return true;
}
Snake.prototype.getHead = function() {
  var lastTarget = this.movement[this.movement.length - 1];
  var x = lastTarget.i*UI.GRID_UNIT;
  var y = lastTarget.j*UI.GRID_UNIT;
  if (this.target) {
    x += (this.progress*UI.GRID_UNIT/MAX_PROGRESS) *
        (this.target.i - lastTarget.i);
    y += (this.progress*UI.GRID_UNIT/MAX_PROGRESS) *
        (this.target.j - lastTarget.j);
  }
  return {x: x, y: y};
}
Snake.prototype.render = function() {
  if (!this.anythingChanged()) {
    return;
  }
  // Initial output: start, direction. If last one, also include progress.
  // In the future, add arcs.
  var contents = [];
  var previous = null;
  for (var i = 0; i <= this.movement.length; i++) {
    var isEnd = i == this.movement.length;
    if (isEnd && !this.target) {
      continue;
    }
    var coords = isEnd ? this.target : this.movement[i];
    var segment = {i: coords.i, j: coords.j};
    if (!previous) {
      segment.segmentType = SegmentType.START;
    } else {
      segment.segmentType = isEnd ? SegmentType.END : SegmentType.MIDDLE;
      segment.direction = coords.i == previous.i ?
          DrawType.VLINE : DrawType.HLINE;
      if (isEnd && this.progress > 0) {
        var movingDownOrRight = coords.i > previous.i || coords.j > previous.j;
        // The offset to start/end of line.
        segment.start = movingDownOrRight ? 0 : MAX_PROGRESS - this.progress;
        segment.end = movingDownOrRight ? MAX_PROGRESS - this.progress : 0;
      }
      segment.i = Math.min(coords.i, previous.i);
      segment.j = Math.min(coords.j, previous.j);
    }
    contents.push(segment);
    previous = coords;
  }
  // Ugly DOM manipulation to insert SVG dynamically.
  if (!this.snakeEl) {
    this.snakeEl = document.createElementNS("http://www.w3.org/2000/svg", 'g')
    this.snakeEl.setAttribute('id', 'path' + this.snakeId);
    this.draw.appendChild(this.snakeEl);
  }
  // TODO: Incremental update to make performance even better.
  goog.soy.renderElement(
      this.snakeEl,
      windmill.templates.snakeSvg,
      {contents: contents});
}
Snake.prototype.anythingChanged = function() {
  // Cute little hash code avoid constantly rendering.
  var current = this.movement[this.movement.length - 1];
  var change = (
      current.i*16*16 +
      current.j*16 +
      this.movement.length)*MAX_PROGRESS + this.progress;
  if (this.lastChange == null || this.lastChange != change) {
    this.lastChange = change;
    return true;
  } else {
    return false;
  }
}
Snake.prototype.stringRepr = function() {
  var record = [];
  for (var i = 0; i < this.movement.length; i++) {
    record.push(this.movement[i].i + ',' + this.movement[i].j);
  }
  if (this.target) {
    record.push('->' + this.target.i + ',' + this.target.j +
        ' ' + this.progress);
  }
  return record.join(' ');
}
Snake.prototype.fade = function(opt_timeout, opt_callback) {
  if (!this.snakeEl) {
    throw Error();
  }
  // Optimized for single-snake case.
  if (opt_timeout) {
    this.snakeEl.style.transition = 'opacity ' + opt_timeout + 'ms ease-out';
    this.snakeEl.style.opacity = '0';
    setTimeout(goog.bind(function() {
      this.snakeEl.innerHTML = '';
      this.snakeEl.parentNode.removeChild(this.snakeEl);
      if (opt_callback) {
        opt_callback();
      }
    }, this), opt_timeout);
  } else {
    this.snakeEl.parentNode.removeChild(this.snakeEl);
  }
}


/** @interface */
windmill.Snake.NavigationSelector = function() {};
windmill.Snake.NavigationSelector.prototype.selectTarget = goog.abstractMethod;

});
