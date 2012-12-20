var phantom     = require('node-phantom'),
    utils       = require('./utils.js'),
    clc         = require('cli-color'),
    async       = require('async'),
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
    if (level <= this.argv.level) {
        type = type || 'debug';

        console.log(this.levels[type]('Jango: ') + message);
    }
}

Jango.prototype.resolve = function resolve (name) {
    this.out('Resolve ' + name + ' from ' + arguments.callee.caller.name, 3, 'debug');

    deferred = this[name];

    if (typeof deferred === 'object') {
        deferred.resolve();
    }
}

Jango.prototype.promise = function promise (name, timeout) {
    this.out('Promise ' + name + ' from ' + arguments.callee.caller.name, 3, 'debug');

    deferred = this[name];

    if (typeof deferred !== 'object') {
        deferred = q.defer();
    }

    if (! isNaN(parseFloat(timeout)) && isFinite(timeout)) {
        setTimeout(function () {
            this.out('Promise ' + name + ' timed out and resolved', 1, 'warning');
            this.resolve(name);
        }.bind(this), timeout);
    }

    return this.promises.push(deferred.promise);

    // Below does not work

    // deferred.name  = name;
    // this.promises[name] = deferred.promise;

    // deferred.promise.then(function (deferred) {
    //     delete this.promises[deferred.name];
    // }.bind(this, deferred));
}

Jango.prototype.boot = function boot (callback) {
    this.out('Boot ' + arguments.callee.caller.name, 1, 'info');

    return phantom.create(this.opts.phantom, function _phantomCreate (error, phantom) {
        this.phantom = phantom;

        phantom.createPage(function _phantomCreatePage (error, page) {
            this.page = page;

            page.onResourceReceived = function _onResourceReceived (resource) {
                if (resource.stage !== 'end' || resource.url !== this.requestUrl) {
                    return;
                } else if (typeof resource == 'object' && /^http/i.test(resource.url)) {
                    this.response = resource;
                }
            }.bind(this);

            page.onNavigationRequested = function _onNavigationRequested (url, type, locked, isMainFrame) {
                if (isMainFrame) {
                    this.promise('navigating');
                }
            }.bind(this);

            page.onUrlChanged = function _onUrlChanged (url) {
                this.resolve('navigating');
            }.bind(this);

            page.onLoadStarted = function _onLoadStarted () {
                this.promise('loading');
            }.bind(this);

            page.onLoadFinished = function _onLoadFinished (status) {
                this.resolve('loading');
            }.bind(this);

            if (utils.callable(callback)) {
                callback.call(this, phantom);
            }
        }.bind(this));
    }.bind(this));
}

Jango.prototype.then = function then (step) {
    this.out('Then ' + arguments.callee.caller.name, 3, 'debug');

    if (this.step) {
        return this.steps.splice(this.step, 0, step);
    }

    return this.steps.push(step);
}

Jango.prototype.wait = function wait (on, callback, timeout) {
    this.out('Wait ' + arguments.callee.caller.name, 3, 'debug');

    return this.then(function _wait () {
        var waiting = q.defer();
            _clearWait = function _clearWait () {
                if (utils.callable(callback) !== null) {
                    callback.call(this);
                }

                clearInterval(this.waitInterval);
                clearTimeout(this.waitTimeout);
                waiting.resolve();
            }.bind(this);

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

        this.waitTimeout = setTimeout(function _waitTimeout () {
            if (utils.callable(on)) {
                this.out('Wait ' + on.name + ' timed out', 1, 'warning');
            }

            _clearWait();
        }.bind(this), timeout);
    }.bind(this));
}

Jango.prototype.open = function open (url, callback) {
    this.out('Open ' + arguments.callee.caller.name, 3, 'debug');

    return this.then(function _openThen () {
        this.requestUrl = url;
        this.promise('loading');

        this.page.open(url, function _pageOpen (error, status) {
            this.page.onLoadFinished(status);

            if (utils.callable(callback)) {
                callback.call(this, this.response, error, status);
            }
        }.bind(this));
    });
}

Jango.prototype.evaluate = function evaluate (method, callback) {
    this.out('Evaluate ' + arguments.callee.caller.name, 3, 'debug');

    return this.then(function _evaluateThen () {
        var evaluating = q.defer();
        this.promises.push(evaluating.promise);

        this.page.evaluate(method, function _callback (callback, error, value) {
            if (utils.callable(callback)) {
                callback.call(this, error, value);
            }

            evaluating.resolve();
        }.bind(this, callback));
    }.bind(this));
}

Jango.prototype.run = function run (callback) {
    this.out('Run ' + this.steps.length + ' steps ' + arguments.callee.caller.name, 3, 'debug');

    this.boot(function _boot () {
        async.forEachSeries(
            this.steps,
            function _stepsForEach (step, callback) {
                var before = this.promises.length
                this.step++;

                this.out('On step ' + this.step + ' (' + step.name + ')', 3, 'debug');
                step.call(this);
                this.out('Wait for ' + (this.promises.length - before) + ' new promise(s)', 2, 'info');

                q.allResolved(this.promises).then(function _allResolved (callback) {
                    // this.out('Step ' + this.step + ' - promises resolved', 3, 'debug');

                    callback();
                }.bind(this, callback));
            }.bind(this),
            function _stepsComplete () {
                if (utils.callable(callback)) {
                    callback.call(this);
                }
            }.bind(this)
        );
    }.bind(this));
}

Jango.prototype.exit = function exit (code, callback) {
    this.phantom.exit(code);

    if (utils.callable(callback)) {
        callback.call(this);
    }
}

module.exports = new Jango;