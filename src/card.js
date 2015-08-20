import Sister from 'sister';
import Hammer from 'hammerjs';
import rebound from 'rebound';
import vendorPrefix from 'vendor-prefix';
import util from './util.js';
import raf from 'raf';

let Card;

/**
 * @param {Stack} stack
 * @param {HTMLElement} targetElement
 */
Card = (stack, targetElement) => {
    let constructor,
        card,
        config,
        eventEmitter,
        springSystem,
        springThrowIn,
        springThrowOut,
        lastThrow,
        lastTranslate,
        throwOutDistance,
        onSpringUpdate,
        mc,
        dragTimer,
        isDraging,
        currentX,
        currentY,
        doMove,
        cancelMove,
        throwWhere;

    constructor = () => {
        card = {};
        config = Card.makeConfig(stack.getConfig());
        eventEmitter = Sister();
        springSystem = stack.getSpringSystem();
        springThrowIn = springSystem.createSpring(250, 10);
        springThrowOut = springSystem.createSpring(500, 20);
        lastThrow = {};
        lastTranslate = {
            x: 0,
            y: 0
        };
        isDraging = false;
        currentX = 0;
        currentY = 0;

        springThrowIn.setRestSpeedThreshold(0.05);
        springThrowIn.setRestDisplacementThreshold(0.05);

        springThrowOut.setRestSpeedThreshold(0.05);
        springThrowOut.setRestDisplacementThreshold(0.05);

        throwOutDistance = config.throwOutDistance(config.minThrowOutDistance, config.maxThrowOutDistance);

        mc = new Hammer.Manager(targetElement, {
            recognizers: [
                [
                    Hammer.Pan,
                    {
                        threshold: 2
                    }
                ]
            ]
        });

        Card.appendToParent(targetElement);

        eventEmitter.on('panstart', () => {
            Card.appendToParent(targetElement);

            eventEmitter.trigger('dragstart', {
                target: targetElement
            });

            currentX = 0;
            currentY = 0;

            cancelMove();

            isDraging = true;

            (function animation (){
                if (!isDraging) {
                    return;
                }

                doMove();

                dragTimer = raf(animation);
            }) ();
        });

        eventEmitter.on('panmove', (e) => {
            currentX = e.deltaX;
            currentY = e.deltaY;
        });

        eventEmitter.on('panend', (e) => {
            let x,
                y;

            isDraging = false;

            cancelMove();

            x = lastTranslate.x + e.deltaX;
            y = lastTranslate.y + e.deltaY;

            if (config.isThrowOut(x, targetElement, config.throwOutConfidence(x, targetElement))) {
                card.throwOut(x, y);
            } else {
                card.throwIn(x, y);
            }

            eventEmitter.trigger('dragend', {
                target: targetElement
            });
        });

        // "mousedown" event fires late on touch enabled devices, thus listening
        // to the touchstart event for touch enabled devices and mousedown otherwise.
        if (util.isTouchDevice()) {
            targetElement.addEventListener('touchstart', () => {
                eventEmitter.trigger('panstart');
            });

            // Disable scrolling while dragging the element on the touch enabled devices.
            // @see http://stackoverflow.com/a/12090055/368691
            (() => {
                let dragging;

                targetElement.addEventListener('touchstart', () => {
                    dragging = true;
                });

                targetElement.addEventListener('touchend', () => {
                    dragging = false;
                });

                global.addEventListener('touchmove', (e) => {
                    if (dragging) {
                        e.preventDefault();
                    }
                });
            }) ();
        } else {
            targetElement.addEventListener('mousedown', () => {
                eventEmitter.trigger('panstart');
            });
        }

        mc.on('panmove', (e) => {
            eventEmitter.trigger('panmove', e);
        });

        mc.on('panend', (e) => {
            eventEmitter.trigger('panend', e);
        });

        springThrowIn.addListener({
            onSpringUpdate: (spring) => {
                let value,
                    x,
                    y;

                value = spring.getCurrentValue();
                x = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromX, 0);
                y = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromY, 0);

                onSpringUpdate(x, y);
            },
            onSpringAtRest: () => {
                eventEmitter.trigger('throwinend', {
                    target: targetElement
                });
            }
        });

        springThrowOut.addListener({
            onSpringUpdate: (spring) => {
                let value,
                    x,
                    y;

                value = spring.getCurrentValue();
                x = rebound.MathUtil.mapValueInRange(value, 0, 1, lastThrow.fromX, throwOutDistance * lastThrow.direction);
                y = lastThrow.fromY;

                onSpringUpdate(x, y);
            },
            onSpringAtRest: () => {
                eventEmitter.trigger('throwoutend', {
                    target: targetElement
                });
            }
        });

        doMove = () => {
            let x,
                y,
                r;

            x = lastTranslate.x + currentX;
            y = lastTranslate.y + currentY;
            r = config.rotation(x, y, targetElement, config.maxRotation);

            config.transform(targetElement, x, y, r);

            eventEmitter.trigger('dragmove', {
                target: targetElement,
                throwOutConfidence: config.throwOutConfidence(x, targetElement),
                throwDirection: x < 0 ? Card.DIRECTION_LEFT : Card.DIRECTION_RIGHT
            });
        };

        cancelMove = () => {
            dragTimer && raf.cancel(dragTimer);
        };

        /**
         * Invoked every time the physics solver updates the Spring's value.
         *
         * @param {Number} x
         * @param {Number} y
         */
        onSpringUpdate = (x, y) => {
            let r;

            r = config.rotation(x, y, targetElement, config.maxRotation);

            lastTranslate.x = x || 0;
            lastTranslate.y = y || 0;

            Card.transform(targetElement, x, y, r);
        };

        /**
         * @param {Card.THROW_IN|Card.THROW_OUT} where
         * @param {Number} fromX
         * @param {Number} fromY
         */
        throwWhere = (where, fromX, fromY) => {
            lastThrow.fromX = fromX;
            lastThrow.fromY = fromY;
            lastThrow.direction = lastThrow.fromX < 0 ? Card.DIRECTION_LEFT : Card.DIRECTION_RIGHT;

            if (where === Card.THROW_IN) {
                springThrowIn.setCurrentValue(0).setAtRest().setEndValue(1);

                eventEmitter.trigger('throwin', {
                    target: targetElement,
                    throwDirection: lastThrow.direction
                });
            } else if (where === Card.THROW_OUT) {
                springThrowOut.setCurrentValue(0).setAtRest().setVelocity(100).setEndValue(1);

                eventEmitter.trigger('throwout', {
                    target: targetElement,
                    throwDirection: lastThrow.direction
                });

                if (lastThrow.direction === Card.DIRECTION_LEFT) {
                    eventEmitter.trigger('throwoutleft', {
                        target: targetElement,
                        throwDirection: lastThrow.direction
                    });
                } else {
                    eventEmitter.trigger('throwoutright', {
                        target: targetElement,
                        throwDirection: lastThrow.direction
                    });
                }
            } else {
                throw new Error('Invalid throw event.');
            }
        };
    };

    constructor();

    /**
     * Alias
     */
    card.on = eventEmitter.on;
    card.trigger = eventEmitter.trigger;

    /**
     * Throws a card into the stack from an arbitrary position.
     *
     * @param {Number} fromX
     * @param {Number} fromY
     */
    card.throwIn = (fromX, fromY) => {
        throwWhere(Card.THROW_IN, fromX, fromY);
    };

    /**
     * Throws a card out of the stack in the direction away from the original offset.
     *
     * @param {Number} fromX
     * @param {Number} fromY
     */
    card.throwOut = (fromX, fromY) => {
        throwWhere(Card.THROW_OUT, fromX, fromY);
    };

    /**
     * Unbinds all Hammer.Manager events.
     * Removes the listeners from the physics simulation.
     */
    card.destroy = () => {
        cancelMove();

        mc.destroy();
        springThrowIn.destroy();
        springThrowOut.destroy();

        stack.destroyCard(card);
    };

    return card;
};

