var fs = require("fs");

var express = require("express");
var router = express.Router();
var convert = require("../ansi");

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function(req, res, next) {
    res.render("log", {
        controller: "log",
        title: "Log",
    });
});

router.get("/raw", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function(req, res, next) {
    fs.readFile(hb.log, function (err, data) {
        res.send(convert(data));
    });
});

router.get("/clear", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function(req, res, next) {
    fs.truncate(hb.log, 0, function () {
        app.get("log")("Log cleared by " + req.user.name + ".");
    });
});

module.exports = router;
