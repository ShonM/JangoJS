var phantom     = require('node-phantom'),
    utils       = require('./utils.js'),
    clc         = require('cli-color'),
    events      = require('events'),
    async       = require('async'),
    _ =         require('lodash'),
    q           = require('q');

function Jango () {
    this.argv = require('optimist')
        .alias('l', 'level').default('level', 0)
        .argv;

    this.opts = {
        phantom: {}
    };

    this.step = 0;
    this.steps = [];
    this.promises = [];

    this.page = false;
    this.phantom = false;
    this.response = {};
    this.requestUrl = 'about:blank';

    this.styles = {
        'debug'  : clc.xterm(255),
        'info'   : clc.xterm(33),
        'error'  : clc.xterm(160),
        'warning': clc.xterm(214),
        'success': clc.xterm(70)
    };
}

Jango.prototype = new events.EventEmitter;

Jango.prototype.options = function opts (opts) {
    return this.opts = utils.extend({}, this.opts, opts);
}

Jango.prototype.out = function out (message, level, style) {
    level = level || 3;

    if (level <= this.argv.level) {
        style = style || 'debug';

        console.log(this.styles[style]('Jango: ') + message);
    }
}

// Shorthand: If callable, acts like callback.call(this, [args, ...])
Jango.prototype.call = function call (callback) {
    if (utils.callable(callback)) {
        callback.apply(this, Array.prototype.slice.call(arguments, 1));
    }
}

Jango.prototype.boot = function boot (callback) {
    this.out('Booting', 1, 'info');

    return phantom.create({phantomjs: this.opts.phantom}, _.bind(function _phantomCreate (error, phantom) {
        this.out('Got Phantom', 2, 'info');

        if (error) {
            this.out('Phantom error: ' + error, 0, 'error');
            this.exit();
        }

        this.phantom = phantom;

        phantom.createPage(_.bind(function _phantomCreatePage (error, page) {
            this.out('Got Page', 2, 'info');

            this.page = page;

            page.onResourceReceived = _.bind(function _onResourceReceived (resource) {
                if (resource.stage !== 'end' || resource.url !== this.requestUrl) {
                    return;
                } else if (typeof resource == 'object' && /^http/i.test(resource.url)) {
                    this.response = resource;
                }
            }, this);

            page.onNavigationRequested = _.bind(function _onNavigationRequested (request) {
                var url = request[0];
                    type = request[1];
                    locked = request[2];
                    main = request[3];

                if (main) {

                }
            }, this);

            page.onUrlChanged = _.bind(function _onUrlChanged (url) {
                this.out('Emit onUrlChanged', 5, 'debug');
                this.emit('onUrlChanged', url);
            }, this);

            page.onLoadStarted = _.bind(function _onLoadStarted () {
                var p = q.defer();

                this.once('onLoadFinished', function () {
                    this.out('onLoadStarted promise resolving due to event', 5, 'debug');

                    p.resolve();
                });

                this.out('onLoadStarted promised', 5, 'debug')
                this.promises.push(p.promise);
            }, this);

            page.onLoadFinished = _.bind(function _onLoadFinished (status) {
                this.out('Emit onLoadFinished', 5, 'debug');
                this.emit('onLoadFinished', status);
            }, this);

            page.onConsoleMessage = function _onConsoleMessage (message, line, source) {
                this.out('Emit onConsoleMessage', 5, 'debug');
                this.emit('onConsoleMessage', message, line, source);
            };

            this.call(callback, phantom);
        }, this));
    }, this));
}

Jango.prototype.then = function then (step) {
    this.out('Then ' + arguments.callee.caller.name);

    // if (this.phantom) {
    //     return this.steps.splice(this.step, 0, step);
    // }

    return this.steps.push(step);
}

Jango.prototype.wait = function wait (on, callback, timeout) {
    this.out('Wait ' + arguments.callee.caller.name);

    return this.then(_.bind(function _wait () {
        var p = q.defer();
        this.promises.push(p.promise);
        this.out('Wait promised', 5, 'debug');

        var _clearWait = _.bind(function _clearWait () {
                this.call(callback);

                clearInterval(this.waitInterval);
                clearTimeout(this.waitTimeout);

                p.resolve();
            }, this);

        if (utils.callable(on)) {
            this.waitOn = on;

            this.waitInterval = setInterval(function _waitInterval (jango) {
                if (jango.waitOn()) {
                    _clearWait();
                }
            }, 100, this);
        } else if (! isNaN(parseFloat(on)) && isFinite(on)) {
            timeout = on;
        }

        this.waitTimeout = setTimeout(_.bind(function _waitTimeout () {
            if (utils.callable(on)) {
                this.out('Wait ' + on.name + ' timed out', 1, 'warning');
            }

            _clearWait();
        }, this), timeout);
    }, this));
}

Jango.prototype.open = function open (url, callback) {
    this.out('Open ' + arguments.callee.caller.name);

    return this.then(_.bind(function _openThen () {
        this.requestUrl = url;

        var p = q.defer();
        this.promises.push(p.promise);
        this.out('Open promised', 5, 'debug');

        this.page.open(url, _.bind(function _pageOpen (error, status) {
            this.page.onLoadFinished(status);

            p.resolve();

            this.call(callback, this.response, error, status);
        }, this));
    }, this));
}

Jango.prototype.evaluate = function evaluate (method, callback) {
    this.out('Evaluate ' + arguments.callee.caller.name);

    return this.then(_.bind(function _evaluateThen () {
        var p = q.defer();
        this.promises.push(p.promise);
        this.out('Evaluate promised', 5, 'debug');

        this.page.evaluate(method, _.bind(function _callback (callback, error, value) {
            this.call(callback, error, value);

            p.resolve();
        }, this, callback));
    }, this));
}

Jango.prototype.run = function run (callback) {
    this.out('Run ' + this.steps.length + ' steps ' + arguments.callee.caller.name);

    callback = callback || _.bind(function () {
        // this.exit(1);
    }, this);

    this.boot(_.bind(function _boot () {
        this.out('Go time', 2, 'success');

        async.forEachSeries(
            this.steps,
            _.bind(function _stepsForEach (step, callback) {
                this.step++;

                this.out('On step ' + this.step, 2, 'info');
                step.call(this);
                this.out('  Step ' + this.step + ' called', 2, 'success');

                this.out('About to wait on ' + this.promises.length.toString() + ' promises', 5, 'debug');

                // Wait for all promises promised by this step to be resolved (any status)
                q.allResolved(this.promises).then(_.bind(function (promises) {
                    this.promises = [];

                    promises.forEach(_.bind(function (promise, index) {
                        if (promise.isFulfilled()) {
                            this.out('+ A fullfilled promise that we waited for', 5, 'debug')
                        } else {
                            this.out('- Promise not fulfilled', 5, 'debug');
                            this.promises.push(promise);
                        }

                        // delete this.promises[index - 1];
                    }, this));

                    this.out('We shall now continue...', 5, 'debug');
                    callback();
                }, this));
            }, this),
            _.bind(function _stepsComplete () {
                this.out('Finished', 2, 'success');

                this.call(callback);
            }, this)
        );
    }, this));
}

Jango.prototype.exit = function exit (code, callback) {
    this.phantom.exit(code);

    this.call(callback);
}

module.exports = new Jango;