var phantom     = require('node-phantom'),
    utils       = require('./utils'),
    clc         = require('cli-color'),
    events      = require('events'),
    async       = require('async'),
    _           = require('lodash'),
    q           = require('q')

function Jango () {
    this.argv = require('optimist')
        .alias('l', 'level').default('level', 0)
        .argv

    this.opts = {
        phantom: {}
    }

    this.step = 0
    this.steps = []
    this.promises = []

    this.page = false
    this.phantom = false
    this.response = {}
    this.requestUrl = 'about:blank'

    this.styles = {
        'debug'  : clc.xterm(255),
        'info'   : clc.xterm(33),
        'error'  : clc.xterm(160),
        'warning': clc.xterm(214),
        'success': clc.xterm(70)
    }
}

// Jango is one bigass event emitter
Jango.prototype = new events.EventEmitter

// Smashes together the defaults plus whatever you give it
Jango.prototype.options = function opts (options) {
    return this.opts = utils.extend({}, this.opts, options)
}

// If level is > this.level, output message with style
Jango.prototype.out = function out (message, level, style) {
    level = level || 3

    if (level <= this.argv.level) {
        style = style || 'debug'

        console.log(this.styles[style]('Jango: ') + message)
    }

    return this
}

// Shorthand: If callable, acts like callback.call(this, [args, ...])
Jango.prototype.call = function call (callback) {
    if (utils.callable(callback)) {
        return callback.apply(this, Array.prototype.slice.call(arguments, 1))
    }

    return false
}

// Boots a Phantom instance and creates a page, hooking up some events
Jango.prototype.bootPhantom = function boot (callback) {
    this.out('Booting Phantom', 1, 'info')

    var defer = q.defer()

    // Create a new Phantom instance with the specified options
    phantom.create({phantomjs: this.opts.phantom}, _.bind(function _phantomCreate (error, phantom) {
        if (error) {
            defer.reject('Phantom error: ' + error)
            this.out('Phantom error: ' + error, 0, 'error')
            this.exit()
        }

        this.out('Got Phantom', 2, 'info')
        this.phantom = phantom

        this.call(callback, phantom)

        defer.resolve()
    }, this))

    return defer.promise
}

// Create a Phantom webpage
Jango.prototype.createPage = function page (callback) {
    this.out('Creating a page', 1, 'info')

    var defer = q.defer()

    this.phantom.createPage(_.bind(function _phantomCreatePage (error, page) {
        if (error) {
            defer.reject('Phantom error: ' + error)
            this.out('Phantom error: ' + error, 0, 'error')
            this.exit()
        }

        this.out('Got Page', 2, 'info')
        this.page = page

        // Invoked when the a resource requested by the page is received
        page.onResourceReceived = _.bind(function _onResourceReceived (resource) {
            if (resource.stage !== 'end' || resource.url !== this.requestUrl) {
                return
            } else if (typeof resource == 'object' && /^http/i.test(resource.url)) {
                this.response = resource
            }
        }, this)

        // Invoked when a navigation event happens
        page.onNavigationRequested = _.bind(function _onNavigationRequested (request) {
            var url = request[0],
                type = request[1],
                locked = request[2],
                main = request[3]

            // Whenever the current request is a main frame request
            if (main) {
                var deferred = q.defer()

                // Set a generous timeout to reject this deferred
                var timeout = setTimeout(_.bind(function () {
                    deferred.reject('Timed out')
                }, this), 10000)

                // Resolve this deferred when the URL is changed (the navigation request is fulfilled - NOT loading complete!)
                this.once('onUrlChanged', function () {
                    clearTimeout(timeout)
                    this.out('Resolved: onNavigationRequested: ' + url, 5, 'debug')
                    deferred.resolve()
                })

                this.out('Promised: onNavigationRequested', 5, 'debug')
                this.promises.push(deferred.promise)
            }
        }, this)

        // Invoked when the URL changes, e.g. as it navigates away from the current URL
        page.onUrlChanged = _.bind(function _onUrlChanged (url) {
            this.out('Emit onUrlChanged: ' + url, 5, 'debug')
            this.emit('onUrlChanged', url)

            var deferred = q.defer()

            // Set a generous timeout to reject this deferred
            var timeout = setTimeout(_.bind(function () {
                deferred.reject('Timed out')
            }, this), 10000)

            // Resolve this deferred when loading is finished
            this.once('onLoadFinished', function () {
                clearTimeout(timeout)
                this.out('Resolved: onUrlChanged', 5, 'debug')
                deferred.resolve()
            })

            this.out('Promised: onUrlChanged', 5, 'debug')
            this.promises.push(deferred.promise)
        }, this)

        // Invoked when the page finishes the loading
        page.onLoadFinished = _.bind(function _onLoadFinished (status) {
            this.out('Emit onLoadFinished: ' + status, 5, 'debug')
            this.emit('onLoadFinished', status)
        }, this)

        // Invoked when there is a JavaScript console message on the web page
        page.onConsoleMessage = _.bind(function _onConsoleMessage (message, line, source) {
            this.out('Emit onConsoleMessage: ' + message, 5, 'debug')
            this.emit('onConsoleMessage', message, line, source)
        }, this)

        this.call(callback, phantom)

        defer.resolve()
    }, this))
}

// Pushes a step onto the step queue
Jango.prototype.then = function then (step) {
    this.out('Then ' + arguments.callee.caller.name, 5)

    // If we have a phantom instance (aka we have booted) we will "inject" this step
    if (this.phantom) {
        return this.steps.splice(this.step, 0, step)
    }

    return this.steps.push(step)
}

