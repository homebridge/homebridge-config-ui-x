(function () {
    function declare(module_name, exports) {
        module.exports = exports;
    }

    function ansi(str) {
        var props = {};
        var open = false;

        var stylemap = {
            bold: "font-weight",
            underline: "text-decoration",
            color: "color",
            background: "background"
        }

        function style() {
            var key;
            var val;
            var style = [];

            for (var key in props) {
                val = props[key];

                if (!val) {
                    continue;
                }

                if (val == true) {
                    style.push(stylemap[key] + ":" + key);
                } else {
                    style.push(stylemap[key] + ":" + val);
                }
            }

            return style.join(";");
        }

        function tag(code) {
            var i;
            var tag = "";
            var n = ansi.table[code];

            if (open) {
                tag += "</span>";
            }

            open = false;

            if (n) {
                for (i in n) {
                    props[i] = n[i];
                }

                tag += "<span style=\"" + style() + "\">";
                open = true;
            } else {
                props = {};
            }

            return tag;
        }

        return ("" + str + "").replace(/\[(\d+;)?(\d+)*m/g, function (match, b1, b2) {
            var i;
            var code;
            var res = "";

            if (b2 == "" || b2 == null) {
                b2 = "0";
            }

            for (i = 1; i < arguments.length - 2; i++) {
                if (!arguments[i]) {
                    continue;
                }

                code = parseInt(arguments[i]);
                res += tag(code);
            }

            return res;
        }) + tag();
    }

    ansi.table = {
        0: null,
        1: {
            bold: true
        },
        3: {
            italic: true
        },
        4: {
            underline: true
        },
        5: {
            blink: true
        },
        6: {
            blink: true
        },
        7: {
            invert: true
        },
        9: {
            strikethrough: true
        },
        23: {
            italic: false
        },
        24: {
            underline: false
        },
        25: {
            blink: false
        },
        27: {
            invert: false
        },
        29: {
            strikethrough: false
        },
        30: {
            color: "black"
        },
        31: {
            color: "red"
        },
        32: {
            color: "#00bc06"
        },
        33: {
            color: "#efc340"
        },
        34: {
            color: "#4688f2"
        },
        35: {
            color: "magenta"
        },
        36: {
            color: "cyan"
        },
        37: {
            color: "white"
        },
        39: {
            color: null
        },
        40: {
            background: "black"
        },
        41: {
            background: "red"
        },
        42: {
            background: "#00bc06"
        },
        43: {
            background: "#efc340"
        },
        44: {
            background: "#4688f2"
        },
        45: {
            background: "magenta"
        },
        46: {
            background: "cyan"
        },
        47: {
            background: "white"
        },
        49: {
            background: null
        },
        90: {
            color: "#b2b2b2"
        }
    }

    declare("ansi", ansi)
})();
