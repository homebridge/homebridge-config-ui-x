$(document).ready(function () {
    var platforms = [];
    var menus = new Array();

    $.each($(".platform-form"), function () {
        var container = $(this);

        if (container.children().length > 1) {
            container.show();
        } else {
            container.hide();
        }
    });

    $("#platforms").on("click", ".platform-delete", function () {
        var platform = $(this).attr("platform");

        if (platform != "interface") {
            $("#" + platform + "-updated").val("true");
            $("#" + platform + "-delete").val("true");
            $("#" + platform + "-code").html("");

            $(".platform[platform='" + platform + "']").hide();
        }
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
        $.each(platforms, function () {
            var input = $("#" + this.id);
            var current = input.val;
            var updated = this.editor.getValue();

            if (updated != current) {
                input.html(updated);
            }
        });

        $("#server-config").submit();
    });

    $(".backup-config").click(function () {
        window.location.href = "/config/backup";
    });
});
