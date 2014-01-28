(function(exports) {

exports.Dashboard = function (serverUri) {

"use strict";

var telemetry = null;
var defaultDimension = "appName";

var maxStackFrames = 10;
var topReports = 10;
var reportColors = (function() {
    var colors = [];
    for (var i = 0; i <= topReports; i++) {
        colors.push(Color({
            h: 222 - 222 * i / topReports,
            s: 55,
            l: 55,
        }).hexString());
    }
    return colors;
})();

$(".plot").each(function(i, plot) {
    $(plot).height($(plot).parent().height() - $(plot).position().top);
});

$("#navbar-filter").popover({
    html: true,
    content: function() {
        return $("#popover-filter").html();
    }
});

var re_grouping = /\D+|\d+(\.\d+)?[ETGMkmμnpf]?/g;
function smartSort(str1, str2) {
    var match1 = (str1 + '').match(re_grouping);
    var match2 = (str2 + '').match(re_grouping);
    for (var i = 0; i < match1.length && i < match2.length; i++) {
        if (!isNaN(parseInt(match1[i])) && !isNaN(parseInt(match2[i]))) {
            var diff = revSmartPrefix(match1[i]) - revSmartPrefix(match2[i]);
            if (diff !== 0) {
                return diff;
            }
            continue;
        }
        var m1 = match1[i].toUpperCase();
        var m2 = match2[i].toUpperCase();
        if (m1 < m2) {
            return -1;
        } else if (m1 > m2) {
            return 1;
        }
    }
    return match1.length - match2.length;
}
function revSmartSort(str1, str2) {
    return -smartSort(str1, str2);
}

function _smartUnits(values, names, precisions) {
    return function(value) {
        for (var i = 0; i < values.length; i++) {
            if (value < values[i]) {
                continue;
            }
            return (value / values[i]).toPrecision(
                precisions[Math.min(precisions.length - 1, i)]) + names[i];
        }
        return value.toPrecision(precisions[precisions.length - 1]);
    };
}
function _revSmartUnits(values, names) {
    return function(value) {
        value = value + '';
        for (var i = 0; i < values.length; i++) {
            if (value.indexOf(names[i], value.length - names[i].length) > -1) {
                return +(value.slice(0, value.length - names[i].length)) * values[i];
            }
        }
        return parseFloat(value);
    };
}
var smartPrefix = _smartUnits(
    [1e15, 1e12, 1e9, 1e6, 1e3, 1, 1e-3, 1e-6, 1e-9, 1e-12, 1e-15],
    ['E', 'T', 'G', 'M', 'k', '', 'm', 'μ', 'n', 'p', 'f', ''],
    [3]);
var revSmartPrefix = _revSmartUnits(
    [1e15, 1e12, 1e9, 1e6, 1e3, 1e-3, 1e-6, 1e-9, 1e-12, 1e-15, 1],
    ['E', 'T', 'G', 'M', 'k', 'm', 'μ', 'n', 'p', 'f', '']);
var smartTime = _smartUnits(
    [31556952, 604800, 86400, 3600, 60, 1, 1e-3, 1e-6, 1e-9, 1e-12],
    ['y', 'w', 'd', 'h', 'm', 's', 'ms', 'μs', 'ns', 'ps', ''],
    [2, 2, 2, 2, 2, 2, 3]);
function smartPercent(v) {
    return (v * 100).toPrecision(3) + "%";
}

function replaceBrackets(str) {
    return str && str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fillReportModal(modal, report, dimValue, sessions, options) {
    options = options || {};
    var infoPlot = $("#report-info-plot");
    var infoPlotted = false;
    infoPlot.prev("i.fa-spinner").fadeIn();
    var buildPlot = $("#report-build-plot");
    var buildPlotted = false;
    buildPlot.prev("i.fa-spinner").fadeIn();
    var activityPlot = $("#report-activity-plot");
    var activityPlotted = false;
    if (activityPlot.length) {
        activityPlot.prev("i.fa-spinner").fadeIn();
    }
    modal.find(".spinner-holder i").fadeIn();

    var stacks = $("#report-stacks");
    var template = $("#report-stacks-thread");
    stacks.children().not(template).not(".spinner-holder").remove();

    function addThreads(threads, append) {
        var out = $();
        threads.forEach(function(thread) {
            var clone = template.clone()
                .removeAttr("id").removeClass("hide");
            var body = clone.find(".panel-body");
            var stack = thread.stack();
            var muteNative = stack.some(function(frame) {
                return !frame.isNative();
            });
            stack.forEach(function(frame) {
                var line = frame.lineNumber();
                var func = frame.functionName();
                var lib = frame.libName();
                var text = func + (lib ? " (" + lib + ")" : "")
                                + (line ? " (line " + line + ")" : "");
                $("<li/>").text(text)
                          .addClass(muteNative && frame.isNative() ? "text-muted" : "")
                          .appendTo(body);
            });

            var id = "report-stacks-" + stacks.children().length;
            clone.find(".panel-collapse")
                 .attr("id", id)
                 .addClass(append ? "" : "in");
            clone.find(".panel-heading")
                 .text(thread.name() + " stack")
                 .attr("data-target", "#" + id);
            out.add(append ? clone.appendTo(stacks)
                           : clone.prependTo(stacks));
        });
        return out;
    }

    var hideSpinner = 2;
    report.mainThread(function(threads) {
        addThreads(threads, /* append */ false);
        if (!(--hideSpinner)) {
            modal.find(".spinner-holder i").stop().fadeOut();
        }
    });
    report.backgroundThreads(function(threads) {
        addThreads(threads, /* append */ true);
        if (!(--hideSpinner)) {
            modal.find(".spinner-holder i").stop().fadeOut();
        }
    });
    function _plot() {
        if (!infoPlotted && $("#report-plots-info").hasClass("in")) {
            replotInfo(infoPlot, report, dimValue, sessions, options);
            infoPlot.prev("i.fa-spinner").stop().fadeOut();
            infoPlotted = true;
        }
        if (!buildPlotted && $("#report-plots-build").hasClass("in")) {
            replotBuild(buildPlot, report, dimValue, sessions, options);
            buildPlot.prev("i.fa-spinner").stop().fadeOut();
            buildPlotted = true;
        }
        if (activityPlot.length &&
            !activityPlotted && $("#report-plots-activity").hasClass("in")) {
            replotActivities(activityPlot, [report], dimValue,
                             $.extend({noname: true}, options));
            activityPlot.prev("i.fa-spinner").stop().fadeOut();
            activityPlotted = true;
        }
    }
    $("#report-plots-info").on("shown.bs.collapse", _plot);
    $("#report-plots-build").on("shown.bs.collapse", _plot);
    $("#report-plots-activity").on("shown.bs.collapse", _plot);
    modal.on("shown.bs.modal", _plot).on("hidden.bs.modal", function(event) {
        $.plot(infoPlot, [[0, 0]], {grid: {show: false}});
        $.plot(buildPlot, [[0, 0]], {grid: {show: true}});
        $.plot(activityPlot, [[0, 0]], {grid: {show: true}});
    });
}

function replotReports(elem, reports, sessions, options) {
    var values = reports.dimensionValues();
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        var uptimeSession = sessions.byName('uptime');
        uptimes = {};
        values.forEach(function(value) {
            uptimes[value] = uptimeSession.count(value) / 60000;
        });
        values = values.filter(function(value) {
            return (uptimes[value] || 0) >= 0.1;
        });
    }
    values.sort(smartSort);

    var reports = reports.all();
    reports.sort(function(r1, r2) {
        return r1.count() - r2.count();
    });
    var otherReports = reports.slice(0, -topReports);

    var data = [{
        label: "other",
        data: values.map(function(value, index) {
            return [index, otherReports.reduce(function(prev, report) {
                return prev + report.count(value);
            }, 0) / (uptimes ? uptimes[value] : 1)];
        }),
        report: null,
    }];
    reports.slice(-topReports).forEach(function(report) {
        data.push({
            data: values.map(function(value, index) {
                return [index, report.count(value) /
                               (uptimes ? uptimes[value] : 1)];
            }),
            report: report,
        });
    });

    function _tooltip(label, xval, yval, item) {
        var num = item.series.data[item.dataIndex][1];
        var tip = values[item.dataIndex] + " : " +
                  ((!uptimes || num >= 10) ? smartPrefix(Math.round(num))
                                           : num.toPrecision(2)) +
                  " hang" + (num === 1 ? "" : "s");
        options.normalize && (tip += " / 1k user-hrs");
        var report = item.series.report;
        tip = replaceBrackets(tip);
        if (!report) {
            return tip;
        }
        var out = null;
        report.mainThread(function(threads) {
            var stack = "<hr>";
            var count = 0;
            var stackobj = threads[0].stack();
            var skipNative = stackobj.some(
                function(frame) { return !frame.isNative(); });
            stackobj.every(function(frame, index) {
                if ((skipNative && frame.isNative()) ||
                    (!skipNative && !isNaN(parseInt(frame.functionName())))) {
                    return true;
                }
                var line = frame.lineNumber();
                stack += (count ? "<br>" : "") + replaceBrackets(
                    frame.functionName() +
                    (line ? " (line " + line + ")" : ""));
                return (++count) < maxStackFrames;
            });
            if (out) {
                var tipelem = $("#flotTip");
                var origheight = tipelem.height();
                $("#report-plot-stack").html(stack);
                tipelem.offset({
                    top: tipelem.offset().top -
                         (tipelem.height() - origheight) / 2,
                });
            } else {
                out = stack;
            }
        });
        out = "<div id='report-plot-stack'>" + (out || "") + "</div>";
        return tip + out;
    }

    function _tooltipHover(item, tooltip) {
        var baroffset = plotobj.pointOffset({
            x: item.datapoint[0] + 0.5,
            y: (item.datapoint[1] + item.datapoint[2]) / 2,
        });
        var plotoffset = elem.offset();
        tooltip.removeClass("top bottom left").addClass("right")
        .html(
            "<div class='tooltip-inner'>" + tooltip.html() + "</div>" +
            "<div class='tooltip-arrow'></div>")
        .offset({
            left: plotoffset.left + baroffset.left,
            top: plotoffset.top + baroffset.top - tooltip.height() / 2,
        });
    }

    var plotobj = $.plot(elem, data, {
        series: {
            stack: true,
            bars: {
                show: true,
                align: "center",
                barWidth: 0.9,
            },
        },
        grid: {
            show: true,
            clickable: true,
            hoverable: true,
        },
        xaxis: {
            ticks: values.map(function(value, index) {
                return [index, value];
            }),
        },
        yaxis: {
            tickFormatter: smartPrefix,
        },
        colors: reportColors,
        tooltip: true,
        tooltipOpts: {
            content: _tooltip,
            onHover: _tooltipHover,
        },
    });

    elem.off("plotclick").on("plotclick", function(event, pos, item) {
        if (!item || !item.series.report) {
            return;
        }
        var modal = $("#report-modal");
        var dimValue = values[item.dataIndex];
        var report = item.series.report;
        $("#report-modal-rank").text(topReports - item.seriesIndex + 1);
        $("#report-modal-count").text(reports.length);
        $("#report-modal-dim").text(dimValue);
        $("#report-modal-id").text(report.name());
        fillReportModal(modal, report, dimValue, sessions, options);
        modal.modal("show");
    });
}

function replotInfo(elem, reports, value, sessions, options) {
    var agg = reports.infoDistribution(value);
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        uptimes = sessions.byName('uptime').infoDistribution(value);
        Object.keys(uptimes).forEach(function(info) {
            var uptime = uptimes[info];
            uptime[''] = Object.keys(uptime).reduce(
                function(prev, val) {
                    var v = uptime[val];
                    if (v < 600) {
                        delete uptime[val];
                    }
                    return prev + v;
                }, 0);
        });
    }

    var seriescount = 0;
    var infos = Object.keys(agg);
    infos.sort(revSmartSort);
    var data = infos.map(function(info, index) {
        var histogram = agg[info];
        var valuesarray = Object.keys(histogram);
        seriescount = Math.max(seriescount, valuesarray.length);
        valuesarray = valuesarray.map(function(value) {
            return [value, histogram[value] / (!uptimes ? 1 :
                           (uptimes[info][value] || uptimes[info]['']))];
        });
        valuesarray.sort(function(val1, val2) {
            return val2[1] - val1[1];
        });
        var total = valuesarray.reduce(function(prev, value) {
            return prev + value[1];
        }, 0) / 100;
        return valuesarray.map(function(value) {
            return {info: value[0], data: [value[1] / total, index]};
        });
    });

    var plotdata = [];
    data.forEach(function(info, infoindex) {
        var prevmapto = -1;
        info.forEach(function(series, index) {
            var mapto = Math.max(prevmapto + 1, Math.round(100 - series.data[0]));
            for (var i = prevmapto + 1; i < mapto; i++) {
                plotdata[i] = (plotdata[i] || {
                    data: [],
                    info: [],
                });
                plotdata[i].data.push([0, series.data[1]]);
                plotdata[i].info.push(null);
            }
            plotdata[mapto] = (plotdata[mapto] || {
                data: [],
                info: [],
            });
            plotdata[mapto].data.push(series.data);
            plotdata[mapto].info.push(series.info);
            prevmapto = mapto;
        });
    });

    var colors = [];
    for (var i = 0; i <= 100; i++) {
        var scale = Math.pow(i / 100, 4);
        colors.push(Color({
            h: 177 * scale + 22,
            s: 44,
            l: 55,
        }).hexString());
    }
    for (var i = 0; i < seriescount; i++) {
        colors.push(Color({h: 200, s: 44, l: 55}).hexString());
    }

    function _tooltip(label, xval, yval, item) {
        return replaceBrackets(item.series.info[item.dataIndex] + " : " +
               Math.round(item.series.data[item.dataIndex][0]) + "%");
    }
    function _tooltipHover(item, tooltip) {
        var baroffset = plotobj.pointOffset({
            x: (item.datapoint[0] + item.datapoint[2]) / 2,
            y: item.datapoint[1] - 0.5,
        });
        var plotoffset = elem.offset();
        tooltip.removeClass("top right left").addClass("bottom")
        .html(
            "<div class='tooltip-inner'>" + tooltip.html() + "</div>" +
            "<div class='tooltip-arrow'></div>")
        .offset({
            left: plotoffset.left + baroffset.left - tooltip.width() / 2,
            top: plotoffset.top + baroffset.top,
        });
    }

    var plotobj = $.plot(elem, plotdata, {
        series: {
            stack: true,
            bars: {
                show: true,
                align: "center",
                barWidth: 0.6,
                horizontal: true,
            },
        },
        grid: {
            show: true,
            color: "transparent",
            hoverable: true,
        },
        yaxis: {
            show: true,
            ticks: infos.map(function(info, index) {
                return [index, info];
            }),
        },
        xaxis: {
            show: false,
        },
        colors: colors,
        tooltip: true,
        tooltipOpts: {
            content: _tooltip,
            onHover: _tooltipHover,
        },
    });
}

function replotBuild(elem, reports, value, sessions, options) {
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        uptimes = sessions.byName('uptime').infoDistribution(value).appBuildID;
        Object.keys(uptimes).forEach(function(val) {
            if (uptimes[val] < 600) {
                delete uptimes[val];
            } else {
                uptimes[val] = uptimes[val] / 60000;
            }
        });
    }

    var builds = reports.infoDistribution(value).appBuildID;
    var versions = {};
    var buildids = {};
    Object.keys(builds).forEach(function(build) {
        if (uptimes && !uptimes[build]) {
            return;
        }
        var comps = build.split("-");
        var version = (comps.length === 1) ? "all" : comps[0];
        var buildid = (comps.length === 1) ? comps[0] : comps[1];
        versions[version] = versions[version] || {};
        versions[version][buildid] = builds[build];
        if (uptimes) {
            versions[version][buildid] = versions[version][buildid] / uptimes[build];
        }
        buildids[buildid] = true;
    });
    buildids = Object.keys(buildids).sort(smartSort);

    var ticks = [];
    var plotdata = Object.keys(versions).sort(revSmartSort).map(function(version) {
        var builds = versions[version];
        var ids = Object.keys(builds).sort(smartSort);

        function addTick(id) {
            var index = buildids.indexOf(id);
            if (ticks.some(function(tick) {
                    return Math.abs(tick[0] - index) < buildids.length / 5;})) {
                return;
            }
            ticks.push([index, id]);
        }
        addTick(ids[0]);
        addTick(ids[ids.length - 1]);

        return {
            label: version,
            data: ids.map(function(build) {
                return [buildids.indexOf(build), builds[build] || 0];
            }),
            points: {
                show: ids.length === 1,
            },
        };
    });

    function _tooltip(label, xval, yval, item) {
        var num = item.series.data[item.dataIndex][1];
        var tip = replaceBrackets(buildids[
                    item.series.data[item.dataIndex][0]]) + "<br>" +
                  replaceBrackets((!uptimes || num >= 10) ? smartPrefix(Math.round(num))
                                           : num.toPrecision(2)) +
                  " hang" + (num === 1 ? "" : "s");
        options.normalize && (tip += " / 1k user-hrs");
        return tip;
    }
    function _tooltipHover(item, tooltip) {
        var baroffset = plotobj.pointOffset({
            x: item.datapoint[0],
            y: item.datapoint[1],
        });
        var plotoffset = elem.offset();
        tooltip.removeClass("right bottom left").addClass("top")
        .html(
            "<div class='tooltip-inner'>" + tooltip.html() + "</div>" +
            "<div class='tooltip-arrow'></div>")
        .offset({
            left: plotoffset.left + baroffset.left - tooltip.width() / 2,
            top: plotoffset.top + baroffset.top - tooltip.height() - 20,
        });
    }

    var plotobj = $.plot(elem, plotdata, {
        series: {
            lines: {
                show: true,
                zero: true,
            },
        },
        grid: {
            show: true,
            hoverable: true,
        },
        xaxis: {
            show: true,
            ticks: ticks,
        },
        yaxis: {
            show: true,
            tickFormatter: smartPrefix,
        },
        tooltip: true,
        tooltipOpts: {
            content: _tooltip,
            onHover: _tooltipHover,
        },
    });
}

function replotActivities(elem, activities, value, options) {
    options = options || {};
    var times = [];
    for (var i = 2; i < 4294967296; i *= 2) {
        times.push(i - 1);
    }
    var minratio = 1;
    var endtimes = activities.reduce(function(prev, act) {
        var count = act.rawCount(null);
        var alltimes = Object.keys(count);
        if (options.normalize) {
            minratio = Math.min(minratio, 1 / alltimes.reduce(
                function(prev, t) { return prev + count[t]; }, 0));
        }
        return {
            min: Math.min(prev.min, Math.min.apply(Math, alltimes)),
            max: Math.max(prev.max, Math.max.apply(Math, alltimes)),
        };
    }, {min: times[times.length - 1], max: times[0]});
    var plotdata = activities.map(function(act) {
        if (!act.hasDimensionValue(value)) {
            return {};
        }
        var name = act.name();
        var count = act.rawCount(value);
        var ratio = !options.normalize ? 1 :
            1 / Object.keys(count).reduce(
                function(prev, t) { return prev + count[t]; }, 0);
        return {
            label: options.noname ? undefined : name.substring(name.indexOf(":") + 1),
            data: times.filter(function(t) {
                        return t >= endtimes.min && t <= endtimes.max; })
                       .map(function(t) { return [t, (count[t] || 0) * ratio]; }),
        };
    });
    minratio = 1 - Math.ceil(Math.log(minratio) / Math.LN10);

    function _xTransform(v) {
        return Math.log(v) / Math.LN2;
    }
    function _xInvTransform(v) {
        return Math.pow(2, v);
    }

    function _yTransform(v) {
        return Math.max(0, minratio + Math.log(v) / Math.LN10);
    }
    function _yInvTransform(v) {
        return Math.pow(10, v - minratio);
    }

    function _getTicks(logbase, label, startexp, maxticks) {
        return function(axis) {
            var end = Math.ceil(Math.log(axis.max) / logbase);
            var ret = [[0, label(0)]];
            var step = Math.ceil((end - startexp + 1) / maxticks);
            for (var i = startexp; i <= end; i += step) {
                var val = Math.exp(logbase * i);
                ret.push([val, label(val)]);
            }
            return ret;
        };
    }

    function _tooltip(label, xval, yval, item) {
        var labelFn = function(val) {
            return replaceBrackets(options.normalize ?
                smartPercent(val) : smartPrefix(val));
        };
        var at = labelFn(item.series.data[item.dataIndex][1]);
        var below = labelFn(item.series.data.slice(0, item.dataIndex).reduce(
                function(prev, d) { return prev + d[1]; }, 0));
        var above = labelFn(item.series.data.slice(item.dataIndex + 1).reduce(
                function(prev, d) { return prev + d[1]; }, 0));
        var prevtime = (item.dataIndex === 0 ? "" : replaceBrackets(
            smartTime(item.series.data[item.dataIndex - 1][0] / 1000)));
        var time = replaceBrackets(smartTime(
            item.series.data[item.dataIndex][0] / 1000));
        return (options.noname ? "" :
                replaceBrackets(item.series.label) + "<br>") +
            (item.dataIndex === 0 ? "&lt;" + time + ": " + at + "<br>"
                                  : prevtime + "-" + time + ": " + at + "<br>" +
                                    "&lt;" + prevtime + ": " + below + "<br>") +
            "&gt;" + time + ": " + above;
    }
    function _tooltipHover(item, tooltip) {
        var baroffset = plotobj.pointOffset({
            x: item.datapoint[0],
            y: item.datapoint[1],
        });
        var plotoffset = elem.offset();
        tooltip.removeClass("right bottom left").addClass("top")
        .html(
            "<div class='tooltip-inner'>" + tooltip.html() + "</div>" +
            "<div class='tooltip-arrow'></div>")
        .offset({
            left: plotoffset.left + baroffset.left - tooltip.width() / 2,
            top: plotoffset.top + baroffset.top - tooltip.height() - 20,
        });
    }

    var plotobj = $.plot(elem, plotdata, {
        series: {
            lines: {
                show: true,
            },
            points: {
                show: true,
            },
        },
        grid: {
            show: true,
            hoverable: true,
        },
        legend: {
            show: true,
            backgroundOpacity: 0.5,
        },
        xaxis: {
            show: true,
            transform: _xTransform,
            inverseTransform: _xInvTransform,
            ticks: _getTicks(Math.LN2,
                function(v) { return smartTime(v / 1000); }, 0, 25),
        },
        yaxis: {
            show: true,
            transform: _yTransform,
            inverseTransform: _yInvTransform,
            ticks: _getTicks(Math.LN10, options.normalize
                ? smartPercent : smartPrefix, 1 - minratio, 12),
            max: options.normalize ? 1 : undefined,
        },
        tooltip: true,
        tooltipOpts: {
            content: _tooltip,
            onHover: _tooltipHover,
        },
    });
}

$("#navbar-normalize").prop("checked", false);

$("#navbar-groupby").change(function() {
    var repcount = $("#navbar-count").text(0);
    var normbtn = $("#navbar-normalize").off("change");
    var infodim = $("#info-dim-value");
    var oldinfodim = infodim.val();
    infodim.empty().off("change");
    var activitydim = $("#activity-dim-value");
    var oldactivitydim;
    if (activitydim.length) {
        oldactivitydim = activitydim.val();
        activitydim.empty().off("change");
    }

    var val = $("#navbar-groupby").val();
    if (!val) {
        $.plot($("#report-plot"), [[0, 0]], {grid: {show: true}});
        $.plot($("#info-plot"), [[0, 0]], {grid: {show: false}});
        if ($("#activity-plot").length) {
            $.plot($("#activity-plot"), [[0, 0]], {grid: {show: true}});
        }
        return;
    }
    $("#info-dim-name").text(val);
    $("#report-modal-dim-name").text(val);
    $("#activity-dim-name").text(val);

    var reports = null;
    var sessions = null;
    var normalize = normbtn.prop("checked");
    var plottedVars = {};

    function replot() {
        var updateVars = {};
        if (!reports || (normalize && !sessions)) {
            $("#report-plot").prev("i.fa-spinner").fadeIn();
            $("#info-plot").prev("i.fa-spinner").fadeIn();
        } else if (reports !== plottedVars.reports ||
                   (normalize && sessions !== plottedVars.sessions) ||
                   normalize !== plottedVars.normalize) {
            replotReports($("#report-plot"), reports, sessions, {normalize: normalize});
            $("#report-plot").prev("i.fa-spinner").stop().fadeOut();
            infodim.trigger("change");
            updateVars.reports = updateVars.normalize = true;
            normalize && (updateVars.sessions = true);
        }
        if (activitydim.length) {
            if (!sessions) {
                $("#activity-plot").prev("i.fa-spinner").fadeIn();
            } else if (sessions !== plottedVars.sessions ||
                       normalize !== plottedVars.normalize) {
                activitydim.trigger("change");
                updateVars.sessions = true;
            }
        }
        updateVars.reports && (plottedVars.reports = reports);
        updateVars.sessions && (plottedVars.sessions = sessions);
        updateVars.normalize && (plottedVars.normalize = normalize);
    }

    telemetry.reports(val, function(r) {
        reports = r;
        repcount.text(smartPrefix(reports.cumulativeCount()));

        var values = reports.dimensionValues();
        values.sort(smartSort);
        values.unshift("any");
        values.forEach(function(value) {
            infodim.append($("<option/>").text(value))
        });
        if (values.indexOf(oldinfodim) >= 0) {
            infodim.val(oldinfodim);
        } else {
            infodim[0].selectedIndex = 0;
        }
        infodim.change(function() {
            replotInfo($("#info-plot"),
                       reports,
                       infodim[0].selectedIndex == 0 ? null : infodim.val(),
                       sessions,
                       {normalize: normalize});
            $("#info-plot").prev("i.fa-spinner").stop().fadeOut();
        });
        replot();
    });

    telemetry.sessions(val, function(s) {
        sessions = s;
        var activities = s.all(
            function(n) { return n.indexOf("activity:") === 0; });
        if (activities.length) {
            var values = s.dimensionValues();
            values.sort(smartSort);
            values.unshift("any");
            values.forEach(function(value) {
                activitydim.append($("<option/>").text(value))
            });
            if (values.indexOf(oldactivitydim) >= 0) {
                activitydim.val(oldactivitydim);
            } else {
                activitydim[0].selectedIndex = 0;
            }
            activitydim.change(function() {
                replotActivities($("#activity-plot"), activities,
                    activitydim[0].selectedIndex == 0 ? null : activitydim.val(),
                    {normalize: normalize});
                $("#activity-plot").prev("i.fa-spinner").stop().fadeOut();
            });
        }
        replot();
    });

    normbtn.change(function() {
        normalize = normbtn.prop("checked");
        if (!normalize) {
            $("#report-units").text("");
        } else {
            $("#report-units").text("(per 1k user-hours)");
        }
        replot();
    });

    replot();
}).trigger("change");

$("#navbar-from").change(function() {
    var toDate = Date.today().last().saturday();
    if (Date.today().isBefore(
            toDate.clone().next().day()
                .add(-toDate.getTimezoneOffset()).minutes()
                .add(8 /* PST */).hours())) {
        toDate.last().saturday();
    }
    toDate = toDate.add(-$("#navbar-from")[0].selectedIndex).weeks();

    var fromDate = toDate.clone().last().sunday();
    var uri = serverUri.replace("{from}", fromDate.toString("yyyyMMdd"))
                       .replace("{to}", toDate.toString("yyyyMMdd"));

    var groupby = $("#navbar-groupby");
    var oldgroupby = groupby.val();
    groupby.empty();

    telemetry = new HangTelemetry();
    telemetry.init(uri, function() {
        var dims = telemetry.dimensions();
        dims.sort(smartSort);
        dims.forEach(function(dim) {
            groupby.append($("<option/>").text(dim));
        });
        groupby.val(dims.indexOf(oldgroupby) >= 0
                    ? oldgroupby
                    : defaultDimension).trigger("change");
    });
}).trigger("change");

};

})(this);
