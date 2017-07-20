$(document).ready(function () {
    if ($(".server-menu").length > 0) {
        var menu = new mdc.menu.MDCSimpleMenu($(".server-menu")[0]);

        $("header").find(".server-menu-button").click(function () {
            menu.open = !menu.open;
        });

        $(".logout-button").click(function () {
            window.location.href = "/logout";
        });
    }
});
