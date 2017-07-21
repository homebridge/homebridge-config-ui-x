var express = require("express");
var path = require("path");
var favicon = require("serve-favicon");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");

var passport = require("passport");
var strategy = require("passport-local").Strategy;
var users = require('./users');

app = express();

app.use(express.static(path.join(__dirname, "public")));
app.engine("html", require("hogan-express"));

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "html");
app.set("layout", "layout");
app.set("auths", require(hb.auth));

app.use(cookieParser());

app.use(bodyParser.urlencoded({
    extended: true
}));

app.use(require("express-session")({
    secret: "keyboard cat",
    resave: false,
    saveUninitialized: false
}));

passport.use(new strategy(function (username, password, callback) {
    users.findByUsername(username, function (err, user) {
        if (err) {
            return callback(err);
        }

        if (!user) {
            return callback(null, false);
        }

        if (user.password != password) {
            return callback(null, false);
        }

        return callback(null, user);
    });
}));

passport.serializeUser(function (user, callback) {
    callback(null, user.id);
});

passport.deserializeUser(function (id, callback) {
    users.findById(id, function (err, user) {
        if (err) {
            return callback(err);
        }

        callback(null, user);
    });
});

app.use(passport.initialize());
app.use(passport.session());

var index = require("./routes/index");
var log = require("./routes/log");
var accounts = require("./routes/accounts");
var plugins = require("./routes/plugins");
var config = require("./routes/config");

app.use("/", index);
app.use("/log", log);
app.use("/accounts", accounts);
app.use("/plugins", plugins);
app.use("/config", config);

app.use(function (req, res, next) {
    var err = new Error("Not Found");

    err.status = 404;
    next(err);
});

app.use(function (err, req, res, next) {
    res.locals.message = err.message;
    res.locals.error = req.app.get("env") === "development" ? err : {};
    res.status(err.status || 500);
    res.render("error", {
        controller: "error",
        title: "Error"
    });
});

module.exports = app;
