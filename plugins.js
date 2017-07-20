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
            var base = this.getBase();

            if (process.platform === "win32") {
                base = path.join(process.env.APPDATA, "npm/node_modules");
            } else {
                if (fs.existsSync("/usr/lib/node_modules")) {
                    base = "/usr/lib/node_modules";
                } else {
                    base = "/usr/local/lib/node_modules";
                }
            }

            if (base) {
                async.map(fs.readdirSync(base).filter(function (dr) {
                    if (fs.lstatSync(path.join(base, dr)).isDirectory()) {
                        if (fs.existsSync(path.join(base, dr + "/package.json"))) {
                            var pkg = require(path.join(base, dr + "/package.json"));

                            if (Array.isArray(pkg.keywords) && pkg.keywords.indexOf("homebridge-plugin") >= 0) {
                                return true;
                            }
                        }
                    }

                    return false;
                }), function (dr, callback) {
                    var pkg = require(path.join(base, dr + "/package.json"));

                    request({
                        url: "https://api.npms.io/v2/package/" + pkg.name,
                        json: true
                    }, function (err, res, body) {
                        var desc = body.collected.metadata.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim();

                        if (desc.length > 80) {
                            desc = desc.substring(0, 77) + "...";
                        }

                        callback(err, {
                            name: body.collected.metadata.name,
                            installed: pkg.version,
                            version: body.collected.metadata.version,
                            update: (body.collected.metadata.version > pkg.version),
                            description: desc,
                            links: body.collected.metadata.links
                        });
                    });
                }, function (err, res) {
                    callback(err, res);
                });
            } else {
                callback("Unable to find global modules", []);
            }
        },
        search: function (search, callback) {
            var base = this.getBase();

            if (base && search && search != "") {
                var dr = fs.readdirSync(base).filter(file => fs.lstatSync(path.join(base, file)).isDirectory());
                var cur = {};

                for (var i = 0; i < dr.length; i++) {
                    var pkg = require(path.join(base, dr[i] + "/package.json"));

                    if (Array.isArray(pkg.keywords) && pkg.keywords.indexOf("homebridge-plugin") >= 0) {
                        cur[pkg.name] = pkg.version;
                    }
                }

                request({
                    url: "https://api.npms.io/v2/search?q=" + (!search || 0 === search.length ? "" : search + "+") + "keywords:homebridge-plugin+not:deprecated+not:insecure&size=250",
                    json: true
                }, function (err, res, body) {
                    var pkgs = [];

                    for (var i = 0; i < body.results.length; i++) {
                        var desc = body.results[i].package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim();

                        if (desc.length > 80) {
                            desc = desc.substring(0, 77) + "...";
                        }

                        if (cur[body.results[i].package.name]) {
                            pkgs.push({
                                name: body.results[i].package.name,
                                installed: cur[body.results[i].package.name],
                                version: body.results[i].package.version,
                                update: (body.results[i].package.version > cur[body.results[i].package.name]),
                                description: desc,
                                links: body.results[i].package.links
                            });
                        } else {
                            pkgs.push({
                                name: body.results[i].package.name,
                                version: body.results[i].package.version,
                                description: desc,
                                links: body.results[i].package.links
                            });
                        }
                    }

                    callback(err, pkgs);
                });
            } else {
                callback(null, []);
            }
        },
        getBase: function () {
            var base;

            if (process.platform === "win32") {
                base = path.join(process.env.APPDATA, "npm/node_modules");
            } else {
                if (fs.existsSync("/usr/lib/node_modules")) {
                    base = "/usr/lib/node_modules";
                } else {
                    base = "/usr/local/lib/node_modules";
                }
            }

            return base;
        }
    }

    declare("plugins", plugins)
})();
