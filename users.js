var records = require(hb.auth);

exports.findById = function (id, callback) {
    process.nextTick(function () {
        var idx = id - 1;

        if (records[idx]) {
            callback(null, records[idx]);
        } else {
            callback(new Error("User " + id + " does not exist"));
        }
    });
}

exports.findByUsername = function (username, callback) {
    process.nextTick(function () {
        for (var i = 0, len = records.length; i < len; i++) {
            var record = records[i];

            if (record.username === username) {
                return callback(null, record);
            }
        }

        return callback(null, null);
    });
}