/**
 * Creates a configuration object.
 *
 * @param {Object} config
 * @return {Object}
 */
Card.makeConfig = (config) => {
    let defaultConfig;

    config = config || {};

    defaultConfig = {
        isThrowOut: Card.isThrowOut,
        throwOutConfidence: Card.throwOutConfidence,
        throwOutDistance: Card.throwOutDistance,
        minThrowOutDistance: 400,
        maxThrowOutDistance: 500,
        rotation: Card.rotation,
        maxRotation: 20,
        transform: Card.transform
    };

    return util.assign({}, defaultConfig, config);
};

/**
 * Uses CSS transform to translate element position and rotation.
 *
 * Invoked in the event of `dragmove` and every time the physics solver is triggered.
 *
 * @param {Number} x Horizontal offset from the startDrag.
 * @param {Number} y Vertical offset from the startDrag.
 */
Card.transform = (element, x, y, r) => {
    element.style[vendorPrefix('transform')] = `translate3d(0, 0, 0) translate(${x}px, ${y}px) rotate(${r}deg)`;
};

/**
 * Append element to the parentNode.
 *
 * This makes the element first among the siblings. The reason for using
 * this as opposed to zIndex is to allow CSS selector :nth-child.
 *
 * Invoked in the event of mousedown.
 * Invoked when card is added to the stack.
 *
 * @param {HTMLElement} element The target element.
 */
