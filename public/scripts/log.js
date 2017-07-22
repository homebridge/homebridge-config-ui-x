$(document).ready(function () {
    var inital = true;
    var content = $("content");
    var enable = false;

    var log;

    content.on("scroll", function () {
        if (content.scrollTop() + content.innerHeight() >= content[0].scrollHeight) {
            enable = true;
        } else {
            enable = false;
        }
    });

    if ($("#output-log-contents").length > 0) {
        log = content.find("#output-log-contents");

        setInterval(function () {
            if (inital || enable || log.height() <= content.height()) {
                log.load("/log/raw/out", function () {
                    content.scrollTop(content.prop("scrollHeight"));
                    inital = false;
                });
            }
        }, 200);

        $("#clear-log").click(function () {
            $.get("/log/clear");
        });

        $("#error-log-view").click(function () {
            window.location.href = "/log/error";
        });
    }

    if ($("#error-log-contents").length > 0) {
        log = content.find("#error-log-contents");

        if (inital || enable || log.height() <= content.height()) {
                log.load("/log/raw/error", function () {
                    content.scrollTop(content.prop("scrollHeight"));
                    inital = false;
                });
            }

        $("#clear-log").click(function () {
            $.get("/log/clear");
        });

        $("#output-log-view").click(function () {
            window.location.href = "/log";
        });
    }
});
