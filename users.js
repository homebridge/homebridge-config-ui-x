exports.findById = function (id, callback) {
    process.nextTick(function () {
        var idx = id - 1;

        if (app.get("auths")[idx]) {
            callback(null, app.get("auths")[idx]);
        } else {
            callback(new Error("User " + id + " does not exist"));
        }
    });
}

exports.findByUsername = function (username, callback) {
    process.nextTick(function () {
        for (var i = 0, len = app.get("auths").length; i < len; i++) {
            var record = app.get("auths")[i];

            if (record.username === username) {
                return callback(null, record);
            }
        }

        return callback(null, null);
    });
}