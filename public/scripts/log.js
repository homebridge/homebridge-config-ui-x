$(document).ready(function () {
    var inital = true;
    var content = $("content");
    var log = content.find("#log-contents");
    var enable = false;

    content.on("scroll", function () {
        if (content.scrollTop() + content.innerHeight() >= content[0].scrollHeight) {
            enable = true;
        } else {
            enable = false;
        }
    });

    setInterval(function () {
        if (inital || enable || log.height() <= content.height()) {
            log.load("/log/raw", function () {
                content.scrollTop(content.prop("scrollHeight"));
                inital = false;
            });
        }
    }, 200);

    $("#clear-log").click(function () {
        $.get("/log/clear");
    });
});
