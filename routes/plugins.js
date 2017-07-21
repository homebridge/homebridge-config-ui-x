var npm = require("../npm");
var express = require("express");
var router = express.Router();

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
    app.get("log")("Package " + req.query.package + " upgraded.");

    res.render("progress", {
        layout: false,
        message: "Upgrading Package",
        redirect: "/plugins"
    });

    //EXECUTE NPM UPDATE

    require("child_process").exec(hb.restart);
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

    config.platforms = [];

    for (var i = 0; i < platforms.length; i++) {
        config.platforms.push(platforms[i]);
    }

    var accessories = [];

    for (var i = 0; i < config.accessories.length; i++) {
        if (!config.accessories[i].npm_package || config.accessories[i].npm_package != req.query.package) {
            accessories.push(config.accessories[i]);
        }
    }

    config.accessories = [];

    for (var i = 0; i < accessories.length; i++) {
        config.accessories.push(accessories);
    }

    fs.renameSync(hb.config, hb.config + "." + Math.floor(new Date() / 1000));
    fs.appendFileSync(hb.config, JSON.stringify(config, null, 4));

    delete require.cache[require.resolve(hb.config)];

    app.get("log")("Package " + req.query.package + " removed.");

    res.render("progress", {
        layout: false,
        message: "Uninstalling Package",
        redirect: "/plugins"
    });

    //EXECUTE NPM REMOVE

    require("child_process").exec(hb.restart);
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
        "npm_package": req.query.package,
        "name": "[ENTER NAME]"
    }

    var accessories = [{
        "accessory": "[ENTER ACCESSORY]",
        "npm_package": req.query.package,
        "name": "[ENTER NAME]"
    }];

    res.render("install", {
        controller: "plugins",
        title: "Plugins",
        user: req.user,
        package: req.query.package,
        platform_json: JSON.stringify(platform, null, 4),
        accessories_json: JSON.stringify(accessories, null, 4)
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
    var platform = JSON.parse(req.body.platform_json);
    var accessories = JSON.parse(req.body.accessories_json);

    if (req.body.use_platform == "true") {
        if (!config.platforms) {
            config.platforms = [];
        }

        config.platforms.push(platform);
    }

    if (req.body.use_accessories == "true") {
        if (!config.accessories) {
            config.accessories = [];
        }

        if (Object.prototype.toString.call(accessories) === '[object Array]') {
            for (var i = 0; i < accessories.length; i++) {
                config.accessories.push(accessories[i]);
            }
        } else {
            config.accessories.push(accessories);
        }
    }

    fs.renameSync(hb.config, hb.config + "." + Math.floor(new Date() / 1000));
    fs.appendFileSync(hb.config, JSON.stringify(config, null, 4));

    delete require.cache[require.resolve(hb.config)];

    app.get("log")("Package " + req.query.package + " installed.");

    res.render("progress", {
        layout: false,
        message: "Installing Package",
        redirect: "/plugins"
    });

    //EXECUTE NPM INSTALL

    require("child_process").exec(hb.restart);
});

module.exports = router;
