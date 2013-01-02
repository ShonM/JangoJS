var should = require('should'),
    jango = require('./../jango')

describe('Jango', function () {
    describe('#bootPhantom()', function () {
        it('should boot Phantom without error', function (done) {
            jango.bootPhantom(function () {
                done()
            })
        })
    })

    describe('#createPage()', function () {
        it('should create a page without error', function (done) {
            jango.createPage(function () {
                done()
            })
        })

        it('should allow many pages', function (done) {
            jango.createPage(function () {
                jango.createPage(function () {
                    jango.createPage(function () {
                        done()
                    })
                })
            })
        })
    })

    describe('#run()', function () {
        it('should run without error', function (done) {
            jango.run(function () {
                done()
            })
        })

        it('should create a page if there isn\'t one', function (done) {
            jango.page = false

            should.strictEqual(false, jango.page)

            jango.run(function () {
                this.page.should.be.a('object')

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
            jango.wait(1)

            jango.run(function () {
                done()
            })
        })

        it('should wait for arbitrary values', function (done) {
            var val = false
            setTimeout(function () {
                val = true
            }, 1000)

            jango.wait(function () {
                return val
            })

            jango.run(function () {
                done()
            })
        })
    })

    describe('#open()', function () {
        this.timeout(5000)

        it('should open without error', function (done) {
            jango.open('http://www.google.com/')

            jango.run(function () {
                done()
            })
        })

        it('should fail invalid URLs', function (done) {
            jango.open('xyz', function (response, error, status) {
                status.should.eql('fail')
            })

            jango.run(function () {
                done()
            })
        })
    })

    describe('#evaluate()', function () {
        this.timeout(5000)

        it('should evaluate without error', function (done) {
            jango.evaluate(function () {
                console.log('evaluate')
            })

            jango.run(function () {
                done()
            })
        })

        it('should wait for navigation', function (done) {
            jango.open('http://google.fr/')

            jango.evaluate(function () {
                document.forms[0].elements['q'].value = 'jango'
                return document.forms[0].submit()
            })

            jango.evaluate(function () {
                return document.location.href
            }, function (error, value) {
                value.should.include('search')
                value.should.include('jango')
            })

            jango.run(function () {
                done()
            })
        })
    })
})
