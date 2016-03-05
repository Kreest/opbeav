Element.prototype.requestPointerLock = function() {};
Element.prototype.mozRequestPointerLock = function() {};
Element.prototype.webkitRequestPointerLock = function() {};
Document.prototype.exitPointerLock = function() {};
Document.prototype.mozExitPointerLock = function() {};
Document.prototype.webkitExitPointerLock = function() {};
/** @type {Element} */
Document.prototype.pointerLockElement;
/** @type {Element} */
Document.prototype.mozPointerLockElement;
/** @type {Element} */
Document.prototype.webkitPointerLockElement;
/** @type {number} */
MouseEvent.prototype.movementX;
/** @type {number} */
MouseEvent.prototype.movementY;

var grecaptcha = {};
/**
 * @param {(string|Element)} container
 * @param {Object=} parameters
 * @return {number}
 */
grecaptcha.render = function(container, parameters) {};
/** @param {number=} opt_widget_id */
grecaptcha.reset = function (opt_widget_id) {};
/** @param {number} opt_widget_id */
grecaptcha.getResponse = function (opt_widget_id) {};
