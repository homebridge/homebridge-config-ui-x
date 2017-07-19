(function () {
    var fs = require("fs");
    var path = require("path");
    var async = require("async");
    var request = require("request");

    function declare(module_name, exports) {
        module.exports = exports;
    }

    var plugins = {
        installed: function (callback) {
            var base = path.resolve("../../");

            async.map(fs.readdirSync(base).filter(function (dr) {
                if (fs.lstatSync(path.join(base, dr)).isDirectory()) {
                    if (fs.existsSync(path.join(base, dr + "/package.json"))) {
                        var package = require(path.join(base, dr + "/package.json"));

                        if (Array.isArray(package.keywords) && package.keywords.indexOf("homebridge-plugin") >= 0) {
                            return true;
                        }
                    }
                }

                return false;
            }), function (dr, callback) {
                var package = require(path.join(base, dr + "/package.json"));

                request({
                    url: "https://api.npms.io/v2/package/" + package.name,
                    json: true
                }, function (err, res, body) {
                    callback(err, {
                        name: body.collected.metadata.name,
                        installed: package.version,
                        version: body.collected.metadata.version,
                        update: (body.collected.metadata.version > package.version),
                        description: body.collected.metadata.description,
                        links: body.collected.metadata.links
                    });
                });
            }, function (err, res) {
                callback(err, res);
            });
        }
    }

    declare("plugins", plugins)
})();
