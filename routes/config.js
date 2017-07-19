var fs = require("fs");
var path = require("path");
var https = require("https");
var jp = require("jsonpath");
var express = require("express");
var router = express.Router();

var base = path.resolve("../../");
var modules = fs.readdirSync(base).filter(file => fs.lstatSync(path.join(base, file)).isDirectory());
var installed = {};
var plugins = [];

for (var i = 0; i < modules.length; i++) {
    var plugin = path.join(base, modules[i])

    if (fs.existsSync(path.join(plugin, "package.json"))) {
        var data = require(path.join(plugin, "package.json"));

        if (Array.isArray(data.keywords) && data.keywords.indexOf("homebridge-plugin") >= 0) {
            installed[data.name] = data.version;
        }
    }
}

var raw = {};

var req = https.request({
    host: "api.npms.io",
    port: 443,
    path: "/v2/search?q=keywords:homebridge-plugin+not:deprecated+not:insecure&size=250",
    method: "GET",
    headers: {
        "Content-Type": "application/json"
    }
}, function (res) {
    var output = "";

    res.setEncoding("utf8");

    res.on("data", function (chunk) {
        output += chunk;
    });

    res.on("end", function () {
        var data = JSON.parse(output);

        for (var i = 0; i < data.results.length; i++) {
            raw[data.results[i].package.name] = {
                name: data.results[i].package.name,
                version: data.results[i].package.version,
                description: (data.results[i].package.description) ? data.results[i].package.description : "",
                installed: (data.results[i].package.name in installed) ? installed[data.results[i].package.name] : "",
                links: data.results[i].package.links
            }
        }

        var keys = [];

        for (var key in raw) {
            if (raw.hasOwnProperty(key)) {
                keys.push(key);
            }
        }

        keys = keys.sort();

        for (var i = 0; i < keys.length; i++) {
            plugins.push(raw[keys[i]]);
        }

        installed = jp.query(plugins, "$[?(@.installed!='')]");
        plugins = jp.query(plugins, "$[?(@.installed=='')]");

        for (var i = 0; i < installed.length; i++) {
            if (installed[i].version > installed[i].installed) {
                installed[i].update = true;
            } else {
                installed[i].update = false;
            }
        }
    });
});

req.end();

router.get("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
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

    config.platforms.forEach(function (platform) {
        platforms.push({
            id: platform.platform,
            name: platform.name,
            json: JSON.stringify(platform, null, 4)
        });
    });

    var accessories = [];

    config.platforms.forEach(function (accessory) {
        accessories.push({
            id: accessory.accessory,
            name: accessory.name,
            json: JSON.stringify(accessory, null, 4)
        });
    });

    res.render("config", {
        controller: "config",
        title: "Configuration",
        server: server,
        platforms: platforms,
        accrssories: accessories
    });
});

router.post("/", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function (req, res, next) {
    var config = require(hb.config);

    config.bridge.name = req.body.name;
    config.bridge.username = req.body.mac;
    config.bridge.port = (!isNaN(parseInt(req.body.port))) ? parseInt(req.body.port) : 51826;
    config.bridge.pin = req.body.pin;

    config.platforms = [];

    req.body.platform.forEach(function (key) {
        if (req.body[key + "-delete"] == "false" && req.body[key + "-type"] == "platform") {
            var platform = JSON.parse(req.body[key + "-code"]);

            platform.name = req.body[key + "-name"];
            config.platforms.push(platform);
        }
    });

    config.accessories = [];

    req.body.platform.forEach(function (key) {
        if (req.body[key + "-delete"] == "false" && req.body[key + "-type"] == "accessory") {
            var accessory = JSON.parse(req.body[key + "-code"]);

            accessory.name = req.body[key + "-name"];
            config.accessories.push(accessory);
        }
    });

    fs.renameSync(hb.config, hb.config + "." + Math.floor(new Date() / 1000));
    fs.appendFileSync(hb.config, JSON.stringify(config, null, 4));

    app.get("log")("Configuration Changed.");

    var exec = require("child_process").exec;

    exec(hb.restart, function () {
        setTimeout(function () {
            res.redirect(302, "/config");
        }, 5000);
    });
});

router.get("/backup", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function (req, res, next) {
    var config = require(hb.config);

    res.setHeader("Content-disposition", "attachment; filename=config.json");
    res.setHeader("Content-type", "application/json");

    res.write(JSON.stringify(config, null, 4), function (err) {
        res.end();
    });
});

router.get("/installed", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function (req, res, next) {
    res.render("installed", {
        controller: "plugins",
        title: "Configuration",
        plugins: installed
    });
});

router.get("/plugins", function (req, res, next) {
    if (req.user) {
        next();
    } else {
        res.redirect("/login");
    }
}, function (req, res, next) {
    res.render("plugins", {
        controller: "plugins",
        title: "Configuration"
    });
});

module.exports = router;
