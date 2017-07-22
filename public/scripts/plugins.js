$(document).ready(function () {
    if ($("#plugin-list").length > 0) {
        var undlg = new mdc.dialog.MDCDialog($("#uninstall-plugin-dialog")[0]);

        undlg.listen("MDCDialog:accept", function () {
            window.location.href = "/plugins/uninstall?package=" + undlg.package;
        });

        var upgdg = new mdc.dialog.MDCDialog($("#upgrade-plugin-dialog")[0]);

        upgdg.listen("MDCDialog:accept", function () {
            window.location.href = "/plugins/upgrade?package=" + upgdg.package;
        });

        $("#plugin-list").on("click", ".plugin-action-button", function () {
            var btn = $(this);

            switch (btn.attr("action")) {
                case "upgrade":
                    $("#upgrade-plugin-dialog").find("#plugin-version").html(btn.attr("version"));

                    upgdg.package = btn.attr("package");
                    upgdg.show()
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

    if ($("#install-config").length > 0) {
        var platforms = [];
        var cfgdlg = new mdc.dialog.MDCDialog($("#config-error-dialog")[0]);

        $(".add-accessory-button").on("click", function () {
            var id = ($("#accessory-container").find(".new-accessory").length + 1) + "-new-accessory";
            var html = "";

            html += "<div class=\"accessory new-accessory mdc-elevation--z4\" accessory=\"" + id + "\">";
            html += "    <input type=\"hidden\" name=\"accessory\" value=\"" + id + "\">";
            html += "    <input type=\"hidden\" id=\"" + id + "-delete\" name=\"" + id + "-delete\" value=\"false\">";
            html += "    <table cellpadding=\"0\" cellspacing=\"0\" border=\"0\">";
            html += "        <tbody>";
            html += "            <tr>";
            html += "                <td>";
            html += "                    <div class=\"mdc-form-field\">";
            html += "                        <div class=\"mdc-textfield\" data-mdc-auto-init=\"MDCTextfield\">";
            html += "                            <input id=\"" + id + "-name\" name=\"" + id + "-name\" type=\"text\" class=\"mdc-textfield__input\" value=\"\">";
            html += "                            <label for=\"" + id + "-name\" class=\"mdc-textfield__label\">Name</label>";
            html += "                        </div>";
            html += "                    </div>";
            html += "                </td>";
            html += "                <td>";
            html += "                    <textarea id=\"" + id + "-code\" name=\"" + id + "-code\" accessory=\"" + id + "\">{\n    \n}</textarea>";
            html += "                </td>";
            html += "                <td>";
            html += "                    <i class=\"accessory-delete material-icons\" role=\"button\" accessory=\"" + id + "\">delete</i>";
            html += "                </td>";
            html += "            </tr>";
            html += "        </tbody>";
            html += "    </table>";
            html += "</div>";

            $("#accessory-container").append(html);

            var textarea = $("#accessory-container").find("#" + id + "-code");

            platforms.push({
                id: textarea.attr("id"),
                editor: CodeMirror.fromTextArea(textarea[0], {
                    lineNumbers: false,
                    matchBrackets: true,
                    lineWrapping: true,
                    height: "auto"
                })
            });

            mdc.autoInit();
        });

        $("#accessory-container").on("click", ".accessory-delete", function () {
            var accessory = $(this).attr("accessory");

            $("#" + accessory + "-delete").val("true");
            $("#" + accessory + "-code").html("");

            $(".accessory[accessory='" + accessory + "']").hide();
        });

        $.each($("textarea"), function () {
            var textarea = $(this);

            platforms.push({
                id: textarea.attr("id"),
                editor: CodeMirror.fromTextArea(textarea[0], {
                    lineNumbers: false,
                    matchBrackets: true,
                    lineWrapping: true,
                    height: "auto"
                })
            });
        });

        $(".save-button").click(function () {
            var platformNames = [];
            var accessoryNames = [];

            var message = "";

            $.each(platforms, function () {
                var input = $("#" + this.id);
                var current = input.val;
                var updated = this.editor.getValue();

                if (updated != current) {
                    input.html(updated);
                }

                if (input.attr("accessory")) {
                    var name = $("#platforms").find("#" + input.attr("accessory") + "-name").val();

                    if (name == "") {
                        if (message.indexOf("Each accessory must have a name.") == -1) {
                            if (message != "") {
                                message += "<br />";
                            }

                            message += "Each accessory must have a name.";
                        }
                    } else {
                        if (accessoryNames.indexOf(name) >= 0) {
                            if (message.indexOf("Your accessory names must be unique.") == -1) {
                                if (message != "") {
                                    message += "<br />";
                                }

                                message += "Your accessory names must be unique.";
                            }
                        } else {
                            accessoryNames.push(name);
                        }
                    }
                } else if (updated != "") {
                    var name = $("#platforms").find("#platform-name").val();

                    if (name == "") {
                        if (message.indexOf("Each platform must have a name.") == -1) {
                            if (message != "") {
                                message += "<br />";
                            }

                            message += "Each platform must have a name.";
                        }
                    } else {
                        if (platformNames.indexOf(name) >= 0) {
                            if (message.indexOf("Your platform names must be unique.") == -1) {
                                if (message != "") {
                                    message += "<br />";
                                }

                                message += "Your platform names must be unique.";
                            }
                        } else {
                            platformNames.push(name);
                        }
                    }
                }
            });

            if (message == "") {
                $("#install-config").submit();
            } else {
                $("#config-error-dialog").find("#config-alert-message").html(message);
                cfgdlg.show();
            }
        });
    }
});
