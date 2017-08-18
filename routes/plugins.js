var fs = require("fs");
var npm = require("../npm");
var express = require("express");
var router = express.Router();
var now = new Date();
var userId = 1000; //fs.append changes the file ownership to root:root this is to change back to user
var groupId = 1000; //fs.append changes the file ownership to root:root this is to change back to user

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (req.query.search && req.query.search != "") {
        npm.search(req.query.search, function (err, pkgs) {
            res.render("plugins", {
                controller: "plugins",
                title: "Plugins",
                user: req.user,
                search: (req.query.search) ? req.query.search : "",
                packages: pkgs
            });
        });
    } else {
        npm.installed(function (err, pkgs) {
            res.render("plugins", {
                controller: "plugins",
                title: "Plugins",
                user: req.user,
                packages: pkgs
            });
        });
    }
});

router.get("/upgrade", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {
    npm.update(req.query.package, function (err, stdout, stderr) {
        app.get("log")("Package " + req.query.package + " upgraded.");
        res.redirect("/plugins");
    });
});

router.get("/uninstall", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {
    var config = require(hb.config);

    var server = {
        name: (config.bridge.name || "Homebridge"),
        mac: (config.bridge.username || "CC:22:3D:E3:CE:30"),
        port: (config.bridge.port || 51826),
        pin: (config.bridge.pin || "031-45-154")
    };

    var platforms = [];

    for (var i = 0; i < config.platforms.length; i++) {
        if (!config.platforms[i].npm_package || config.platforms[i].npm_package != req.query.package) {
            platforms.push(config.platforms[i]);
        }
    }

    var accessories = [];

    for (var i = 0; i < config.accessories.length; i++) {
        if (!config.accessories[i].npm_package || config.accessories[i].npm_package != req.query.package) {
            accessories.push(config.accessories[i]);
        }
    }

    fs.renameSync(hb.config, hb.config + "." + now.getFullYear() + "-"+ now.getMonth() + "-" + now.getDay() + "-" + ("0" + now.getHours()).slice(-2)   + ":" + 
    ("0" + now.getMinutes()).slice(-2) + ":" + 
    ("0" + now.getSeconds()).slice(-2));
    fs.appendFileSync(hb.config, JSON.stringify(config, null, 4));
    fs.chownSync(hb.config, userId,groupId);
    
    delete require.cache[require.resolve(hb.config)];

    npm.uninstall(req.query.package, function (err, stdout, stderr) {
        app.get("log")("Package " + req.query.package + " removed.");
        res.redirect("/plugins");
    });
});

router.get("/install", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {
    var platform = {
        "platform": "[ENTER PLATFORM]",
        "npm_package": req.query.package
    }

    res.render("install", {
        controller: "plugins",
        title: "Plugins",
        user: req.user,
        package: req.query.package,
        platform_json: JSON.stringify(platform, null, 4)
    });
});

router.post("/install", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {
    var config = require(hb.config);

    if (req.body["platform-code"] != "" && req.body["platform-name"] != "") {
        var platform = JSON.parse(req.body["platform-code"]);

        platform.name = req.body["platform-name"];

        if (!config.platforms) {
            config.platforms = [];
        }

        config.platforms.push(platform);
    }

    if (!config.accessories){
        config.accessories = [];
    } else
        if (req.body[req.body.accessory[i] + "-delete"] == "false") {
            var accessory = JSON.parse(req.body[req.body.accessory[i] + "-code"]);

            accessory.name = req.body[req.body.accessory[i] + "-name"];
            config.accessories.push(accessory);
        }

    fs.renameSync(hb.config, hb.config + "." + now.getFullYear() + "-"+ now.getMonth() + "-" + now.getDay() + "-" + ("0" + now.getHours()).slice(-2)   + ":" + 
    ("0" + now.getMinutes()).slice(-2) + ":" + 
    ("0" + now.getSeconds()).slice(-2));
    fs.appendFileSync(hb.config, JSON.stringify(config, null, 4));
    fs.chownSync(hb.config, userId,groupId);

    delete require.cache[require.resolve(hb.config)];

    npm.install(req.body.package, function (err, stdout, stderr) {
        app.get("log")("Package " + req.body.package + " installed.");
        res.redirect("/plugins");
    });
});

module.exports = router;
