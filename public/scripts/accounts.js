$(document).ready(function () {
    var audlg = new mdc.dialog.MDCDialog($("#edit-auth-dialog")[0]);

    $(".save-auth-button").on("click", function () {
        var form = $("#auth-edit-form");
        var message = "";

        if (isNaN(form.find("#auth-user-id").val())) {
            message += "Invalid user.<br />";
        }

        if (form.find("#auth-username") == "") {
            message += "Invalid user.<br />";
        }

        if (form.find("#auth-name") == "") {
            message += "Invalid user.<br />";
        }

        if (form.find("#auth-password").val() != "") {
            if (form.find("#auth-password").val().length < 8) {
                message += "Password must be at least 8 characters long.<br />";
            }

            if (form.find("#auth-password").val() != form.find("#auth-confirm-password").val()) {
                message += "Passwords do not match.<br />";
            }
        }

        if (message == "") {
            form.submit();
        } else {
            form.find("#auth-edit-message").html(message);
        }
    });

    $(".delete-auth-button").on("click", function () {
        $("#delete-auth-dialog").find("#delete-auth-name").html($("#auth-edit-form").find("#auth-name").val());
        deldg.show();
    });

    $("#auths-list").on("click", ".edit-auth-button", function (event) {
        var btn = $(this);
        var form = $("#auth-edit-form");

        event.preventDefault();

        audlg.show();

        form.find("#auth-user-id").val(btn.attr("authid"));
        form.find("#auth-name").val(btn.attr("authname")).focus();
        form.find("#auth-username").val(btn.attr("authusername")).focus();
        form.find("#auth-admin").val(btn.attr("authadmin"));

        $("#edit-auth-dialog").find("#auth-name-title").html("Edit " + btn.attr("authname"));

        if (!isNaN(parseInt(btn.attr("authid"))) && parseInt(btn.attr("authid")) == 1) {
            $(".delete-auth-button").hide();

            form.find("#auth-admin-check").prop("checked", true).prop("disabled", true);
        } else {
            $(".delete-auth-button").show();

            if (btn.attr("authadmin") == "true") {
                form.find("#auth-admin-check").prop("checked", true).prop("disabled", false);
            } else {
                form.find("#auth-admin-check").prop("checked", false).prop("disabled", false);
            }
        }
    });

    $(".add-auth-button").on("click", function (event) {
        var form = $("#auth-edit-form");

        event.preventDefault();

        audlg.show();

        form.find("#auth-user-id").val("0");
        form.find("#auth-name").val("");
        form.find("#auth-username").val("").focus();
        form.find("#auth-admin").val("false");

        $("#edit-auth-dialog").find("#auth-name-title").html("Add User");
        $(".delete-auth-button").hide();

        form.find("#auth-admin-check").prop("checked", false).prop("disabled", false);
    });

    var deldg = new mdc.dialog.MDCDialog($("#delete-auth-dialog")[0]);

    deldg.listen("MDCDialog:accept", function () {
        window.location.href = "/accounts/delete?id=" + $("#auth-edit-form").find("#auth-user-id").val();
    });
});
