$(document).ready(function() {
    $("error").find("button").click(function () {
        $(this).parent().find("pre").toggle();
    });

    $(".show-details").click(function () {
        $("error").find("pre").show();
    });
});