// then() wrapper to wait for a duration or for a callable to return truthy
Jango.prototype.wait = function wait (on, callback, timeout) {
    this.out('Wait ' + arguments.callee.caller.name, 5)

    var defer = q.defer()

    this.then(_.bind(function _wait () {
        var deferred = q.defer()
        this.promises.push(deferred.promise)
        this.out('Promised: Wait', 5, 'debug')

        // The method that's going to be called to clean this mess up
        var _clearWait = _.bind(function _clearWait () {
                this.call(callback)

                clearInterval(this.waitInterval)
                clearTimeout(this.waitTimeout)

                this.out('Resolved: Wait', 5, 'debug')
                deferred.resolve()
                defer.resolve()
            }, this)

        if (utils.callable(on)) {
            this.waitOn = on

            // Run until on returns truthy, then clear the wait (negates the timeout below)
            this.waitInterval = setInterval(function _waitInterval (jango) {
                if (jango.waitOn()) {
                    _clearWait()
                }
            }, 100, this)
        } else if (! isNaN(parseFloat(on)) && isFinite(on)) {
            // An integer as on will move it over to timeout instead
            timeout = on
        }

        // Set a timeout that will clear the wait
        this.waitTimeout = setTimeout(_.bind(function _waitTimeout () {
            if (utils.callable(on)) {
                this.out('Wait ' + on.name + ' timed out', 1, 'warning')
            }

            _clearWait()
        }, this), timeout)
    }, this))

    return defer.promise
}

// then() wrapper that will open a page
Jango.prototype.open = function open (url, callback) {
    this.out('Open ' + arguments.callee.caller.name, 5)

    var defer = q.defer()

    this.then(_.bind(function _openThen () {
        this.requestUrl = url

        var deferred = q.defer()
        this.promises.push(deferred.promise)
        this.out('Promised: Open', 5, 'debug')

        var timeout = setTimeout(_.bind(function () {
            deferred.reject('Timed out')
        }, this), 10000)

        this.page.open(url, _.bind(function _pageOpen (error, status) {
            clearTimeout(timeout)
            this.page.onLoadFinished(status)
            this.call(callback, this.response, error, status)

            if (error || status !== 'success') {
                // This is a fake since it will never fire otherwise
                // onNavigationRequested will only resolve when this is fired
                this.emit('onUrlChanged', status)

                this.out('Rejected: Open', 5, 'debug')
                deferred.reject(error)
                defer.reject(error)

                return
            }

            this.out('Resolved: Open', 5, 'debug')
            deferred.resolve()
            defer.resolve()
        }, this))
    }, this))

    return defer.promise
}

// then() wrapper to run code on the client, optionally returning values to a Jango-scoped callback
Jango.prototype.evaluate = function evaluate (method, callback) {
    this.out('Evaluate ' + arguments.callee.caller.name, 5)

    var defer = q.defer()

    this.then(_.bind(function _evaluateThen () {
        var deferred = q.defer()
        this.promises.push(deferred.promise)
        this.out('Promised: Evaluate', 5, 'debug')

        this.page.evaluate(method, _.bind(function _callback (callback, error, value) {
            this.call(callback, error, value)

            if (error) {
                this.out('Rejected: Evaluate', 5, 'debug')
                deferred.reject(error)
                defer.reject(error)

                return
            }

            this.out('Resolved: Evaluate', 5, 'debug')
            deferred.resolve()
            defer.resolve(error, value)
        }, this, callback))
    }, this))

    return defer.promise
}

// Calls a callback once all promises are resolved - will wait for new promises made while waiting (recursive)
Jango.prototype.allResolved = function allResolved (callback) {
    this.out('About to wait on ' + this.promises.length.toString() + ' promises', 5, 'debug')

    var i = setInterval(_.bind(function () {
        this.promises.forEach(_.bind(function (promise, index) {
            if (promise.isFulfilled()) {
                this.out('√ Promise fulfilled', 5, 'debug')
            } else if (promise.isRejected()) {
                this.out('x Promise rejected: ' + promise.valueOf().exception, 5, 'debug')
            } else {
                this.out('o Promise not yet fulfilled/rejected', 5, 'debug')
            }
        }, this))
    }, this), 5000)

    q.allResolved(this.promises).then(_.bind(function (promises) {
        var recurse = false

        // Any promises that are not yet resolved or rejected means we should recurse
        promises.forEach(_.bind(function (promise, index) {
            if (! promise.isFulfilled() && ! promise.isRejected()) {
                recurse = true
            }
        }, this))

        if (recurse) {
            clearInterval(i)

            this.out('Recursing allResolved', 5, 'info')
            this.allResolved(function () {
                callback()
            })
        } else {
            clearInterval(i)

            callback()
        }
    }, this))
}

Jango.prototype.run = function run (callback) {
    this.out('Run ' + this.steps.length + ' steps ' + arguments.callee.caller.name, 5)

    var defer = q.defer()

    callback = callback || _.bind(function () {
        this.exit(1)
    }, this)

    this.bootPhantom(_.bind(function _boot () {
        this.createPage(_.bind(function _page () {
            this.out('Go time', 2, 'success')

            // Go through steps in series
            async.forEachSeries(
                this.steps,
                _.bind(function _stepsForEach (step, callback) {
                    this.step++

                    this.out('On step ' + this.step, 2, 'info')
                    step.call(this)

                    this.allResolved(_.bind(function () {
                        this.promises = []
                        this.out('We shall now continue...', 5, 'debug')
                        callback()
                    }, this))
                }, this),
                _.bind(function _stepsComplete () {
                    this.out('Finished', 2, 'success')

                    this.call(callback)
                    defer.resolve()
                }, this)
            )
        }, this))
    }, this))

    return defer.promise
}

Jango.prototype.exit = function exit (code) {
    return this.phantom.exit(code || 0)
}

module.exports = new Jango