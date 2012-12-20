var phantom     = require('node-phantom'),
    utils       = require('./utils.js'),
    clc         = require('cli-color'),
    async       = require('async'),
    _ =         require('lodash'),
    q           = require('q');

function Jango () {
    this.argv = require('optimist')
        .alias('l', 'level').default('level', 0)
        .argv;

    this.step       = 0;
    this.steps      = [];
    this.promises   = [];
    this.opts       = {
        phantom: {
            'load-images': 'no'
        }
    };

    this.response   = {};
    this.page       = false;
    this.phantom    = false;
    this.requestUrl = 'about:blank';

    this.waiting = q.defer();
    this.loading = q.defer();
    this.navigating = q.defer();

    this.levels     = {
        'debug'  : clc.xterm(255),
        'info'   : clc.xterm(33),
        'error'  : clc.xterm(160),
        'warning': clc.xterm(214),
        'success': clc.xterm(70)
    };
}

Jango.prototype.options = function opts (opts) {
    return this.opts = utils.extend({}, this.opts, opts);
}

Jango.prototype.out = function out (message, level, type) {
    level = level || 3;

    if (level <= this.argv.level) {
        type = type || 'debug';

        console.log(this.levels[type]('Jango: ') + message);
    }
}

Jango.prototype.call = function call (callback) {
    if (utils.callable(callback)) {
        callback.apply(this, Array.prototype.slice.call(arguments, 1));
    }
}

Jango.prototype.resolve = function resolve (name) {
    this.out('Resolve ' + name + ' from ' + arguments.callee.caller.name);

    deferred = this[name];

    if (typeof deferred === 'object') {
        deferred.resolve();
    }
}

Jango.prototype.promise = function promise (name, timeout) {
    this.out('Promise ' + name + ' from ' + arguments.callee.caller.name);

    deferred = this[name];

    if (typeof deferred !== 'object') {
        deferred = q.defer();
    }

    if (! isNaN(parseFloat(timeout)) && isFinite(timeout)) {
        setTimeout(_.bind(function () {
            this.out('Promise ' + name + ' timed out and resolved', 1, 'warning');
            this.resolve(name);
        }, this), timeout);
    }

    return this.promises.push(deferred.promise);

    // Below does not work

    // deferred.name  = name;
    // this.promises[name] = deferred.promise;

    // deferred.promise.then(_.bind(function (deferred) {
    //     delete this.promises[deferred.name];
    // }, this, deferred)));
}

Jango.prototype.boot = function boot (callback) {
    this.out('Booting', 1, 'info');

    return phantom.create(this.opts.phantom, _.bind(function _phantomCreate (error, phantom) {
        this.out('Got Phantom', 2, 'info');

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

            page.onNavigationRequested = _.bind(function _onNavigationRequested (url, type, locked, isMainFrame) {
                if (isMainFrame) {
                    this.promise('navigating');
                }
            }, this);

            page.onUrlChanged = _.bind(function _onUrlChanged (url) {
                this.resolve('navigating');
            }, this);

            page.onLoadStarted = _.bind(function _onLoadStarted () {
                this.promise('loading');
            }, this);

            page.onLoadFinished = _.bind(function _onLoadFinished (status) {
                this.resolve('loading');
            }, this);

            this.call(callback, phantom);
        }, this));
    }, this));
}

Jango.prototype.then = function then (step) {
    this.out('Then ' + arguments.callee.caller.name);

    if (this.step) {
        return this.steps.splice(this.step, 0, step);
    }

    return this.steps.push(step);
}

Jango.prototype.wait = function wait (on, callback, timeout) {
    this.out('Wait ' + arguments.callee.caller.name);

    return this.then(_.bind(function _wait () {
        var waiting = q.defer();
            _clearWait = _.bind(function _clearWait () {
                this.call(callback);

                clearInterval(this.waitInterval);
                clearTimeout(this.waitTimeout);
                waiting.resolve();
            }, this);

        this.promises.push(waiting.promise);

        if (utils.callable(on)) {
            this.waitOn = on;

            this.waitInterval = setInterval(function _waitInterval (jango) {
                if (jango.waitOn()) {
                    _clearWait();
                }
            }, 100, this);
        } else if (! isNaN(parseFloat(timeout)) && isFinite(timeout)) {
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
        this.promise('loading');

        this.page.open(url, _.bind(function _pageOpen (error, status) {
            this.page.onLoadFinished(status);

            this.call(callback, this.response, error, status);
        }, this));
    }, this));
}

Jango.prototype.evaluate = function evaluate (method, callback) {
    this.out('Evaluate ' + arguments.callee.caller.name);

    return this.then(_.bind(function _evaluateThen () {
        var evaluating = q.defer();
        this.promises.push(evaluating.promise);

        this.page.evaluate(method, _.bind(function _callback (callback, error, value) {
            this.call(callback, error, value);

            evaluating.resolve();
        }, this, callback));
    }, this));
}

Jango.prototype.run = function run (callback) {
    this.out('Run ' + this.steps.length + ' steps ' + arguments.callee.caller.name);

    this.boot(_.bind(function _boot () {
        this.out('Go time', 2, 'success');

        async.forEachSeries(
            this.steps,
            _.bind(function _stepsForEach (step, callback) {
                var before = this.promises.length
                this.step++;

                this.out('On step ' + this.step, 2, 'info');
                step.call(this);
                this.out('Wait for ' + (this.promises.length - before) + ' new promise(s)');

                q.allResolved(this.promises).then(_.bind(function _allResolved (callback) {
                    // this.out('Step ' + this.step + ' - promises resolved');

                    callback();
                }, this, callback));
            }, this),
            _.bind(function _stepsComplete () {
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