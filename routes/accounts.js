var express = require("express");
var router = express.Router();

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (req.user.admin) {
        res.render("accounts", {
            controller: "accounts",
            title: "Accounts",
            user: req.user
        });
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

router.get("/password", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {
    res.render("password", {
        controller: "accounts",
        title: "Accounts",
        user: req.user
    });
});

module.exports = router;
