var path = require("path");
var chalk = require("chalk");

var Service;
var Characteristic;

module.exports = function(service) {
    hb = {
        service: service,
        config: service.user.configPath(),
        auth: path.join(service.user.storagePath(), "auth.json")
    };

    Service = service.hap.Service;
    Characteristic = service.hap.Characteristic;

    service.registerPlatform("homebridge-config-ui", "config", HttpServer);
}

function HttpServer(log, config) {
    var app = require("./app");
    var debug = require("debug")("express:server");
    var http = require("http");

    hb.log = config.log || "/var/log/homebridge.stdout.log";
    hb.restart = config.restart || "/usr/local/bin/supervisorctl restart homebridge";

    app.set("port", config.port);
    app.set("log", log);

    var server = http.createServer(app);

    server.listen(config.port);
    server.on("error", onError);
    server.on("listening", onListening);

    function normalizePort(val) {
        var port = parseInt(val, 10);

        if (isNaN(port)) {
            return val;
        }

        if (port >= 0) {
            return port;
        }

        return false;
    }

    function onError(error) {
        if (error.syscall !== "listen") {
            throw error;
        }

        var bind = typeof config.port === "string" ? "Pipe " + config.port : "Port " + config.port;

        switch (error.code) {
            case "EACCES":
                console.error(bind + " requires elevated privileges");
                process.exit(1);
                break;

            case "EADDRINUSE":
                console.error(bind + " is already in use");
                process.exit(1);
                break;

            default:
                throw error;
        }
    }

    function onListening() {
        var addr = server.address();
        var bind = typeof addr === "string" ? "pipe " + addr : "port " + addr.port;
        var msg = "Console is listening on " + bind + ".";

        app.get("log")(msg);
    }
}

HttpServer.prototype.accessories = function(callback) {
    this.accessories = [];

    callback(this.accessories);
}
