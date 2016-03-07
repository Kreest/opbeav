/**
 * @fileoverview
 * The monolithic Angular app which manages all grid chrome, views,
 * and server interactions.
 */
// TODO: Use @export for scope variables rather than string property access.
goog.provide('windmill.module');

goog.require('windmill.Grid');
goog.require('windmill.GridRenderer');
goog.require('windmill.GridUi');
goog.require('windmill.GridUiHook');
goog.require('goog.array');
goog.require('goog.asserts');
goog.require('goog.dom.classlist');
goog.require('goog.object');


// message *must* be a static string.
var logInToast = function(message) {
  return '<md-toast><span flex>' + message +
      '</span><a class="md-button" href="/login" target="_blank">' +
      'Log in</a></md-toast>'
}

/**
 * @ngInject
 * @constructor
 */
var ApiService = function($http, $mdToast) {
  this.$http = $http;
  this.$mdToast = $mdToast;
}
ApiService.prototype.error = function(response) {
  var $mdToast = this.$mdToast;
  // Should use a different status? This is technically reserved for basic
  // HTTP authentication.
  if (response.status == 401) {
    $mdToast.show({
      'template': logInToast('Error: Not authenticated')
    });
  } else {
    $mdToast.showSimple(
        response.status == 404 ? 'Error: Not found' : 'Server error');
  }
  throw Error();
}
ApiService.prototype.fetch = function(id) {
  return this.$http.get('/_/thing/' + id).then(
      function(response) {
        return response.data;
      },
      goog.bind(this.error, this));
}
ApiService.prototype.next = function(id) {
  return this.$http.get('/_/next/' + id).then(
      function(response) {
        return response.data;
      },
      goog.bind(this.error, this));
}
ApiService.prototype.solve = function(id, puzzlePath, timeMs) {
  var obj = {
    'id': id,
    'path': puzzlePath,
    'ms': timeMs
  }
  // Fire and forget...
  return this.$http.post('/_/solve', obj);
}
ApiService.prototype.lockThing = function(id) {
  var obj = {
    'id': id
  }
  return this.$http.post('/_/lock', obj).then(
      function(response) {},
      goog.bind(this.error, this));
}
ApiService.prototype.rateThing = function(id, vote) {
  var obj = {
    'id': id,
  }
  if (vote != 0) {
    obj['yay'] = vote == 1;
  }
  return this.$http.post('/_/rate', obj).then(
      function(response) {},
      goog.bind(this.error, this));
}
ApiService.prototype.changeUsername = function(name) {
  var obj = {
    'name': name || ''
  }
  return this.$http.post('/_/rename', obj).then(
      function(response) {},
      goog.bind(function(response) {
        // Pass along useful validation as string.
        if (response.data && response.data['userError']) {
          throw(response.data['userError']);
        } else {
          this.error(response);
        }
      }, this));
}
ApiService.prototype.self = function() {
  return this.$http.get('/_/self').then(
      function(response) {
        return response.data;
      },
      goog.bind(this.error, this));
}
ApiService.prototype.fetchAll = function(params, opt_start) {
  params = goog.object.clone(params);
  if (opt_start) {
    params['start'] = opt_start;
  }
  return this.$http.get('/_/things', {'params': params}).then(
      function(response) {
        return response.data;
      },
      goog.bind(this.error, this));
}
ApiService.prototype.publish = function(
    contents, isPrivate, captcha, opt_title, opt_desc, opt_puzzlePath) {
  var obj = {
    'contents': contents,
    'isPrivate': isPrivate,
    'captcha': captcha
  };
  if (opt_title && opt_title.trim()) {
    obj['title'] = opt_title.trim();
  }
  if (opt_desc && opt_desc.trim()) {
    obj['description'] = opt_desc.trim();
  }
  if (opt_puzzlePath) {
    obj['path'] = opt_puzzlePath;
  }
  return this.$http.post('/_/publish', obj).then(
      function(response) {
        return response.data;
      },
      goog.bind(this.error, this));
}


/**
 * @ngInject
 * @constructor
 */
var RenameDialogCtrl = function($scope, $apiService, $mdDialog) {
  // Properties
  $scope['model'] = {}
  // Functions.
  $scope.change = function() {
    $apiService.changeUsername($scope['model']['name'])
      .then(function() {
        $mdDialog.hide('success');
      }, function(error) {
        $scope['renameForm']['name'].$error['serverError'] = error;
      });
  }
  $scope.cancel = function() {
    $mdDialog.cancel();
  }
}


/**
 * @ngInject
 * @constructor
 */
