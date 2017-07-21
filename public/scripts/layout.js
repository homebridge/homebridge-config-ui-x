$(document).ready(function () {
    if ($(".server-menu").length > 0) {
        var menu = new mdc.menu.MDCSimpleMenu($(".server-menu")[0]);

        $("header").find(".server-menu-button").click(function () {
            menu.open = !menu.open;
        });

        var pwddlg = new mdc.dialog.MDCDialog($("#set-password-dialog")[0]);

        $(".set-password-button").on("click", function () {
            var form = $("#change-password-form");
            var message = "";

            if (isNaN(form.find("#user-id").val())) {
                message += "Invalid user.<br />";
            }

            if (form.find("#new-password").val() == "") {
                message += "You must set a password.<br />";
            }

            if (form.find("#new-password").val().length < 8) {
                message += "Password must be at least 8 characters long.<br />";
            }

            if (form.find("#new-password").val() != form.find("#confirm-password").val()) {
                message += "Passwords do not match.<br />";
            }

            if (message == "") {
                form.submit();
            } else {
                form.find("#password-message").html(message);
            }
        });

        $(".change-password").click(function () {
            pwddlg.show();
        });

        $(".logout-button").click(function () {
            window.location.href = "/logout";
        });
    }
});
