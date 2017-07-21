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

    //EXECUTE NPM UPDATE

    res.redirect("/plugins");
});

router.get("/uninstall", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {

    //EXECUTE NPM REMOVE

    res.redirect("/plugins");
});

router.get("/install", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/plugins";
        res.redirect("/login");
    }
}, function (req, res, next) {

    //BUILD VIEW TO ADD CONFIG JSON

    res.render("install", {
        controller: "plugins",
        title: "Plugins",
        user: req.user
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

    //SAVE CONFIGS AND EXECUTE NPM INSTALL

    res.redirect("/plugins");
});

module.exports = router;