var LockDialogCtrl = function($scope, $apiService, $mdDialog, $grid) {
  // Grid must be present to get puzzle id.
  if (!$grid.currentGridData()) {
    $mdDialog.cancel();
    return;
  }
  // Functions.
  $scope.lock = function() {
    var info = $grid.currentGridData();
    goog.asserts.assert(info);
    $apiService.lockThing(info['id'])
      .then(function() {
        $mdDialog.hide('success');
      });
  }
  $scope.cancel = function() {
    $mdDialog.cancel();
  }
}


/**
 * @ngInject
 * @constructor
 */
var PublishDialogCtrl = function(
    $scope, $apiService, $mdDialog, $mdToast, $grid) {
  // Grid must be fully present to save it.
  if (!$grid.isGridInitialized()) {
    $mdDialog.cancel();
    return;
  }
  // Properties (not including ng-models)
  $scope['solved'] = !!$grid.getSolvePath();
  $scope['allow'] = $scope['solved'];
  $scope['origin'] = window.location.origin;
  // Functions.
  $scope.save = function() {
    goog.asserts.assert($grid.isGridInitialized());
    var contents = $grid.getHash();
    var widgetId = $scope.widgetId_;
    var captcha = null;
    if (widgetId != undefined) {
      captcha = grecaptcha.getResponse(widgetId);
    }
    captcha = 'banana hammer';
    if (!captcha) {
      $mdToast.showSimple('You need to fill out the CAPTCHA');
      return;
    }
    $apiService.publish(
        contents, !$scope['allow'], captcha, $scope['title'], $scope['desc'],
        $grid.getSolvePath())
      .then(function(thing) {
        $mdDialog.hide(thing['id']);
      });
  }
  $scope.cancel = function() {
    $mdDialog.cancel();
  }
}


/**
 * @ngInject
 * @constructor
 */
var AppCtrl = function($scope, $handlers, $apiService, $self, $mdToast) {
  $scope['left'] = $handlers.handlers['left'];
  $scope['right'] = $handlers.handlers['right'];
  $scope.handle = function(isLeft, e, type) {
    $handlers.handle(isLeft, e, type);
  }
  $scope['self'] = $self.dict;
  var changePromo = false;
  $scope.$watch(function() {
    return $scope['self']['self'];
  }, function(newValue) {
    if (!changePromo && newValue) {
      changePromo = true;
      if ($self.usingDefaultName()) {
        var toastPlace = document.getElementById('tooltoast');
        $mdToast.show({
          'template': '<md-toast>Visit your user page to ' +
              'change your username</md-toast>',
          'parent': toastPlace,
          'position': 'top right',
          'hideDelay': 6000
        });
      }
    }
  });
}


/**
 * @ngInject
 * @constructor
 */
var HandlerService = function($mdToast) {
  this.handlers = {'left': {}, 'right': {}};
  this.mdToast = $mdToast;
}
HandlerService.prototype.handle = function(isLeft, e, type) {
  var handlers = this.handlers[isLeft ? 'left' : 'right'];
  if (!(type in handlers)) {
    this.mdToast.showSimple('Error');
    return;
  }
  var fn = handlers[type].handle;
  fn(e);
}
HandlerService.prototype.addHandler =
    function(isLeft, id, name, title, fn, opt_disabled) {
  var entry = {
    name: name,
    title: title,
    handle: fn,
    disabled: opt_disabled || false
  };
  this.handlers[isLeft ? 'left' : 'right'][id] = entry;
}
HandlerService.prototype.setEnabled = function(isLeft, id, val) {
  this.handlers[isLeft ? 'left' : 'right'][id].disabled = !!val;
}
HandlerService.prototype.resetHandlers = function() {
  goog.object.clear(this.handlers['left']);
  goog.object.clear(this.handlers['right']);
}



/**
 * @ngInject
 * @constructor
 */