Card.appendToParent = (element) => {
    let parent,
        siblings,
        targetIndex;

    parent = element.parentNode;
    siblings = util.elementChildren(parent);
    targetIndex = siblings.indexOf(element);

    if (targetIndex + 1 !== siblings.length) {
        parent.removeChild(element);
        parent.appendChild(element);
    }
};

/**
 * Returns a value between 0 and 1 indicating the completeness of the throw out condition.
 *
 * Ration of the absolute distance from the original card position and element width.
 *
 * @param {Number} offset Distance from the dragStart.
 * @param {HTMLElement} element Element.
 * @return {Number}
 */
Card.throwOutConfidence = (offset, element) => {
    return Math.min(Math.abs(offset) / element.offsetWidth, 1);
};

/**
 * Determines if element is being thrown out of the stack.
 *
 * Element is considered to be thrown out when throwOutConfidence is equal to 1.
 *
 * @param {Number} offset Distance from the dragStart.
 * @param {HTMLElement} element Element.
 * @param {Number} throwOutConfidence config.throwOutConfidence
 * @return {Boolean}
 */
Card.isThrowOut = (offset, element, throwOutConfidence) => {
    return throwOutConfidence === 1;
};

/**
 * Calculates a distances at which the card is thrown out of the stack.
 *
 * @return {Number}
 */
Card.throwOutDistance = (min, max) => {
    return util.random(min, max);
};

/**
 * Calculates rotation based on the element x and y offset, element width and maxRotation variables.
 *
 * @param {Number} x Horizontal offset from the startDrag.
 * @param {Number} y Vertical offset from the startDrag.
 * @param {HTMLElement} element Element.
 * @param {Number} maxRotation
 * @return {Number} Rotation angle expressed in degrees.
 */
Card.rotation = (x, y, element, maxRotation) => {
    let horizontalOffset,
        verticalOffset,
        rotation;

    horizontalOffset = Math.min(Math.max(x / element.offsetWidth, -1), 1);
    verticalOffset = (y > 0 ? 1 : -1) * Math.min(Math.abs(y) / 100, 1);
    rotation = horizontalOffset * verticalOffset * maxRotation;

    return rotation;
};

Card.DIRECTION_LEFT = -1;
Card.DIRECTION_RIGHT = 1;

Card.THROW_IN = 'in';
Card.THROW_OUT = 'out';

export default Card;
