$(document).ready(function () {
    var status = $(".status");

    status.load("/status", function (res, stat) {
        if (stat == "error") {
            status.html(down_html());
        }
    });

    setInterval(function () {
        status.load("/status", function (res, stat) {
            if (stat == "error") {
                status.html(down_html());
            }
        });
    }, 3000);

    $(".restart-server").click(function () {
        window.location.href = "/restart";
    });
});

function down_html() {
    var html = "";

    html += "<h1>Server Status</h1>";
    html += "<section class=\"mdc-elevation--z4\">";
    html += "    <h3>Service</h3>";
    html += "    <ul class=\"mdc-list mdc-list--two-line mdc-list--avatar-list status-icon\">";
    html += "        <li class=\"mdc-list-item status-list\">";
    html += "            <span class=\"mdc-list-item__start-detail status-item red-bg\" role=\"presentation\">";
    html += "                <i class=\"material-icons\" aria-hidden=\"true\">&#xE876;</i>";
    html += "              </span>";
    html += "            <span class=\"mdc-list-item__text\">";
    html += "                HB";
    html += "                <span class=\"mdc-list-item__text__secondary\">Not running</span>";
    html += "            </span>";
    html += "        </li>";
    html += "        <li class=\"mdc-list-item status-list\">";
    html += "            <span class=\"mdc-list-item__start-detail status-item red-bg\" role=\"presentation\">";
    html += "                <i class=\"material-icons\" aria-hidden=\"true\">&#xE876;</i>";
    html += "              </span>";
    html += "            <span class=\"mdc-list-item__text\">";
    html += "                Console";
    html += "                <span class=\"mdc-list-item__text__secondary\">Not running</span>";
    html += "            </span>";
    html += "        </li>";
    html += "    </ul>";
    html += "</section>";

    return html;
}