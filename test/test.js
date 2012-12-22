var should = require('should'),
    jango  = require('./../jango')

describe('Jango', function () {
    describe('#boot()', function () {
        it('should boot without error', function (done) {
            jango.boot(function () {
                done()
            })
        })
    })

    describe('#run()', function () {
        it('should run without error', function (done) {
            jango.run(function () {
                done()
            })
        })
    })

    describe('#then()', function () {
        it('should then without error', function (done) {
            jango.then(function () {
                done()
            })

            done()
        })
    })

    describe('#wait()', function () {
        it('should wait without error', function (done) {
            jango.wait(1000, function () {
                done()
            })

            done()
        })
    })

    describe('#open()', function () {
        it('should open without error', function (done) {
            jango.open('http://www.google.com/', function () {
                done()
            })

            done()
        })
    })

    describe('#evaluate()', function () {
        it('should evaluate without error', function (done) {
            jango.evaluate(function () {
                console.log('evaluate')
            }, function () {
                done()
            })

            done()
        })
    })
})
