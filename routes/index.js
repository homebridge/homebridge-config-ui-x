var fs = require("fs");
var os = require("os");
var npm = require("../npm");
var express = require("express");
var passport = require("passport");
var router = express.Router();

var config = require(hb.config);

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/";
        res.redirect("/login");
    }
}, function (req, res, next) {
    npm.package("homebridge", function (err, server) {
        res.render("index", {
            controller: "index",
            title: "Status",
            user: req.user,
            server: server
        });
    });
});

router.get("/status", function (req, res, next) {
    var mem = {
        total: parseFloat(((os.totalmem() / 1024) / 1024) / 1024).toFixed(2),
        used: parseFloat((((os.totalmem() - os.freemem()) / 1024) / 1024) / 1024).toFixed(2),
        free: parseFloat(((os.freemem() / 1024) / 1024) / 1024).toFixed(2)
    }

    var load = parseFloat((parseFloat(os.loadavg()) * 100) / os.cpus().length).toFixed(2);

    var uptime = {
        delta: Math.floor(os.uptime())
    };

    var temp = fs.readFileSync(hb.temp);
    var cputemp = ((temp/1000).toPrecision(3)) + "°C";
    
    uptime.days = Math.floor(uptime.delta / 86400);
    uptime.delta -= uptime.days * 86400;
    uptime.hours = Math.floor(uptime.delta / 3600) % 24;
    uptime.delta -= uptime.hours * 3600;
    uptime.minutes = Math.floor(uptime.delta / 60) % 60;

    res.render("status", {
        layout: false,
        port: config.bridge.port,
        console_port: app.get("port"),
        uptime: uptime,
        cpu: load,
        mem: mem,
        cputemp: cputemp
    });
});

router.get("/pin", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/";
        res.redirect("/login");
    }
}, function (req, res, next) {
    res.setHeader("Content-type", "image/svg+xml");

    res.render("pin", {
        layout: false,
        pin: config.bridge.pin
    });
});

router.get("/restart", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/";
        res.redirect("/login");
    }
}, function (req, res, next) {
    res.render("progress", {
        layout: false,
        message: "Restarting Server",
        redirect: "/"
    });

    require("child_process").exec(hb.restart);
});

router.get("/upgrade", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/";
        res.redirect("/login");
    }
}, function (req, res, next) {
    app.get("log")("Homebridge server upgraded.");

    res.render("progress", {
        layout: false,
        message: "Upgrading Server",
        redirect: "/"
    });

    npm.update("homebridge", function (err, stdout, stderr) {
        require("child_process").exec(hb.restart);
    });
});

router.get("/logout", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        req.session.referer = "/";
        res.redirect("/login");
    }
}, function (req, res) {
    app.get("log")(req.user.name + " logged out.");

    req.logout();
    res.redirect("/");
});

router.get("/login", function (req, res) {
    res.render("login", {
        layout: false,
        controller: "login"
    });
});

router.post("/login", function (req, res) {
    passport.authenticate("local", function (err, user, info) {
        if (err) {
            return next(err);
        }

        if (!user) {
            app.get("log")("Failed login attempt.");

            return res.redirect("/login");
        }

        req.logIn(user, function (err) {
            if (err) {
                return next(err);
            }

            var referer = req.session.referer ? req.session.referer : "/";
            delete req.session.referer;

            app.get("log")(user.name + " successfully logged in.");

            return res.redirect(referer);
        });
    })(req, res);
});

module.exports = router;
