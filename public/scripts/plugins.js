$(document).ready(function () {
    var undlg = new mdc.dialog.MDCDialog($("#uninstall-plugin-dialog")[0]);

    undlg.listen("MDCDialog:accept", function () {
        alert(undlg.plugin);
    });

    function uninstall(plugin) {
        undlg.plugin = plugin;
        undlg.show();
    }
});