var EditorCtrl = function(
    $scope, $rootScope, $grid, $mdSidenav, $mdMedia, $mdDialog,
    $handlers, $state) {
  // State initialization.
  $scope['obj'] = null;
  $scope['color'] = 1;
  $scope['count'] = 0;
  $scope['tetris'] = {
    'true': {'w': 5, 'h': 5, 'g': Array(5*5), 'f': true},
    'false': {'w': 5, 'h': 5, 'g': Array(5*5), 'f': true}
  }
  $scope['neg'] = false;
  $scope['origin'] = window.location.origin;
  // May be nullable.
  var initializeGridData = function() {
    if ($grid.isGridInitialized()) {
      var dim = $grid.getDimensions();
      $scope['w'] = dim.width;
      $scope['h'] = dim.height;
    }
    // If initialized from hash, manually close pane.
    // With sunsetting of static simulator, this has changed
    // to never close.
    $scope['close'] = false;
  }
  initializeGridData();
  // Some data.
  $scope['cent'] = {
    'square': {'color': true, 'name': 'Square'},
    'star': {'color': true, 'name': 'Sun/Star'},
    'tetris': {'name': 'Polyomino'},
    'negative': {'name': 'Blue polyomino'},
    'error': {'name': 'Y'},
    'triangle': {'name': 'Triangle'}
  };
  $scope['gent'] = [
    'start',
    'end',
    'hexagon',
    'disjoint'
  ];
  $scope['ccodes'] = {
      1: 'black',
      2: 'white',
      3: 'cyan',
      4: 'magenta',
      5: 'yellow',
      6: 'red',
      7: 'green',
      8: 'blue'
  }
  // Some utilities.
  var safeInt = function(i) {
    i = parseInt(i);
    return isNaN(i) ? null : i;
  }
  // Template facing events.
  $scope.range = function(num) {
    return Array(num);
  }
  $scope.editOpen = function() {
    return $mdSidenav('edit').isOpen() || $mdSidenav('edit').isLockedOpen();
  }
  $scope.cancelSelect = function() {
    $scope['obj'] = null;
  }
  $scope.select = function(n) {
    if ($scope['obj'] == n) {
      if (n == 'triangle') {
        $scope['count']++;
      }
      if (n == 'tetris' || n == 'negative') {
        // Reset the grid on re-click.
        var tetris = $scope['tetris'][$scope['neg']];
        tetris['g'] = Array(5*5);
      }
    } else {
      $scope['obj'] = n;
      $scope['neg'] = n == 'negative';
    }
  }
  $scope.getSelectClass = function(n) {
    return n == $scope['obj'] ? 'isSelected' : null;
  }
  $scope.selectColor = function(n) {
    $scope['color'] = n;
  }
  $scope.colorForShape = function(i, j, neg) {
    var tetris = $scope['tetris'][neg];
    return tetris['g'][i+tetris['w']*j] ? (neg ? 'blue' : 'yellow') : null;
  }
  $scope.selectShape = function(i, j) {
    var tetris = $scope['tetris'][$scope['neg']];
    tetris['g'][i+tetris['w']*j] ^= 1;
  }
  $scope.toggleEdit = function(opt_val) {
    if (!$scope.editOpen() && (opt_val == undefined || opt_val == true)) {
      $scope['close'] = false;
      if (!$mdMedia('gt-sm')) {
        $mdSidenav('edit').open();
      }
    } else {
      $scope['close'] = true;
      if (!$mdMedia('gt-sm')) {
        $mdSidenav('edit').close();
      }
    }
  }
  // Some watching.
  var alertGrid = function() {
    if (!$grid.isGridInitialized()) {
      return;
    }
    var tetris = $scope['tetris'][$scope['neg']];
    if ($scope.editOpen()) {
      var data = {
        type: $scope['obj'],
        color: safeInt($scope['color']),
        width: safeInt($scope['w']),
        height: safeInt($scope['h']),
        grid: tetris['g'],
        gridWidth: 5,
        gridFixed: tetris['f'],
        count: $scope['count']
      };
      $grid.setEditEntity(data);
    } else if ($mdMedia('gt-sm')) {
      $grid.setEditEntity(null);
    }
  }
  $scope.$watch(function() {
    return $scope.editOpen();
  }, alertGrid)
  $scope.$watch(function() {
    var tetris = $scope['tetris'][$scope['neg']];
    return [
      $scope['obj'], $scope['color'], $scope['w'], $scope['h'],
      tetris['f'], $scope['neg'], $scope['count']
    ].join('.')
  }, alertGrid);
  $scope.$watch(function() {
    return $scope['tetris'][$scope['neg']]['g'];
  }, alertGrid, true);
  // Special handlers.
  $handlers.addHandler(
      true, 'edit', 'Edit',
      'Open the editor side panel',
      function() {
    $scope.toggleEdit();
  });
  var gridAvailable = $grid.isGridInitialized();
  if ($rootScope['wind']) {
    $handlers.addHandler(
        false, 'publish', 'Publish',
        'Create a new permanent short link...',
        function(e) {
      $mdDialog.show({
        'controller': PublishDialogCtrl,
        'templateUrl': COMPILED ?
            '/static/publish.tmpl.html' : '/publish.tmpl.html',
        'parent': angular.element(document.body),
        'targetEvent': e,
        'clickOutsideToClose': true,
        'onComplete': function(scope) {
          // try/catch is for offline.
          try {
            // This site key is only applicable for thefifthmatt.com.
            // (Perhaps turn this into a Closure define?)
            scope.widgetId_ = grecaptcha.render('recaptcha', {
              'sitekey':'6Le7ZhgTAAAAAK_QfovkO44BHr4isqCI7QeqAiPo'
            })
          } catch (e) {
            console.log(e);
          }
        }
      }).then(function(id) {
        if (id) {
          $scope['pub'] = id;
        }
      }, function() {
        // Cancelled.
      });
    });
  } else {
    $handlers.addHandler(
        false, 'windmill', 'Go to Windmill (new site)',
        'Edit this puzzle in The Windmill',
        function(e) {
      window.location.href = 'https://windmill.thefifthmatt.com/build/' +
          $grid.getHash();
    }, !gridAvailable);
  }
  $handlers.addHandler(
      false, 'save', 'Checkpoint',
      'Update the URL so you can return to this puzzle by URL without ' +
          'publishing it',
      function() {
    var state = $grid.getHash();
    if (window.location.pathname.endsWith('.html')) {
      window.location.hash = state;
    } else {
      $state.go('build.data', {'data': state});
    }
  }, !gridAvailable);
  $grid.load.then(function() {
    // Timeout necessary because the grid can't just be rendered, it has to
    // be in the document, and the controller is initiated before document
    // inclusion.
    setTimeout(function() {
      $grid.render();
      if (!gridAvailable) {
        initializeGridData();
        $handlers.setEnabled(false, 'save', true);
        if ($rootScope['wind']) {
          $handlers.setEnabled(false, 'publish', true);
        } else {
          $handlers.setEnabled(false, 'windmill', true);
        }
        gridAvailable = true;
      }
      $scope.$digest();
    }, 0);
  });
}


