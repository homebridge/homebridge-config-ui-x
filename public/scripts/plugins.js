$(document).ready(function () {
    if ($("#plugin-list").length > 0) {
        var undlg = new mdc.dialog.MDCDialog($("#uninstall-plugin-dialog")[0]);

        undlg.listen("MDCDialog:accept", function () {
            window.location.href = "/plugins/uninstall?package=" + undlg.package;
        });

        var upgdg = new mdc.dialog.MDCDialog($("#upgrade-plugin-dialog")[0]);

        upgdg.listen("MDCDialog:accept", function () {
            window.location.href = "/plugins/upgrade?package=" + undlg.package;
        });

        $("#plugin-list").on("click", ".plugin-action-button", function () {
            var btn = $(this);

            switch (btn.attr("action")) {
                case "upgrade":
                    $("#uninstall-plugin-dialog").find("#plugin-version").html(btn.attr("version"));

                    undlg.package = btn.attr("package");
                    undlg.show()
                    break;

                case "uninstall":
                    undlg.package = btn.attr("package");
                    undlg.show();
                    break;

                case "install":
                    window.location.href = "/plugins/install?package=" + btn.attr("package");
                    break;
            }
        });
    }
});
