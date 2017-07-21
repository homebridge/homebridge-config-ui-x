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
            user: req.user,
            auths: app.get("auths")
        });
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

router.post("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {

    //CHANGE AUTHS FILE

    app.set("auths", require(hb.auth));
    res.redirect("/accounts")
});

router.post("/password", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (req.body.id == req.user.id || req.user.admin) {

        //CHANGE AUTHS FILE

        app.set("auths", require(hb.auth));
        res.redirect(req.session.referer ? req.session.referer : "/")
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

module.exports = router;
