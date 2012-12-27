var should = require('should'),
    jango = require('./../jango')

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
                // Empty function
            })

            jango.run(function () {
                done()
            })
        })
    })

    describe('#wait()', function () {
        it('should wait without error', function (done) {
            jango.wait(1000)

            jango.run(function () {
                done()
            })
        })
    })

    describe('#open()', function () {
        this.timeout(10000)

        it('should open without error', function (done) {
            jango.open('http://www.google.com/')

            jango.run(function () {
                done()
            })
        })
    })

    describe('#evaluate()', function () {
        this.timeout(10000)

        it('should evaluate without error', function (done) {
            jango.evaluate(function () {
                console.log('evaluate')
            })

            jango.run(function () {
                done()
            })
        })
    })
})