/**
 * @ngInject
 * @constructor
 */
var ListCtrl = function(
    $scope, $grid, $handlers, $stateParams, $state, $mdDialog, $mdToast,
    $self) {
  $scope['user'] = $stateParams['user'];
  $scope['sorts'] = ['hot', 'new', 'old', 'top', 'solved', 'unsolved'];
  $scope['sortTexts'] = {
    'hot': 'Hottest puzzles',
    'new': 'Newest puzzles',
    'old': 'Oldest puzzles',
    'top': 'Top puzzles',
    'solved': 'Most solved puzzles',
    'unsolved': 'Least solved puzzles'
  }
  var defaultSort = 'hot';
  if (goog.array.contains($scope['sorts'], $stateParams['sort'])) {
    defaultSort = $stateParams['sort'];
  }
  $scope['model'] = {'sortBy': defaultSort};
  $scope.$watch(function() {
    return $scope['model']['sortBy'];
  }, function(newValue, oldValue) {
    if (newValue != oldValue) {
      var params = goog.object.clone($stateParams);
      params['sort'] = newValue;
      $state.go('.', params);
    }
  });
  if ($self.loggedIn() && $self.isUser($scope['user'])) {
    $handlers.addHandler(
        false, 'rename', 'Change username',
        'Change your public username',
        function(e) {
      $mdDialog.show({
        'controller': RenameDialogCtrl,
        'templateUrl': COMPILED ?
            '/static/rename.tmpl.html' : '/rename.tmpl.html',
        'parent': angular.element(document.body),
        'targetEvent': e,
        'clickOutsideToClose': true,
      }).then(function(id) {
        if (id == 'success') {
          $mdToast.showSimple('Refresh to show new username');
        }
      }, function() {
        // Cancelled.
      });
    });
  }
  var tryRender = function(el) {
    var id = el.getAttribute('data-id');
    var svg = el.getElementsByTagName('svg')[0];
    var group = el.getElementsByTagName('g')[0];
    if (!id || !svg || !group) {
      return;
    }
    var data = $grid.playDataCache[id];
    var c = data['contents'];
    if (!data || c.length > 2000) {
      return;
    }
    var g = new windmill.Grid();
    if (!g.initialize(undefined, undefined, c)) {
      return;
    }
    if (g.width > 7 && g.height > 7 && c.length > 500) {
      return;
    }
    var r = new windmill.GridRenderer(g, group);
    svg.setAttribute('viewBox',
        '0 0 ' + r.getRenderWidth() + ' ' + r.getRenderHeight());
    r.render();
    return true;
  }
  var loadGrids = function() {
    $scope['grids'] = goog.array.clone($grid.playDataList);
    $scope['more'] = $grid.hasMore;
    $scope.$digest();
    setTimeout(function() {
      goog.array.forEach(
          document.getElementsByClassName('gridSquare'), function(el) {
        if (goog.dom.classlist.contains(el, 'renderSuccess') ||
            goog.dom.classlist.contains(el, 'renderFailure')) {
          return;
        }
        if (tryRender(el)) {
          goog.dom.classlist.add(el, 'renderSuccess');
        } else {
          goog.dom.classlist.add(el, 'renderFail');
        }
      });
    });
  }
  $scope.loadMore = function() {
    var amt = $scope['grids'].length;
    $grid.preloadPlaySequence();
    $grid.load.then(function() {
      setTimeout(loadGrids);
    });
  }
  $grid.load.then(function() {
    setTimeout(loadGrids);
  });
}


/**
 * @ngInject
 * @constructor
 */
