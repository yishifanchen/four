/**
 * Camera pan controller. Panning can be performed using the right mouse button
 * or the combination of a keypress, left mouse button down and mouse move.
 */
FOUR.PanController = (function () {

    function PanController (config) {
        THREE.EventDispatcher.call(this);
        config = config || {};
        var self = this;

        self.CURSOR = {
            DEFAULT: 'default',
            PAN: 'all-scroll'
        };
        self.EPS = 0.000001;
        self.EVENT = {
            END: {type: 'end'},
            START: {type: 'start'},
            UPDATE: {type: 'update'}
        };
        self.KEY = {
            CTRL: 17
        };
        self.MODES = {
            NONE: 0,
            PAN: 1,
            ROTATE: 2,
            ZOOM: 3
        };

        self.active = false;
        self.camera = config.camera || config.viewport.camera;
        self.domElement = config.domElement || config.viewport.domElement;
        self.dynamicDampingFactor = 0.2;
        self.enabled = false;
        self.keydown = false;
        self.listeners = {};
        self.maxDistance = Infinity;
        self.minDistance = 1;
        self.mode = self.MODES.NONE;
        self.offset = new THREE.Vector3();
        self.pan = {
            cameraUp: new THREE.Vector3(),
            delta: new THREE.Vector2(),
            end: new THREE.Vector3(),
            lookAt: new THREE.Vector3(),
            start: new THREE.Vector3(),
            vector: new THREE.Vector2()
        };
        self.panSpeed = 0.8;
        self.viewport = config.viewport;

        Object.keys(config).forEach(function (key) {
           self[key] = config[key];
        });
    }

    PanController.prototype = Object.create(THREE.EventDispatcher.prototype);

    PanController.prototype.disable = function () {
        var self = this;
        self.enabled = false;
        Object.keys(self.listeners).forEach(function (key) {
            var listener = self.listeners[key];
            listener.element.removeEventListener(listener.event, listener.fn);
        });
    };

    PanController.prototype.enable = function () {
        var self = this;
        function addListener(element, event, fn) {
            self.listeners[event] = {
                element: element,
                event: event,
                fn: fn.bind(self)
            };
            element.addEventListener(event, self.listeners[event].fn, false);
        }
        addListener(self.domElement, 'mousedown', self.onMouseDown);
        addListener(self.domElement, 'mousemove', self.onMouseMove);
        addListener(self.domElement, 'mouseup', self.onMouseUp);
        self.enabled = true;
    };

    PanController.prototype.getMouseOnCircle = function (pageX, pageY) {
        this.pan.vector.set(
          (pageX - this.domElement.clientWidth * 0.5) / (this.domElement.clientWidth * 0.5),
          (this.domElement.clientHeight + 2 * pageY) / this.domElement.clientWidth
        );
        return this.pan.vector;
    };

    PanController.prototype.getMouseOnScreen = function (elementX, elementY) {
        // TODO see http://stackoverflow.com/questions/13055214/mouse-canvas-x-y-to-three-js-world-x-y-z
        this.pan.vector.set(elementX / this.domElement.clientWidth, elementY / this.domElement.clientHeight);
        return this.pan.vector;
    };

    PanController.prototype.onMouseDown = function (event) {
        event.preventDefault();
        if (event.button === THREE.MOUSE.RIGHT) {
            this.active = true;
            this.domElement.style.cursor = this.CURSOR.PAN;
            this.mode = this.MODES.PAN;
            this.pan.start.copy(this.getMouseOnScreen(event.offsetX - this.domElement.clientLeft, event.offsetY - this.domElement.clientTop));
            this.pan.end.copy(this.pan.start);
            this.dispatchEvent(this.EVENT.START);
        }
    };

    PanController.prototype.onMouseMove = function (event) {
        event.preventDefault();
        console.info('screen position', this.getMouseOnScreen(event.offsetX - this.domElement.clientLeft, event.offsetY - this.domElement.clientTop));

        if (event.button === THREE.MOUSE.RIGHT) {
            this.pan.end.copy(this.getMouseOnScreen(event.offsetX - this.domElement.clientLeft, event.offsetY - this.domElement.clientTop));
        }
    };

    PanController.prototype.onMouseUp = function (event) {
        event.preventDefault();
        if (this.active === true) {
            this.active = false;
            this.domElement.style.cursor = this.CURSOR.DEFAULT;
            this.mode = this.MODES.NONE;
            this.pan.delta.set(0,0);
            this.dispatchEvent(this.EVENT.END);
        }
    };

    PanController.prototype.update = function () {
        var self = this;
        if (self.enabled === false) {
            return;
        } else if (this.active === true) {
            self.pan.lookAt.copy(self.camera.getDirection());
            //
            self.pan.delta.subVectors(self.pan.end, self.pan.start);

            // TODO add a scaling factor on the mouse delta
            if (self.pan.delta.lengthSq() > self.EPS) {
                // compute offset
                self.pan.delta.multiplyScalar(self.pan.delta.length() * self.panSpeed);
                self.offset.copy(self.pan.lookAt).cross(self.camera.up).setLength(self.pan.delta.x);
                self.offset.add(self.pan.cameraUp.copy(self.camera.up).setLength(self.pan.delta.y));

                // set the new camera position
                self.camera.setPosition(self.offset);

                // consume the change
                //this.pan.start.copy(this.pan.end);

                self.dispatchEvent(self.EVENT.UPDATE);
            }
        }
    };

    return PanController;

}());