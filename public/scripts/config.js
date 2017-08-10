$(document).ready(function () {
    if ($("#server-config").length > 0) {
        var platforms = [];
        var cfgdlg = new mdc.dialog.MDCDialog($("#config-error-dialog")[0]);

        $(".add-platform-button").on("click", function () {
            var id = ($("#platform-container").find(".new-platform").length + 1) + "-new-platform";
            var html = "";

            html += "<div class=\"platform new-platform mdc-elevation--z4\" platform=\"" + id + "\">";
            html += "    <input type=\"hidden\" name=\"platform\" value=\"" + id + "\">";
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
            html += "                    <textarea id=\"" + id + "-code\" name=\"" + id + "-code\" platform=\"" + id + "\">{\n    \n}</textarea>";
            html += "                </td>";
            html += "                <td>";
            html += "                    <i class=\"platform-delete material-icons\" role=\"button\" platform=\"" + id + "\">delete</i>";
            html += "                </td>";
            html += "            </tr>";
            html += "        </tbody>";
            html += "    </table>";
            html += "</div>";

            $("#platform-container").append(html);

            var textarea = $("#platform-container").find("#" + id + "-code");

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

        $("#platforms").on("click", ".platform-delete", function () {
            var platform = $(this).attr("platform");

            if (platform != "interface") {
                $("#" + platform + "-updated").val("true");
                $("#" + platform + "-delete").val("true");
                $("#" + platform + "-code").html("");

                $(".platform[platform='" + platform + "']").remove();
            }
        });

        $("#platforms").on("click", ".accessory-delete", function () {
            var accessory = $(this).attr("accessory");

            $("#" + accessory + "-updated").val("true");
            $("#" + accessory + "-delete").val("true");
            $("#" + accessory + "-code").html("");

            $(".accessory[accessory='" + accessory + "']").remove();
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

                if (input.attr("platform")) {
                    var name = $("#platforms").find("#" + input.attr("platform") + "-name").val();

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
                } else {
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
                }
            });

            if (message == "") {
                $("#server-config").submit();
            } else {
                $("#config-error-dialog").find("#config-alert-message").html(message);
                cfgdlg.show();
            }
        });
    }

    if ($("#advanced-config").length > 0) {
        var editor = CodeMirror.fromTextArea($("#config-code")[0], {
            lineNumbers: false,
            matchBrackets: true,
            lineWrapping: true,
            height: "auto"
        });

        $(".save-button").on("click", function () {
            $("#config-code").html(editor.getValue());
            $("#advanced-config").submit();
        });
    }

    $(".guided-config").click(function () {
        window.location.href = "/config";
    });

    $(".advanced-config").click(function () {
        window.location.href = "/config/advanced";
    });

    $(".backup-config").click(function () {
        window.location.href = "/config/backup";
    });
});
