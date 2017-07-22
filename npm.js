(function () {
    var fs = require("fs");
    var path = require("path");
    var async = require("async");
    var request = require("request");

    function declare(module_name, exports) {
        module.exports = exports;
    }

    var npm = {
        installed: function (callback) {
            var me = this;
            var base = this.getBase();

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
                        callback(err, {
                            name: body.collected.metadata.name,
                            installed: pkg.version,
                            version: body.collected.metadata.version,
                            update: !(me.versionCompare(pkg.version, body.collected.metadata.version)),
                            description: body.collected.metadata.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim(),
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
            var me = this;
            var base = this.getBase();

            if (base && search && search != "") {
                var dr = fs.readdirSync(base).filter(file => fs.lstatSync(path.join(base, file)).isDirectory());
                var cur = {};

                for (var i = 0; i < dr.length; i++) {
                    if (fs.existsSync(path.join(base, dr[i] + "/package.json"))) {
                        var pkg = require(path.join(base, dr[i] + "/package.json"));

                        if (Array.isArray(pkg.keywords) && pkg.keywords.indexOf("homebridge-plugin") >= 0) {
                            cur[pkg.name] = pkg.version;
                        }
                    }
                }

                request({
                    url: "https://api.npms.io/v2/search?q=" + (!search || 0 === search.length ? "" : search + "+") + "keywords:homebridge-plugin+not:deprecated+not:insecure&size=250",
                    json: true
                }, function (err, res, body) {
                    var pkgs = [];

                    for (var i = 0; i < body.results.length; i++) {
                        if (cur[body.results[i].package.name]) {
                            pkgs.push({
                                name: body.results[i].package.name,
                                installed: cur[body.results[i].package.name],
                                version: body.results[i].package.version,
                                update: !(me.versionCompare(cur[body.results[i].package.name], body.results[i].package.version)),
                                description: body.results[i].package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim(),
                                links: body.results[i].package.links
                            });
                        } else {
                            pkgs.push({
                                name: body.results[i].package.name,
                                version: body.results[i].package.version,
                                description: body.results[i].package.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim(),
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
        package: function (name, callback) {
            var me = this;
            var base = this.getBase();

            if (base && name && name != "") {
                if (fs.existsSync(path.join(base, name + "/package.json"))) {
                    var version = require(path.join(base, name + "/package.json")).version;

                    request({
                        url: "https://api.npms.io/v2/package/" + name,
                        json: true
                    }, function (err, res, body) {
                        var desc = body.collected.metadata.description.replace(/(?:https?|ftp):\/\/[\n\S]+/g, "").trim();

                        if (desc.length > 80) {
                            desc = desc.substring(0, 77) + "...";
                        }

                        callback(err, {
                            name: body.collected.metadata.name,
                            installed: version,
                            version: body.collected.metadata.version,
                            update: !(me.versionCompare(version, body.collected.metadata.version)),
                            description: desc,
                            links: body.collected.metadata.links
                        });
                    });
                }
            }
        },
        install: function (package, callback) {
            var me = this;
            var base = this.getBase();
            var command = path.join(base, "npm/bin/npm-cli.js");

            require("child_process").exec("\"" + command + "\" install -g " + package, function (err, stdout, stderr) {
                callback(err, stdout, stderr);
            });
        },
        uninstall: function (package, callback) {
            var me = this;
            var base = this.getBase();
            var command = path.join(base, "npm/bin/npm-cli.js");

            require("child_process").exec("\"" + command + "\" uninstall -g " + package, function (err, stdout, stderr) {
                callback(err, stdout, stderr);
            });
        },
        update: function (package, callback) {
            var me = this;
            var base = this.getBase();
            var command = path.join(base, "npm/bin/npm-cli.js");

            require("child_process").exec("\"" + command + "\" update -g " + package, function (err, stdout, stderr) {
                callback(err, stdout, stderr);
            });
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
        },
        versionCompare: function (local, remote) {
            var pattern = /^\d+(\.\d+){0,2}$/;

            if (!local || !remote || local.length === 0 || remote.length === 0)
                return false;
            if (local == remote)
                return true;
            if (pattern.test(local) && pattern.test(remote)) {
                var lparts = local.split('.');

                while (lparts.length < 3) {
                    lparts.push("0");
                }

                var rparts = remote.split('.');

                while (rparts.length < 3) {
                    rparts.push("0");
                }

                for (var i = 0; i < 3; i++) {
                    var l = parseInt(lparts[i], 10);
                    var r = parseInt(rparts[i], 10);

                    if (l === r) {
                        continue;
                    }

                    return l > r;
                }

                return true;
            } else {
                return local >= remote;
            }
        }
    }

    declare("npm", npm)
})();
