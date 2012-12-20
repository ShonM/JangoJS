exports.extend = function extend (obj) {
    Array.prototype.slice.call(arguments, 1).forEach(function(source) {
        for (var prop in source) {
            obj[prop] = source[prop];
        }
    });

    return obj;
}

exports.callable = function callable (callback) {
    return typeof callback === 'function';
}