var SelfService = function($rootScope, $apiService) {
  var dict = this.dict = {}
  // Errors out if not windmill.
  if ($rootScope['wind']) {
    $apiService.self().then(function(res) {
      setTimeout(function() {
        goog.object.extend(dict, res);
        $rootScope.$digest();
      });
    });
  }
}
SelfService.prototype.loggedIn = function() {
  return !!this.dict['self'];
}
SelfService.prototype.isUser = function(user) {
  return this.dict['self'] == user;
}
SelfService.prototype.usingDefaultName = function() {
  return this.dict['self'] &&
      this.dict['self'] == this.dict['name'];
}



/**
 * @ngInject
 * @constructor
 */
var RatingCtrl = function($scope, $apiService, $self, $mdToast) {
  $scope['rinfo'] = {};
  $scope.init = function(info) {
    $scope['rinfo'] = info;
  }
  $scope.rate = function(vote) {
    if (!$self.loggedIn()) {
      $mdToast.show({
        'template': logInToast('Log in to vote')
      });
      return;
    }
    var id = $scope['rinfo']['id']
    if (!id) {
      return;
    }
    var currentVote = $scope['rinfo']['voted'];
    if (vote == currentVote) {
      vote = 0;
    }
    $scope['rinfo']['voted'] = vote;
    $apiService.rateThing(id, vote);
  }
}


/**
 * @ngInject
 * @constructor
 */
var PlayCtrl = function(
    $scope, $grid, $handlers, $state, $apiService, $mdToast, $mdDialog, $self,
    $stateParams) {
  $scope['info'] = {};
  $scope['solves'] = null
  $handlers.addHandler(
      true, 'edit', 'Edit',
      'Go to a page to edit this puzzle',
      function() {
    var state = $grid.getHash();
    $state.go('build.data', {'data': state});
  }, !$grid.isGridInitialized());
  $scope['autoplay'] = $stateParams['autoplay'];
  $handlers.addHandler(
      false, 'autoplay', 'Go to random puzzle',
      "Go to a puzzle you haven't solved or rated",
      function() {
    $scope['autoplay'] = true;
    var bottom = document.getElementById('bottom');
    if (bottom) {
      // Wait for digest...
      setTimeout(function() {
        bottom.scrollIntoView();
      });
    }
    //$state.go('build.data', {'data': state});
  }, !$self.loggedIn());
  $scope.next = function(opt_vote) {
    if ($scope['nexting']) {
      // Silently fail rather than disable buttons or something.
      return;
    }
    $scope['nexting'] = true;
    var id = $stateParams['id'];
    var goNext = function() {
      return $apiService.next(id).then(function(next) {
        if (next.id) {
          $state.go('play', {'id': next.id, 'autoplay': true});
        } else {
          $mdToast.showSimple('You\'ve rated and/or solved everything! ' +
              'Go make some puzzles!');
        }
      }).finally(function() {
        $scope['nexting'] = false;
      });
    }
    if (opt_vote) {
      $apiService.rateThing(id, opt_vote).then(goNext);
    } else {
      goNext();
    }
  }
  $scope.lockDialog = function(e) {
    $mdDialog.show({
      'controller': LockDialogCtrl,
      'templateUrl': COMPILED ? '/static/lock.tmpl.html' : '/lock.tmpl.html',
      'parent': angular.element(document.body),
      'targetEvent': e,
      'clickOutsideToClose': true,
    }).then(function(id) {
      if (id == 'success') {
        $scope['info']['isPrivate'] = true;
        setTimeout(function() {
          $scope.$digest();
        });
      }
    }, function() {
      // Cancelled.
    });
  }
  var startTime = new Date();
  $grid.load.then(function() {
    var data = $grid.currentGridData();
    $grid.getUiHook().onSuccess = function(path) {
      var elapsed = new Date() - startTime;
      var id = data['id'];
      if (id) {
        $apiService.solve(id, path, elapsed);
      }
      PlayCtrl.clientSolved[id] = true;
      if (!$self.loggedIn() &&
          goog.object.getCount(PlayCtrl.clientSolved) == 2 &&
          !PlayCtrl.promoShown) {
        $mdToast.showSimple("FYI: Log in to mark puzzles as solved");
        PlayCtrl.promoShown = true;
      }
      startTime = new Date();
      // Hm... doesn't refresh authoritative copy.
      if (!$scope['info']['done']) {
        $scope['info']['localSolveText'] =
          solveText(($scope['info']['solves']||0) + 1);
      }
      $scope['info']['done'] = true;
      $scope.$digest();
    }
    if ($self.loggedIn()) {
      $scope['user'] = true;
    }
    if ($self.isUser(data['creator'])) {
      $scope['mine'] = true;
    }
    // grid.load can be synchronous sometimes, and template
    // rendering can occur after controller initialization.
    // To avoid rendering into nothing and digesting in controller
    // constructor, set timeout it is.
    setTimeout(function() {
      $grid.render();
      // Keep the same instance for child controllers sharing state.
      goog.object.extend($scope['info'], data);
      $handlers.setEnabled(true, 'edit', true);
      if ($self.loggedIn()) {
        $handlers.setEnabled(false, 'autoplay', true);
      }
      $scope.$digest();
    }, 0);
  });
}
PlayCtrl.clientSolved = {};
PlayCtrl.promoShown = false;

