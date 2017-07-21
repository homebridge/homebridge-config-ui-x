var fs = require("fs");
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
    if (req.user.admin) {
        if (!isNaN(parseInt(req.body.id)) && req.body.username != "" && req.body.name != "") {
            var data = require(hb.auth);

            if (parseInt(req.body.id) == 0) {
                if (req.body.password != "") {
                    var id = 0;

                    for (var i = 0; i < data.length; i++) {
                        if (data[i].id > id) {
                            id = data[i].id;
                        }
                    }

                    data.push({
                        id: (id + 1),
                        username: req.body.username,
                        password: req.body.password,
                        name: req.body.name,
                        admin: ((req.body.admin == "true") ? true : false)
                    });
                }
            } else {
                for (var i = 0; i < data.length; i++) {
                    if (data[i].id == parseInt(req.body.id)) {
                        data[i].username = req.body.username;
                        data[i].name = req.body.name;
                        data[i].admin = ((req.body.admin == "true") ? true : false);

                        if (req.body.password != "") {
                            data[i].password = req.body.password;
                        }

                        break;
                    }
                }
            }

            fs.writeFileSync(hb.auth, JSON.stringify(data, null, 4));

            delete require.cache[require.resolve(hb.auth)];

            app.set("auths", require(hb.auth));
        }

        res.redirect("/accounts")
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

router.get("/delete", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (req.user.admin) {
        if (!isNaN(parseInt(req.query.id)) && parseInt(req.query.id) > 1) {
            var current = require(hb.auth);
            var data = [];

            for (var i = 0; i < current.length; i++) {
                if (current[i].id != parseInt(req.query.id)) {
                    data.push(current[i]);
                }
            }

            fs.writeFileSync(hb.auth, JSON.stringify(data, null, 4));

            delete require.cache[require.resolve(hb.auth)];

            app.set("auths", require(hb.auth));
        }

        res.redirect("/accounts")
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

router.post("/password", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/accounts";
        res.redirect("/login");
    }
}, function (req, res, next) {
    if (!isNaN(parseInt(req.body.id)) && (parseInt(req.body.id) == req.user.id || req.user.admin)) {
        if (req.body.password != "") {
            var data = require(hb.auth);

            for (var i = 0; i < data.length; i++) {
                if (data[i].id == parseInt(req.body.id)) {
                    data[i].password = req.body.password;
                    break;
                }
            }

            fs.writeFileSync(hb.auth, JSON.stringify(data, null, 4));

            delete require.cache[require.resolve(hb.auth)];

            app.set("auths", require(hb.auth));
        }

        res.redirect(req.session.referer ? req.session.referer : "/")
    } else {
        var err = new Error("Forbidden");

        err.status = 403;
        next(err);
    }
});

module.exports = router;
