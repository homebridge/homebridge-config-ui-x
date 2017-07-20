var plugins = require("../plugins");
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
        plugins.search(req.query.search, function (err, pkgs) {
            res.render("plugins", {
                controller: "plugins",
                title: "Plugins",
                search: (req.query.search) ? req.query.search : "",
                packages: pkgs
            });
        });
    } else {
        plugins.installed(function (err, pkgs) {
            res.render("plugins", {
                controller: "plugins",
                title: "Plugins",
                packages: pkgs
            });
        });
    }
});

router.get("/upgrade", function (req, res, next) {
    res.render("upgrade", {
        controller: "plugins",
        title: "Plugins"
    });
});

router.get("/uninstall", function (req, res, next) {
    res.render("uninstall", {
        controller: "plugins",
        title: "Plugins"
    });
});

router.get("/install", function (req, res, next) {
    res.render("install", {
        controller: "plugins",
        title: "Plugins"
    });
});

module.exports = router;