function calcTimeAgo(timestamp) {
  // TODO: Should get library to do this. Yay localization.
  var seconds = Math.floor((new Date() - timestamp) / 1000);
  var word, interval;
  if (seconds < 60) {
    // Don't have 'n seconds' for the time being.
    return 'just now';
  } else if (seconds >= (interval = 60 * 60 * 24 * 365)) {
    word = 'year';
  } else if (seconds >= (interval = 60 * 60 * 24 * 30)) {
    word = 'month';
  } else if (seconds >= (interval = 60 * 60 * 24)) {
    word = 'day';
  } else if (seconds >= (interval = 60 * 60)) {
    word = 'hour';
  } else if (seconds >= (interval = 60)) {
    word = 'minute';
  } else {
    interval = 1;
    word = 'second';
  }
  var count = Math.floor(seconds / interval);
  return count + ' ' + word + (count == 1 ? '' : 's') + ' ago';
}
var solveText = function(s) {
  return s + ' solve' + (s == 1 ? '' : 's');
}
var augmentInfo = function(info, opt_humanText) {
  if ('solves' in info) {
    var s = parseInt(info['solves']);
    info['solveText'] = solveText(s);
  }
  if ('creatorName' in info) {
    info['name'] = info['creatorName'];
  } else {
    info['name'] = info['creator'];
  }
  if ('voted' in info) {
    info['localVotes'] = info['upvotes'] - info['voted'];
  } else {
    info['localVotes'] = info['upvotes'];
  }
  if (info['createUtc']) {
    info['timeAgo'] = calcTimeAgo(info['createUtc']);
    info['exactTime'] = new Date(info['createUtc']).toString();
  }
}

/**
 * @ngInject
 * @constructor
 */
