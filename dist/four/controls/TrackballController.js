'use strict';

var FOUR = FOUR || {};

/**
 * Trackball controller.
 * @todo listen for camera change on the viewport
 * @todo listen for domelement resize events
 * @todo handle mouse position, sizing differences between document and domelements
 */
FOUR.TrackballController = (function () {

    var STATE = {
        NONE: -1,
        ROTATE: 0,
        ZOOM: 1,
        PAN: 2,
        TOUCH_ROTATE: 3,
        TOUCH_ZOOM_PAN: 4
    };

    var _state = STATE.NONE,
      _prevState = STATE.NONE,

      _eye = new THREE.Vector3(),

      _movePrev = new THREE.Vector2(),
      _moveCurr = new THREE.Vector2(),

      _lastAxis = new THREE.Vector3(),
      _lastAngle = 0,

      _zoomStart = new THREE.Vector2(),
      _zoomEnd = new THREE.Vector2(),

      _touchZoomDistanceStart = 0,
      _touchZoomDistanceEnd = 0,

      _panStart = new THREE.Vector2(),
      _panEnd = new THREE.Vector2(),

      _key = null;

    function TrackballController (camera, domElement) {
        THREE.EventDispatcher.call(this);

        var self = this;

        self.EPS = 0.000001;
        self.EVENTS = {
            CHANGE: {type: 'change'},
            END: {type: 'end'},
            START: {type: 'start'}
        };
        self.KEY = {
            A: 65,
            S: 83,
            D: 68,
            I: 73,
            J: 74,
            K: 75,
            L: 76,

            CANCEL: 27,
            MOVE_FORWARD: 73,
            MOVE_LEFT: 74,
            MOVE_BACK: 75,
            MOVE_RIGHT: 76,
            MOVE_UP: 85,
            MOVE_DOWN: 79
        };
        self.MODE = {
            SELECTION: 0,
            TRACKBALL: 1,
            FIRSTPERSON: 2,
            ORBIT: 3
        };
        self.MOUSE_STATE = {
            UP: 0,
            DOWN: 1,
            MOVE: 2
        };

        // API
        self.allowZoom = true;
        self.allowPan = true;
        self.allowRotate = true;
        self.camera = camera;
        self.domElement = (domElement !== undefined) ? domElement : document;
        self.dynamicDampingFactor = 0.2;
        self.enabled = true;
        self.keys = [
            65 /*A*/, 83 /*S*/, 68 /*D*/,
            73 /*I*/, 74 /*J*/, 75 /*K*/, 76 /*L*/
        ];
        self.lastPosition = new THREE.Vector3();
        self.maxDistance = Infinity;
        self.minDistance = 0;
        self.mouse = self.MOUSE_STATE.UP;
        self.panSpeed = 0.3;
        self.rotateSpeed = 1.0;
        self.screen = { left: 0, top: 0, width: 0, height: 0 };
        self.staticMoving = false;
        self.target = new THREE.Vector3();
        self.zoomSpeed = 1.2;

        // for reset
        self.target0 = self.target.clone();
        self.position0 = self.camera.position.clone();
        self.up0 = self.camera.up.clone();
    }

    TrackballController.prototype = Object.create(THREE.EventDispatcher.prototype);

    TrackballController.prototype.constructor = TrackballController;

    TrackballController.prototype.checkDistances = function () {
        var self = this;
        if (self.allowZoom || self.allowPan) {
            if (_eye.lengthSq() > self.maxDistance * self.maxDistance) {
                self.camera.position.addVectors(self.target, _eye.setLength(self.maxDistance));
                _zoomStart.copy(_zoomEnd);
            }
            if (_eye.lengthSq() < self.minDistance * self.minDistance) {
                self.camera.position.addVectors(self.target, _eye.setLength(self.minDistance));
                _zoomStart.copy(_zoomEnd);
            }
        }
    };

    TrackballController.prototype.contextmenu = function (event) {
        event.preventDefault();
    };

    TrackballController.prototype.disable = function () {
        var self = this;
        self.enabled = false;
        self.domElement.removeEventListener('contextmenu', self.contextmenu, false);
        self.domElement.removeEventListener('mousedown', self.mousedown, false);
        self.domElement.removeEventListener('mousemove', self.mousemove, false);
        self.domElement.removeEventListener('mouseup', self.mouseup, false);
        self.domElement.removeEventListener('mousewheel', self.mousewheel, false);
        self.domElement.removeEventListener('DOMMouseScroll', self.mousewheel, false); // firefox
        self.domElement.removeEventListener('touchstart', self.touchstart, false);
        self.domElement.removeEventListener('touchend', self.touchend, false);
        self.domElement.removeEventListener('touchmove', self.touchmove, false);

        window.removeEventListener('keydown', self.keydown, false);
        window.removeEventListener('keyup', self.keyup, false);
    };

    TrackballController.prototype.enable = function () {
        var self = this;
        self.enabled = true;
        self.handleResize(); // update screen size settings
        self.domElement.addEventListener('contextmenu', self.contextmenu.bind(self), false);
        self.domElement.addEventListener('mousedown', self.mousedown.bind(self), false);
        self.domElement.addEventListener('mousemove', self.mousemove.bind(self), false);
        self.domElement.addEventListener('mouseup', self.mouseup.bind(self), false);
        self.domElement.addEventListener('mousewheel', self.mousewheel.bind(self), false);
        self.domElement.addEventListener('DOMMouseScroll', self.mousewheel.bind(self), false); // firefox
        self.domElement.addEventListener('touchstart', self.touchstart.bind(self), false);
        self.domElement.addEventListener('touchend', self.touchend.bind(self), false);
        self.domElement.addEventListener('touchmove', self.touchmove.bind(self), false);

        window.addEventListener('keydown', self.keydown.bind(self), false);
        window.addEventListener('keyup', self.keyup.bind(self), false);
    };

    TrackballController.prototype.getMouseOnCircle = (function () {
        var vector = new THREE.Vector2();
        return function getMouseOnCircle(pageX, pageY) {
            vector.set(
              ((pageX - this.screen.width * 0.5 - this.screen.left) / (this.screen.width * 0.5)),
              ((this.screen.height + 2 * (this.screen.top - pageY)) / this.screen.width) // screen.width intentional
            );
            return vector;
        };
    }());

    TrackballController.prototype.getMouseOnScreen = (function () {
        var vector = new THREE.Vector2();
        return function getMouseOnScreen(pageX, pageY) {
            vector.set(
              (pageX - this.screen.left) / this.screen.width,
              (pageY - this.screen.top) / this.screen.height
            );
            return vector;
        };
    }());

    TrackballController.prototype.handleEvent = function (event) {
        if (typeof this[event.type] === 'function') {
            this[event.type](event);
        }
    };

    TrackballController.prototype.handleResize = function () {
        var self = this;
        if (self.domElement === document) {
            self.screen.left = 0;
            self.screen.top = 0;
            self.screen.width = window.innerWidth;
            self.screen.height = window.innerHeight;
        } else {
            var box = self.domElement.getBoundingClientRect();
            // adjustments come from similar code in the jquery offset() function
            var d = self.domElement.ownerDocument.documentElement;
            self.screen.left = box.left + window.pageXOffset - d.clientLeft;
            self.screen.top = box.top + window.pageYOffset - d.clientTop;
            self.screen.width = box.width;
            self.screen.height = box.height;
        }
    };

    TrackballController.prototype.keydown = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        window.removeEventListener('keydown', self.keydown.bind(self));
        _prevState = _state;
        if (_state !== STATE.NONE) {
            return;
        } else if (event.keyCode === self.keys[STATE.ROTATE] && self.allowRotate) {
            _state = STATE.ROTATE;
        } else if (event.keyCode === self.keys[STATE.ZOOM] && self.allowZoom) {
            _state = STATE.ZOOM;
        } else if (event.keyCode === self.keys[STATE.PAN] && self.allowPan) {
            _state = STATE.PAN;
        }
    };

    TrackballController.prototype.keyup = function () {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        _state = _prevState;
        window.addEventListener('keydown', self.keydown.bind(self));
    };

    TrackballController.prototype.mousedown = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (_state === STATE.NONE) {
            _state = event.button;
        }
        if (_state === STATE.ROTATE && self.allowRotate) {
            _moveCurr.copy(self.getMouseOnCircle(event.pageX, event.pageY));
            _movePrev.copy(_moveCurr);
        } else if (_state === STATE.ZOOM && self.allowZoom) {
            _zoomStart.copy(self.getMouseOnScreen(event.pageX, event.pageY));
            _zoomEnd.copy(_zoomStart);
        } else if (_state === STATE.PAN && self.allowPan) {
            _panStart.copy(self.getMouseOnScreen(event.pageX, event.pageY));
            _panEnd.copy(_panStart);
        }
        self.mouse = self.MOUSE_STATE.DOWN;
        self.dispatchEvent(self.EVENTS.START);
    };

    TrackballController.prototype.mousemove = function (event) {
        var self = this;
        if (self.enabled === false && self.mouse === self.MOUSE_STATE.DOWN) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (_state === STATE.ROTATE && self.allowRotate) {
            _movePrev.copy(_moveCurr);
            _moveCurr.copy(self.getMouseOnCircle(event.pageX, event.pageY));
        } else if (_state === STATE.ZOOM && self.allowZoom) {
            _zoomEnd.copy(self.getMouseOnScreen(event.pageX, event.pageY));
        } else if (_state === STATE.PAN && self.allowPan) {
            _panEnd.copy(self.getMouseOnScreen(event.pageX, event.pageY));
        }
    };

    TrackballController.prototype.mouseup = function (event) {
        var self = this;
        if (self.enabled === false && self.mouse === self.MOUSE_STATE.DOWN) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        _state = STATE.NONE;
        self.mouse = self.MOUSE_STATE.UP;
        self.dispatchEvent(self.EVENTS.END);
    };

    TrackballController.prototype.mousewheel = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();
        var delta = 0;
        if (event.wheelDelta) {
            // WebKit / Opera / Explorer 9
            delta = event.wheelDelta / 40;
        } else if (event.detail) {
            // Firefox
            delta = - event.detail / 3;
        }
        _zoomStart.y += delta * 0.01;
        self.dispatchEvent(self.EVENTS.START);
        self.dispatchEvent(self.EVENTS.END);
    };

    TrackballController.prototype.panCamera = (function() {
        var mouseChange = new THREE.Vector2(),
          cameraUp = new THREE.Vector3(),
          pan = new THREE.Vector3();

        return function panCamera () {
            var self = this;
            mouseChange.copy(_panEnd).sub(_panStart);
            if (mouseChange.lengthSq()) {
                mouseChange.multiplyScalar(_eye.length() * self.panSpeed);
                pan.copy(_eye).cross(self.camera.up).setLength(mouseChange.x);
                pan.add(cameraUp.copy(self.camera.up).setLength(mouseChange.y));

                self.camera.position.add(pan);
                self.target.add(pan);
                if (self.staticMoving) {
                    _panStart.copy(_panEnd);
                } else {
                    _panStart.add(mouseChange.subVectors(_panEnd, _panStart).multiplyScalar(self.dynamicDampingFactor));
                }
            }
        };
    }());

    TrackballController.prototype.reset = function () {
        var self = this;
        _state = STATE.NONE;
        _prevState = STATE.NONE;

        self.target.copy(self.target0);
        self.camera.position.copy(self.position0);
        self.camera.up.copy(self.up0);

        _eye.subVectors(self.camera.position, self.target);
        self.camera.lookAt(self.target);
        self.dispatchEvent(self.EVENTS.CHANGE);
        self.lastPosition.copy(self.camera.position);
    };

    TrackballController.prototype.rotateCamera = (function() {

        var axis = new THREE.Vector3(),
          quaternion = new THREE.Quaternion(),
          eyeDirection = new THREE.Vector3(),
          cameraUpDirection = new THREE.Vector3(),
          cameraSidewaysDirection = new THREE.Vector3(),
          moveDirection = new THREE.Vector3(),
          angle;

        return function rotateCamera() {
            var self = this;
            moveDirection.set(_moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0);
            angle = moveDirection.length();

            if (angle) {
                _eye.copy(self.camera.position).sub(self.target);

                eyeDirection.copy(_eye).normalize();
                cameraUpDirection.copy(self.camera.up).normalize();
                cameraSidewaysDirection.crossVectors(cameraUpDirection, eyeDirection).normalize();

                cameraUpDirection.setLength(_moveCurr.y - _movePrev.y);
                cameraSidewaysDirection.setLength(_moveCurr.x - _movePrev.x);

                moveDirection.copy(cameraUpDirection.add(cameraSidewaysDirection));

                axis.crossVectors(moveDirection, _eye).normalize();

                angle *= self.rotateSpeed;
                quaternion.setFromAxisAngle(axis, angle);

                _eye.applyQuaternion(quaternion);
                self.camera.up.applyQuaternion(quaternion);

                _lastAxis.copy(axis);
                _lastAngle = angle;
            } else if (! self.staticMoving && _lastAngle) {
                _lastAngle *= Math.sqrt(1.0 - self.dynamicDampingFactor);
                _eye.copy(self.camera.position).sub(self.target);
                quaternion.setFromAxisAngle(_lastAxis, _lastAngle);
                _eye.applyQuaternion(quaternion);
                self.camera.up.applyQuaternion(quaternion);
            }
            _movePrev.copy(_moveCurr);
        };
    }());

    TrackballController.prototype.touchstart = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        switch (event.touches.length) {
            case 1:
                _state = STATE.TOUCH_ROTATE;
                _moveCurr.copy(self.getMouseOnCircle(event.touches[0].pageX, event.touches[0].pageY));
                _movePrev.copy(_moveCurr);
                break;
            case 2:
                _state = STATE.TOUCH_ZOOM_PAN;
                var dx = event.touches[0].pageX - event.touches[1].pageX;
                var dy = event.touches[0].pageY - event.touches[1].pageY;
                _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt(dx * dx + dy * dy);
                var x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                var y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                _panStart.copy(self.getMouseOnScreen(x, y));
                _panEnd.copy(_panStart);
                break;
            default:
                _state = STATE.NONE;
        }
        self.dispatchEvent(self.EVENTS.START);
    };

    TrackballController.prototype.touchmove = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        event.preventDefault();
        event.stopPropagation();

        switch (event.touches.length) {
            case 1:
                _movePrev.copy(_moveCurr);
                _moveCurr.copy(self.getMouseOnCircle( event.touches[0].pageX, event.touches[0].pageY));
                break;
            case 2:
                var dx = event.touches[0].pageX - event.touches[1].pageX;
                var dy = event.touches[0].pageY - event.touches[1].pageY;
                _touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);

                var x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                var y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                _panEnd.copy(self.getMouseOnScreen(x, y));
                break;
            default:
                _state = STATE.NONE;
        }
    };

    TrackballController.prototype.touchend = function (event) {
        var self = this;
        if (self.enabled === false) {
            return;
        }
        switch (event.touches.length) {
            case 1:
                _movePrev.copy(_moveCurr);
                _moveCurr.copy(self.getMouseOnCircle( event.touches[0].pageX, event.touches[0].pageY));
                break;
            case 2:
                _touchZoomDistanceStart = _touchZoomDistanceEnd = 0;

                var x = (event.touches[0].pageX + event.touches[1].pageX) / 2;
                var y = (event.touches[0].pageY + event.touches[1].pageY) / 2;
                _panEnd.copy(self.getMouseOnScreen(x, y));
                _panStart.copy(_panEnd);
                break;
        }
        _state = STATE.NONE;
        self.dispatchEvent(self.EVENTS.END);
    };

    TrackballController.prototype.update = function () {
        var self = this;
        _eye.subVectors(self.camera.position, self.target);
        if (self.allowRotate) {
            self.rotateCamera();
        }
        if (self.allowZoom) {
            self.zoomCamera();
        }
        if (self.allowPan) {
            self.panCamera();
        }
        self.camera.position.addVectors(self.target, _eye);
        self.checkDistances();
        self.camera.lookAt(self.target);

        if (self.lastPosition.distanceToSquared(self.camera.position) > self.EPS) {
            self.dispatchEvent(self.EVENTS.CHANGE);
            self.lastPosition.copy(self.camera.position);
        }
    };

    TrackballController.prototype.zoomCamera = function () {
        var factor, self = this;
        if (_state === STATE.TOUCH_ZOOM_PAN) {
            factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
            _touchZoomDistanceStart = _touchZoomDistanceEnd;
            _eye.multiplyScalar(factor);
        } else {
            factor = 1.0 + (_zoomEnd.y - _zoomStart.y) * self.zoomSpeed;
            if (factor !== 1.0 && factor > 0.0) {
                _eye.multiplyScalar(factor);
                if (self.staticMoving) {
                    _zoomStart.copy(_zoomEnd);
                } else {
                    _zoomStart.y += (_zoomEnd.y - _zoomStart.y) * this.dynamicDampingFactor;
                }
            }
        }
    };

    return TrackballController;

}());