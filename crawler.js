var jango = require('./jango.js'),
    title = false,
    that = this;

console.log('Start');

jango.options({
    phantom: {
        'ignore-ssl-errors': 'yes',
        'cookies-file': 'cookies.txt',
        // 'remote-debugger-port': '9000'
    }
});

jango.open('http://www.google.com/', function open (response, error, status) {
    console.log('First output', response.url, status);
});

jango.then(function before () {
    console.log('Before');

    // Will run right away since we've already started
    this.then(function hurr () {
        this.out('Hello from outside Jango :P', 1, 'success');
    });
});

jango.evaluate(function evaluate () {
    return document.title;
}, function evaluateCallback (error, value) {
    console.log('Title', value);
    that.title = value;
});

jango.wait(100, function wait () {
    console.log('Waited 100ms');
});

jango.then(function after () {
    console.log('After');

    this.val = null;
    setTimeout(function setting () {
        console.log('Setting val');
        this.val = true;
    }.bind(this), 1000);
}.bind(this));

// Wait until this function returns something
// null means it will be called again in 100ms
// Anything else means the wait will expire
// Callback is fired at that point
jango.wait(function wait2 () {
    return that.val;
}.bind(this), function wait2callback () {
    console.log('Waited for val', that.val);
}, 2000);

// This will time out because val2 is never set
jango.wait(function wait3 () {
    return that.val2;
}.bind(this), function wait3callback () {
    console.log('Waited for val2', that.val2);
}, 2000);

jango.run(function run () {
    console.log('Done!');

    this.exit(1, function exit () {
        console.log('Exit');

        // Node will exit naturally after a second of cleaning up
        // process.exit(1);
    });
});