// TODO: This object does too much.
// It should be more like an OO factory than a master state maintainer.
var GridService = function($q, $apiService, $mdToast) {
  this.q = $q;
  this.apiService = $apiService;
  this.mdToast = $mdToast;
  this.playDataCache = {};
  this.reset();
}
GridService.prototype.resetGrid = function() {
  if (typeof this.grid_ != 'undefined' && this.grid_) {
    this.grid_.dispose();
  }
  this.grid_ = null;
}
GridService.prototype.reset = function() {
  this.resetGrid();
  this.playDataList = [];
  this.playSequence = null;
  this.playIndex = 0;
  this.hasMore = false;
  // Load promise.
  var def = this.q.defer();
  def.resolve();
  this.load = def.promise;
}
GridService.prototype.mutate_ = function(fn) {
  fn = goog.bind(fn, this);
  this.load = this.load.then(fn, fn);
  return this.load;
}
GridService.prototype.setPlaySequenceThing = function(id) {
  if (!this.playSequence) {
    throw Error();
  }
  this.resetGrid();
  for (var i = 0; i < this.playDataList.length; i++) {
    if (this.playDataList[i].id == id) {
      this.playIndex = i;
      return;
    }
  }
  throw Error('Not found');
}
GridService.prototype.setPlaySequence =
    function(opt_user, opt_sort, opt_start) {
  // And loads the first grid in the play sequence.
  this.reset();
  this.mutate_(function() {
    var sequence = {}
    if (opt_user) {
      sequence['user'] = opt_user
    }
    if (opt_sort) {
      sequence['sort'] = opt_sort
    }
    return this.apiService.fetchAll(sequence, opt_start)
        .then(goog.bind(function(result) {
      this.hasMore = result['hasMore'];
      // Btw it's okay for datas to be empty.
      // Say, on server startup.
      var datas = result['things'];
      goog.array.forEach(datas, function(data) {
        this.playDataCache[data['id']] = data;
        augmentInfo(data);
      }, this);
      this.playDataList = datas;
      this.playSequence = sequence;
    }, this));
  });
}
GridService.prototype.getNext = function() {
  return this.mutate_(function() {
    if (!this.playSequence) {
      throw Error();
    }
    if (this.playIndex < this.playDataList.length - 1) {
      return this.playDataList[this.playIndex + 1];
    }
    var oldLength = this.playDataList.length;
    return this.extendPlaySequence_().then(goog.bind(function() {
      return this.playDataList.length == oldLength ? null : oldLength;
    }, this));
  }, this);
}
GridService.prototype.preloadPlaySequence = function() {
  this.mutate_(function() {
    return this.extendPlaySequence_();
  }, this);
}
GridService.prototype.extendPlaySequence_ = function() {
  if (!this.playSequence) {
    throw Error();
  }
  var start = this.playDataList[this.playDataList.length - 1]['id'];
  return this.apiService.fetchAll(this.playSequence, start)
      .then(goog.bind(function(result) {
    this.hasMore = result['hasMore'];
    var datas = result['things'];
    if (!datas.length) {
      return;
    }
    goog.array.forEach(datas, function(data) {
      this.playDataCache[data['id']] = data;
      augmentInfo(data);
    }, this);
    goog.array.extend(this.playDataList, datas);
  }, this));
}
GridService.prototype.setPlaySync_ = function(data) {
  this.playIndex = 0;
  this.playDataList = [data];
}
GridService.prototype.setPlay = function(id) {
  this.reset();
  this.mutate_(function() {
    if (id in this.playDataCache) {
      this.setPlaySync_(this.playDataCache[id]);
      // Fire and forget fetch, for the views.
      this.apiService.fetch(id);
    } else {
      return this.apiService.fetch(id).then(goog.bind(function(data) {
        this.playDataCache[id] = data;
        augmentInfo(data);
        this.setPlaySync_(data);
      }, this));
    }
  });
}
GridService.prototype.setBuild = function(data) {
  // Build-to-build transitions: keep the grid, reinitialize.
  // This is hacky and we need grid factories, not this mutate_ business.
  if (this.playDataList.length || !this.grid_) {
    this.reset();
    this.mutate_(function() {
      this.grid_ = this.newGridUi_(data);
    });
  } else if (this.grid) {
    // TODO: Clean up this interface.
    this.grid_.grid.initialize(undefined, undefined, data);
    this.grid_.render();
  }
}
GridService.prototype.isGridInitialized = function() {
  return !!this.currentGrid();
}
// TODO: Make this private.
GridService.prototype.currentGrid = function() {
  if (!this.grid_ && this.playDataList.length) {
    var data = this.currentGridData();
    this.grid_ = this.newGridUi_(data['contents']);
  }
  return this.grid_ || null;
}
GridService.prototype.currentGridData = function() {
  if (this.playDataList.length) {
    return goog.asserts.assert(this.playDataList[this.playIndex]);
  }
  return null;
}
GridService.prototype.newGridUi_ = function(data) {
  var grid = new windmill.Grid();
  if (data) {
    if (!grid.initialize(undefined, undefined, data)) {
      this.mdToast.showSimple('Invalid build state');
    }
  }
  var uiHook = new windmill.GridUiHook();
  uiHook.showToast = goog.bind(this.mdToast.showSimple, this.mdToast);
  var gui = new windmill.GridUi(grid, uiHook);
  return gui;
}
// Now, all of the convenient grid access functions.
// They all throw if there's no grid.
GridService.prototype.getHash = function() {
  var grid = goog.asserts.assert(this.currentGrid());
  return grid.grid.getHash();
}
GridService.prototype.getSolvePath = function() {
  var grid = goog.asserts.assert(this.currentGrid());
  return grid.solvedPuzzleVersion == grid.solvedPuzzleVersion ?
      grid.solvedPuzzlePath : null;
}
GridService.prototype.getDimensions = function() {
  var grid = goog.asserts.assert(this.currentGrid());
  return {width: grid.grid.width, height: grid.grid.height};
}
GridService.prototype.setEditEntity = function(opt_data) {
  var grid = goog.asserts.assert(this.currentGrid());
  if (opt_data) {
    grid.setEditEntity(opt_data);
  } else {
    grid.clearEditEntity(opt_data);
  }
}
GridService.prototype.getUiHook = function() {
  var grid = goog.asserts.assert(this.currentGrid());
  return grid.uiHook;
}
GridService.prototype.render = function() {
  var grid = goog.asserts.assert(this.currentGrid());
  grid.render();
}


/** @ngInject */
var initializeHashGrid = function($grid, $stateParams) {
  var data;
  if (window.location.hash) {
    data = window.location.hash.substring(1);
  }
  $grid.setBuild(data);
  return $grid.load;
}
/** @ngInject */
var initializeBuildGrid = function($grid, $stateParams) {
  var data = $stateParams['data'];
  $grid.setBuild(data);
  return $grid.load;
}
/** @ngInject */
var initializePlayGrid = function($grid, $stateParams) {
  var id = $stateParams['id'];
  $grid.setPlay(id);
  return $grid.load;
}
/** @ngInject */
var initializeListGrid = function($grid, $stateParams) {
  var user = $stateParams['user'] || undefined;
  var sort = $stateParams['sort'] || undefined;
  $grid.setPlaySequence(user, sort);
  return $grid.load;
}

/**
 * @ngInject
 * @constructor
 */
