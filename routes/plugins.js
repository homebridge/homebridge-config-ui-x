var plugins = require("../plugins");
var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (req.body.search && req.body.search != "") {
        plugins.search(req.body.search, function (err, pkgs) {
            res.render("plugins", {
                controller: "plugins",
                title: "Plugins",
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

module.exports = router;
