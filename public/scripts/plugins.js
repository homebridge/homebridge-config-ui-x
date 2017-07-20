$(document).ready(function () {
    var undlg = new mdc.dialog.MDCDialog($("#uninstall-plugin-dialog")[0]);

    undlg.listen("MDCDialog:accept", function () {
        alert(undlg.package);
    });

    $("#installed-plugins").on("click", ".plugin-action-button", function () {
        var btn = $(this);

        switch (btn.attr("action")) {
            case "update":
                break;

            case "uninstall":
                undlg.package = btn.attr("package");
                undlg.show();
                break;

            case "install":
                break;
        }
    });
});