var Config = function(
    $mdIconProvider, $stateProvider, $locationProvider,
    $urlRouterProvider) {
  // Autoredirect to the new site.
  if (window.location.pathname == '/witness/build.html' &&
      window.location.origin == 'http://thefifthmatt.com' &&
      // Redirect is *off* by default!
      // TODO: Turn me on.
      window.location.href.indexOf('redir=1') != -1) {
    var path = 'https://windmill.thefifthmatt.com/build';
    if (window.location.hash) {
      path += '/' + encodeURIComponent(window.location.hash);
    }
    window.location.href = path;
  }
  $mdIconProvider
    .iconSet('witness', '/static/witness.svg?v=0', 100)
  $mdIconProvider
    .icon('basic', '/static/basic.svg', 550)

  $locationProvider.html5Mode({enabled: true, requireBase: false});

  var prefix = COMPILED ? '/static' : '/src';
  // Views.
  $stateProvider
      // First, the legacy HTML. Abuse child states here.
      .state('buildhtml', {
        'templateUrl': prefix + '/build.tmpl.html',
        'resolve': {
          'grid': initializeHashGrid
        },
        'controller': 'EditorCtrl'
      })
      .state('buildhtml.witness', {
        'url': '/main.html'
      })
      .state('buildhtml.build', {
        'url': '/build.html'
      })
      .state('buildhtml.build2', {
        'url': '/witness/build.html'
      })
      .state('home', {
        'url': '/?sort',
        'templateUrl': prefix + '/index.tmpl.html',
        'controller': 'ListCtrl',
        'resolve': {
          'grids': initializeListGrid
        },
      })
      .state('user', {
        'url': '/user/:user',
        'templateUrl': prefix + '/index.tmpl.html',
        'controller': 'ListCtrl',
        'resolve': {
          'grids': initializeListGrid
        },
      })
      // Now, the main build template. No URL.
      // It does not "hold" the data URL, which allows us to change it
      // without wiping out the existing grid/editor.
      .state('build', {
        'templateUrl': prefix + '/build.tmpl.html',
        'controller': 'EditorCtrl'
      })
      .state('build.nodata', {
        'url': '/build',
        'resolve': {
          'grid': initializeBuildGrid
        },
      })
      .state('build.data', {
        'url': '/build/:data',
        // Must exist so we commandeer the data param.
        'controller': function() {},
        'resolve': {
          'grid': initializeBuildGrid
        },
      })
      .state('play', {
        'url': '/{id:[a-z0-9]{7}}',
        'params': {'autoplay': false},
        'templateUrl': prefix + '/play.tmpl.html',
        'resolve': {
          'grid': initializePlayGrid
        },
        'controller': 'PlayCtrl'
      })
      .state('login', {
        'url': '/login',
        'templateUrl': prefix + '/login.tmpl.html',
      })
      .state('faq', {
        'url': '/faq',
        'templateUrl': prefix + '/faq.tmpl.html',
      });
}


/** @ngInject */
var runSetup = function($rootScope, $handlers, $grid) {
  $rootScope['wind'] = !window.location.pathname.endsWith('.html');
  $rootScope['editing'] = false;
  $rootScope.$on('$stateChangeStart',
      function(event, toState, toParams, fromState, fromParams, options) {
        // Reset toolbar buttons.
        // Special handling for build-to-build transition.
        // More general way to do handler-resetting would be through
        // longest common prefix.
        var grid2Grid =
            toState.name.startsWith('build.') &&
            fromState.name.startsWith('build.');
        if (!grid2Grid) {
          $handlers.resetHandlers();
        }
        // This should be somewhere better, like in the
        // subcontroller for the grid sub-view.
        if (grid2Grid && $grid.isGridInitialized()) {
          // render is usually called by the controller on creation.
          // When checkpointing, however, the controller stays the
          // same, so we manually do it here. Hacky hacky.
          $grid.render();
        }
        $rootScope['editing'] =
            toState.name.startsWith('build.');
      })
  $rootScope.$on('$stateChangeError',
      function(event, toState, toParams, fromState, fromParams, error) {
        console.log(error);
      });
}

windmill.module = angular.module('SimApp', ['ngMaterial', 'ui.router'])
    .controller('AppCtrl', AppCtrl)
    .controller('EditorCtrl', EditorCtrl)
    .controller('PlayCtrl', PlayCtrl)
    .controller('RatingCtrl', RatingCtrl)
    .controller('ListCtrl', ListCtrl)
    .service('$grid', GridService)
    .service('$self', SelfService)
    .service('$handlers', HandlerService)
    .service('$apiService', ApiService)
    .filter('capitalize', function() {
      return function(s) {
          return s.charAt(0).toUpperCase() + s.substr(1);
      }
    })
    .config(Config)
    .run(runSetup);

angular.element(document).ready(function() {
  angular.bootstrap(document.body, ['SimApp']);
});

