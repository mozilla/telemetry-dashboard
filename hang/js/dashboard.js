(function(exports) {

/**
 * Code for both the ANR and BHR dashboards.
 *
 * @param serverUri URI to the server data directory in the format
 *     https://example.com/foo/bar-{from}-{to}, where {from} and {to} are dates in the format
 *     YYYYmmdd. The exact dates depend on the what is stored on the server, but usually {from}
 *     is a Sunday and {to} is the following Saturday.
 */
exports.Dashboard = function (serverUri) {

/**
 * All hang reports are grouped by "dimensions". Each dimension has a name and a list of values.
 * For example, hang reports under the "arch" dimension with value "x86" will only contain hangs
 * that happened on x86 architecture.
 */
"use strict";

// HangTelemetry object from hang-telemetry.js
var telemetry = null;
// Default dimension name
var defaultDimension = "appName";

// Max number of stack frames to display in the chart tooltip
var maxStackFrames = 10;
// Max number of individual reports to show in the chart; other reports are grouped together.
var topReports = 10;
// List of colors to use for each report in the chart; contains (topReports+1) elements.
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

// Make each plot fill its container.
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
/**
 * Smart comparison function used with Array.prototype.sort. It is able to compare numbers
 * and suffixes by value rather than by character. For example, '1MB' will come before '1GB',
 * and 'v10' will come after 'v9'.
 */
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
// Same as smartSort but reversed
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

/**
 * Format a floating-point number by adding the appropriate SI-prefix and rounding to
 * appropriate digits. e.g. smartPrefix(0.001) === '1m'
 */
var smartPrefix = _smartUnits(
    [1e15, 1e12, 1e9, 1e6, 1e3, 1, 1e-3, 1e-6, 1e-9, 1e-12, 1e-15],
    ['E', 'T', 'G', 'M', 'k', '', 'm', 'μ', 'n', 'p', 'f', ''],
    [3]);

/**
 * Parse a string of a number with SI-prefix into its equivalent floating-point number.
 * e.g. revSmartPrefix('1m') === 0.001
 */
var revSmartPrefix = _revSmartUnits(
    [1e15, 1e12, 1e9, 1e6, 1e3, 1e-3, 1e-6, 1e-9, 1e-12, 1e-15, 1],
    ['E', 'T', 'G', 'M', 'k', 'm', 'μ', 'n', 'p', 'f', '']);

/**
 * Format a number of seconds into appropriate time units. e.g. smartTime(3600) === '1h'
 */
var smartTime = _smartUnits(
    [31556952, 604800, 86400, 3600, 60, 1, 1e-3, 1e-6, 1e-9, 1e-12],
    ['y', 'w', 'd', 'h', 'm', 's', 'ms', 'μs', 'ns', 'ps', ''],
    [2, 2, 2, 2, 2, 2, 3]);

/**
 * Format a fraction number into a percentage. e.g. smartPercent(0.1) === '10.0%'
 */
function smartPercent(v) {
    return (v * 100).toPrecision(3) + "%";
}

/**
 * Replace '<' and '>' with their HTML entities.
 */
function escapeHTML(str) {
    return str && str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Parse a stack frame with metadata into an HTML or plain string for output.
 *
 * Supported metadata are,
 *
 *  (mxr:{repo}:{rev})  Generate a link that will use MXR to search for the stack frame string
 *                      under the {repo} repository and {rev} revision. Pseudostack label and
 *                      file name searches are supported.
 *
 *  (hg:{repo}:{file}:{rev}:{line})  Generate a link that will open file {file} at line {line}
 *                                   in MXR under the {repo} repository and {rev} revision.
 */
function transformFrame(frame, plain) {
    var mxr;
    frame = frame.replace(/\(mxr:([\w-]+):([\da-fA-F]+)\)/,
        function(match, repo, rev) {
            mxr = [repo, rev];
            return "";
        }).trim();

    if (!plain && mxr) {
        var search = true, string = frame, regexp, line;
        var parts = frame.match(/(.+):(\d+)/);
        if (parts && parts.length >= 3) {
            search = false;
            string = parts[1];
            regexp = false;
            line = parts[2];
        }

        parts = frame.match(/(.+)::(.+)/);
        if (parts && parts.length >= 3) {
            search = true;
            string = 'PROFILER_LABEL.*"' + parts[1] + '".*"' + parts[2] + '"';
            regexp = true;
            if (string.length > 28) {
                string = 'LABEL.*"' + parts[1] + '".*"' + parts[2] + '"';
            }
            if (string.length > 28) {
                string = '"' + parts[1] + '".*"' + parts[2] + '"';
            }
            if (string.length > 28) {
                string = '"' + (parts[1].length > parts[2].length ?
                                parts[1] : parts[2]) + '"';
                regexp = false;
            }
            line = null;
        }

        return '<a href="' +
               'https://mxr.mozilla.org/' + encodeURIComponent(mxr[0]) +
               '/' + (search ? 'search' : 'find') +
               '?rev=' + encodeURIComponent(mxr[1]) +
               '&string=' + encodeURIComponent(string) +
               (regexp ? '&regexp=1&case=on' : '') +
               (line ? '&line=' + encodeURIComponent(line) : '') +
               '" target="_blank">' + escapeHTML(frame) + '</a>';
    }

    var hg;
    frame = frame.replace(/\(hg:.+\/([\w-]+):(.+):([\da-fA-F]+):(\d+)\)/,
        function(match, repo, file, rev, line) {
            hg = [repo, file, rev, line];
            return "";
        }).trim();

    if (!plain && hg) {
        if (hg[1].indexOf('obj-') === 0) {
            return escapeHTML(frame);
        }
        return '<a href="' +
               'https://mxr.mozilla.org/' + encodeURIComponent(hg[0]) +
               '/source/' + hg[1] +
               '?rev=' + encodeURIComponent(hg[2]) +
               '#' + encodeURIComponent(hg[3]) +
               '" target="_blank">' + escapeHTML(frame) + '</a>';
    }
    return escapeHTML(frame);
}

/**
 * Populate the reports dialog with info given in arguments and show the dialog.
 *
 * @param modal Modal DOM element
 * @param report Report object to populate the dialog with
 * @param dimValue Limit information shown in the dialog by this dimension value.
 * @param sessions Sessions data for normalizing report data
 * @param options Options to be passed to replotInfo() and replotActivities()
 */
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
    // Remove all previous stacks except the template.
    stacks.children().not(template).not(".spinner-holder").remove();

    /**
     * Add thread stacks to the dialog. The following metadata in the thread name are supported,
     *
     * (dim:{name}:{val})  If dimValue is not null, only generate the stack if {name} matches
     *                     the current dimension name and {val} matches dimValue. If dimValue
     *                     is null, indicate {name} and {val} in the thread name.
     *
     * @param threads Array of Thread objects to obtain the stack
     * @param append Append to the stacks list if true, or otherwise prepend to the list.
     */
    function addThreads(threads, append) {
        var out = $();
        threads.forEach(function(thread) {
            var dim;
            var name = thread.name().replace(/\(dim:(.+):(.+)\)/,
                function(match, dimname, dimval) {
                    dim = [dimname, dimval];
                    return dimValue ? "" : ("(" + dimval + " " + dimname + ")");
                });
            if (dim && (dim[0] !== $("#navbar-groupby").val() ||
                        (dimValue && dimValue !== dim[1]))) {
                return;
            }

            // Create a copy of the template to fill out.
            var clone = template.clone()
                .removeAttr("id").removeClass("hide");
            var body = clone.find(".panel-body");
            var stack = thread.stack();
            // Mute native frames if we also have non-native frames.
            var muteNative = stack.some(function(frame) {
                return !frame.isNative();
            });
            // Fill out each stack frame.
            stack.forEach(function(frame) {
                var line = frame.lineNumber();
                var func = frame.functionName();
                var lib = frame.libName();
                var text = func + (lib ? " (" + lib + ")" : "")
                                + (line ? " (line " + line + ")" : "");
                $("<li/>").html(transformFrame(text))
                          .addClass(muteNative && frame.isNative() ? "text-muted" : "")
                          .appendTo(body);
            });

            // Generate a unique ID so that the panel can be collapsed on clicking.
            var id = "report-stacks-" + stacks.children().length;
            clone.find(".panel-collapse")
                 .attr("id", id)
                 .addClass(append ? "" : "in");
            clone.find(".panel-heading")
                 .text(name + " stack")
                 .attr("data-target", "#" + id);
            out.add(append ? clone.appendTo(stacks)
                           : clone.prependTo(stacks));
        });
        return out;
    }

    var hideSpinner = 2;
    // Generate the main thread stack by prepending.
    report.mainThread(function(threads) {
        addThreads(threads, /* append */ false);
        if (!(--hideSpinner)) {
            modal.find(".spinner-holder i").stop().fadeOut();
        }
    });

    // Generate the background thread stacks by appending.
    report.backgroundThreads(function(threads) {
        threads.sort(function(a,b) {
            return smartSort(a.name(), b.name());
        });
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
            // Only plot hang times that match the current report / dimension value.
            var hangtime = sessions.byName("hangtime").filter(
                function(name, dimval, info, val) {
                    return (!dimValue || dimval === dimValue) &&
                           val === report.name();
                }
            );
            replotActivities(activityPlot, [hangtime], dimValue,
                             $.extend({noname: true, }, options));
            activityPlot.prev("i.fa-spinner").stop().fadeOut();
            activityPlotted = true;
        }
    }

    // Perform plotting only when a panel is expanded.
    $("#report-plots-info").on("shown.bs.collapse", _plot);
    $("#report-plots-build").on("shown.bs.collapse", _plot);
    $("#report-plots-activity").on("shown.bs.collapse", _plot);

    modal.on("shown.bs.modal", _plot)
        .on("hidden.bs.modal", function(event) {
            // Reset the plots when the dialog is hidden.
            $.plot(infoPlot, [[0, 0]], {grid: {show: false}});
            $.plot(buildPlot, [[0, 0]], {grid: {show: true}});
            $.plot(activityPlot, [[0, 0]], {grid: {show: true}});
        });
}

/**
 * Generate the top hangs chart and the list of all hangs.
 *
 * @param elem Chart DOM element
 * @param reports Reports object containing reports to plot
 * @param sessions Sessions data for normalizing report data
 * @param options Options object. Supported properties are,
 *                normalize  Use sessions data to normalize hang count according to uptime
 */
function replotReports(elem, reports, sessions, options) {
    var values = reports.dimensionValues();
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        // Generate a hash mapping dimension values to uptimes corresponding to each dimension
        // value. e.g. uptimes["Firefox"] == 100 (k user-hours).
        var uptimeSession = sessions.byName('uptime');
        uptimes = {};
        values.forEach(function(value) {
            // Calculate number of 1000 hours from minutes
            uptimes[value] = uptimeSession.count(value) / 60000;
        });
        // To reduce noise, we only keep uptimes that are more than 100 user-hours.
        values = values.filter(function(value) {
            return (uptimes[value] || 0) >= 0.1;
        });
    }
    // Plot dimension values in smart sorting order.
    values.sort(smartSort);

    var reports = reports.all();
    // Return the sum of hang counts across all dimension values, with each count normalized
    // to uptime for that dimension value.
    function sumNormalizedCount(report) {
        return values.reduce(function(prev, value) {
            return prev + report.count(value) / uptimes[value];
        }, 0);
    }
    reports.sort(function(r1, r2) {
        if (!uptimes) {
            return r1.count() - r2.count();
        }
        return sumNormalizedCount(r1) - sumNormalizedCount(r2);
    });
    // Separate out reports outside of "top reports" to be grouped together.
    var otherReports = reports.slice(0, -topReports);

    // First generate the "other" block in the chart.
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
        // Generate a block in the chart for each top report.
        data.push({
            data: values.map(function(value, index) {
                return [index, report.count(value) /
                               (uptimes ? uptimes[value] : 1)];
            }),
            report: report,
        });
    });

    // Format hang count depending on if we're normalizing or not.
    function formatCount(num) {
      return (!uptimes || num >= 10) ? smartPrefix(Math.round(num))
                                     : num.toPrecision(2);
    }

    // Format a stack frame to be displayed in the tooltip.
    function formatFrame(frame, skipNative, plain) {
      if ((skipNative && frame.isNative()) ||
          (!skipNative && !isNaN(parseInt(frame.functionName())))) {
          return null;
      }
      var line = frame.lineNumber();
      return transformFrame(frame.functionName() +
          (line ? " (line " + line + ")" : ""), plain);
    }

    // Generate the hangs list.
    var reportslist = $("#reports-list");
    reportslist.empty();
    reports.forEach(function (report, index) {
      var rank = reports.length - index;

      var topframe = $("<td/>");
      var dimvalues = $("<td/>").append(
        $("<a/>").text("All (" +
            formatCount(!uptimes ? report.count()
                                 : sumNormalizedCount(report)) + ")")
          .click(function() {
            showModal(report, null, rank);
          }));

      // A row consists of the rank number, the list of dimension values, and the top frame.
      $("<tr/>").append([
        $("<td/>").text(rank),
        dimvalues,
        topframe,
      ]).prependTo(reportslist);

      // For the dimension values column, we added "All" above; now add individual values.
      var reportvals = values.filter(function(value) {
        return report.hasDimensionValue(value) && report.count(value);
      });
      reportvals.sort(function(v1, v2) {
        return (report.count(v2) / (!uptimes ? 1 : uptimes[v2])) -
               (report.count(v1) / (!uptimes ? 1 : uptimes[v1]));
      });
      reportvals.forEach(function(value, index) {
        dimvalues.append(", ");
        $("<a/>")
          .text(value + " (" +
                formatCount(report.count(value) /
                            (!uptimes ? 1 : uptimes[value])) + ")")
          .click(function() {
            showModal(report, value, rank);
          })
          .appendTo(dimvalues);
      });

      // Fill the top frame.
      report.mainThread(function(threads) {
        var stackobj = threads[0].stack();
        var skipNative = stackobj.some(
          function(frame) { return !frame.isNative(); });
        stackobj.some(function(frame, index) {
          var formatted = formatFrame(frame, skipNative);
          if (formatted) {
            topframe.html(formatted);
          }
          return !!formatted;
        });
      });
    });

    // Generate the tooltip for hovering over a block in the chart
    function _tooltip(label, xval, yval, item) {
        var out = null;
        var num = item.series.data[item.dataIndex][1];
        var tip = values[item.dataIndex] + " : " +
                  formatCount(num) +
                  " hang" + (num === 1 ? "" : "s");
        options.normalize && (tip += " / 1k user-hrs");
        var report = item.series.report;
        tip = escapeHTML(tip);
        if (!report) {
            return tip;
        }

        // Generate the stack in the tooltip.
        report.mainThread(function(threads) {
            var stack = "<hr>";
            var count = 0;
            var stackobj = threads[0].stack();
            var skipNative = stackobj.some(
                function(frame) { return !frame.isNative(); });
            stackobj.every(function(frame, index) {
                var formatted = formatFrame(frame, skipNative, "plain");
                if (!formatted) {
                    return true;
                }
                stack += (count ? "<br>" : "") + formatted;
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

    // Style and position the tooltip correctly.
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

    // Generate the actual plot.
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

    function showModal(report, dimValue, rank) {
        var modal = $("#report-modal");
        $("#report-modal-rank").text(rank);
        $("#report-modal-count").text(reports.length);
        $("#report-modal-dim").text(dimValue || "All");
        $("#report-modal-id").text(report.name());
        fillReportModal(modal, report, dimValue, sessions, options);
        modal.modal("show");
    }

    elem.off("plotclick").on("plotclick", function(event, pos, item) {
        // Show the report dialog when a block is clicked on.
        if (!item || !item.series.report) {
            // Don't show a dialog for the other reports block.
            return;
        }
        var report = item.series.report;
        var dimValue = values[item.dataIndex];
        var rank = topReports - item.seriesIndex + 1;
        showModal(report, dimValue, rank);
    });
}

/**
 * Generate the info distribution plot, which is shown on the main page and in the
 * report dialog.
 *
 * @param elem Plot DOM element
 * @param reports Reports object containing reports to plot
 * @param value Dimension value to limit the info distribution to
 * @param sessions Sessions data for normalizing report data
 * @param options Options object. Supported properties are,
 *                normalize  Use sessions data to normalize hang count according to uptime
 */
function replotInfo(elem, reports, value, sessions, options) {
    var agg = reports.infoDistribution(value);
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        uptimes = sessions.byName('uptime').infoDistribution(value);
        Object.keys(uptimes).forEach(function(info) {
            var uptime = uptimes[info];
            // Calculate the total uptime.
            uptime[''] = Object.keys(uptime).reduce(
                function(prev, val) {
                    var v = uptime[val];
                    if (v < 6000) {
                        // Discard uptimes less than 100 user-hours to reduce noise.
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
        // For each info type, generate a line in the plot.
        // histogram is a hash mapping the info value to hang count.
        var histogram = agg[info];
        var valuesarray = Object.keys(histogram);
        seriescount = Math.max(seriescount, valuesarray.length);
        valuesarray = valuesarray.map(function(value) {
            // For each info value, return the value and noramlized hang count.
            return [value, histogram[value] / (!uptimes ? 1 :
                           (uptimes[info][value] || uptimes[info]['']))];
        });
        valuesarray.sort(function(val1, val2) {
            return val2[1] - val1[1];
        });
        // Calculate (total hang count / 100) so we can ge the percentag for each hang count.
        var total = valuesarray.reduce(function(prev, value) {
            return prev + value[1];
        }, 0) / 100;
        return valuesarray.map(function(value) {
            return {info: value[0], data: [value[1] / total, index]};
        });
    });

    var plotdata = [];
    // Assign each hang count to a "bin". We have 100 bins, each with a different color.
    // This way, we can differentiate hang counts by color.
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

    // Generate the color for each "bin".
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
        // Overflow "bins" for when we have more than 100 hang counts,
        // so that we can still assign each hang count to a unique "bin".
        colors.push(Color({h: 200, s: 44, l: 55}).hexString());
    }

    function _tooltip(label, xval, yval, item) {
        return escapeHTML(item.series.info[item.dataIndex] + " : " +
               Math.round(item.series.data[item.dataIndex][0]) + "%");
    }

    // Style and position the tooltip correctly.
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

/**
 * Generate the build IDs plot, which is shown in the report dialog.
 *
 * @param elem Plot DOM element
 * @param reports Reports object containing reports to plot
 * @param value Dimension value to limit the info distribution to
 * @param sessions Sessions data for normalizing report data
 * @param options Options object. Supported properties are,
 *                normalize  Use sessions data to normalize hang count according to uptime
 */
function replotBuild(elem, reports, value, sessions, options) {
    options = options || {};

    var uptimes = null;
    if (options.normalize) {
        uptimes = sessions.byName('uptime').infoDistribution(value).appBuildID;
        Object.keys(uptimes).forEach(function(val) {
            if (uptimes[val] < 6000) {
                // Discard uptimes less than 100 user-hours to reduce noise.
                delete uptimes[val];
            } else {
                // Calculate uptime in 1k user-hour units.
                uptimes[val] = uptimes[val] / 60000;
            }
        });
    }

    var builds = $.extend(true, {},
        reports.infoDistribution(value).appBuildID);
    var versions = {};
    var buildids = {};
    Object.keys(builds).forEach(function(build) {
        if (uptimes && !uptimes[build]) {
            // Don't show the build if we're normalizing and the uptime total is not high enough.
            delete builds[build];
            return;
        }
        // Each build ID string has the format {version}-{buildId}.
        var comps = build.split("-");
        var version = (comps.length === 1) ? "all" : comps[0];
        var buildid = (comps.length === 1) ? comps[0] : comps[1];
        versions[version] = versions[version] || {};
        if (uptimes) {
            builds[build] = builds[build] / uptimes[build];
        }
        versions[version][buildid] = builds[build];
        buildids[buildid] = true;
    });
    buildids = Object.keys(buildids).sort(smartSort);

    var ticks = [];
    var plotdata = Object.keys(versions).sort(revSmartSort).map(function(version) {
        var builds = versions[version];
        var ids = Object.keys(builds).sort(smartSort);

        // Generate ticks for the x-axis, making sure to not place too many ticks.
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

    // Limit the plot range to a certain max value so that an unusually high hang count
    // doesn't push the smaller values off the chart.
    var buildsKeys = Object.keys(builds);
    var upperCount = Math.min(10, Math.ceil(0.1 * buildsKeys.length));
    var upperBound = Math.min.apply(Math, buildsKeys.reduce(function(bucket, build) {
        var minIndex = bucket.indexOf(Math.min.apply(Math, bucket));
        if (minIndex >= 0 && builds[build] > bucket[minIndex]) {
            bucket[minIndex] = builds[build];
            return bucket;
        }
        if (bucket.length < upperCount) {
            bucket.push(builds[build])
        }
        return bucket;
    }, [])) / (1 - upperCount / buildsKeys.length);

    buildsKeys.sort(function(a, b) {
        return builds[a] - builds[b];
    });
    upperBound = Math.max(upperBound,
        2 * builds[buildsKeys[Math.floor(buildsKeys.length / 2)]]);

    function _tooltip(label, xval, yval, item) {
        var num = item.series.data[item.dataIndex][1];
        var tip = escapeHTML(buildids[
                    item.series.data[item.dataIndex][0]]) + "<br>" +
                  escapeHTML((!uptimes || num >= 10) ? smartPrefix(Math.round(num))
                                           : num.toPrecision(2)) +
                  " hang" + (num === 1 ? "" : "s");
        options.normalize && (tip += " / 1k user-hrs");
        return tip;
    }

    // Style and position the tooltip correctly.
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
            min: 0,
            max: upperBound,
            tickFormatter: smartPrefix,
        },
        legend: {
            show: true,
            position: "nw",
        },
        tooltip: true,
        tooltipOpts: {
            content: _tooltip,
            onHover: _tooltipHover,
        },
    });
}

/**
 * Generate the hang times plot, which is shown on the main page and in the report dialog.
 *
 * @param elem Plot DOM element
 * @param activities Array of time histograms
 * @param value Dimension value to limit the info distribution to
 * @param options Options object. Supported properties are,
 *                normalize  If true, plot percentages instead of raw numbers.
 */
function replotActivities(elem, activities, value, options) {
    options = options || {};
    var times = [];
    for (var i = 2; i < 4294967296; i *= 2) {
        times.push(i - 1);
    }

    var minratio = 1;
    // Calculate the range covered by the time histograms.
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

    // Plot times on x-axis with log2 scale.
    function _xTransform(v) {
        return Math.log(v) / Math.LN2;
    }
    function _xInvTransform(v) {
        return Math.pow(2, v);
    }

    // Plot numbers/percentages on y-axis with log10 scale.
    function _yTransform(v) {
        return Math.max(0, minratio + Math.log(v) / Math.LN10);
    }
    function _yInvTransform(v) {
        return Math.pow(10, v - minratio);
    }

    // Generate appropriate ticks for the axes.
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

    // Generate content for the tooltip.
    function _tooltip(label, xval, yval, item) {
        var labelFn = function(val) {
            return escapeHTML(options.normalize ?
                smartPercent(val) : smartPrefix(val));
        };
        var at = labelFn(item.series.data[item.dataIndex][1]);
        var below = labelFn(item.series.data.slice(0, item.dataIndex).reduce(
                function(prev, d) { return prev + d[1]; }, 0));
        var above = labelFn(item.series.data.slice(item.dataIndex + 1).reduce(
                function(prev, d) { return prev + d[1]; }, 0));
        var prevtime = (item.dataIndex === 0 ? "" : escapeHTML(
            smartTime(item.series.data[item.dataIndex - 1][0] / 1000)));
        var time = escapeHTML(smartTime(
            item.series.data[item.dataIndex][0] / 1000));
        return (options.noname ? "" :
                escapeHTML(item.series.label) + "<br>") +
            (item.dataIndex === 0 ? "&lt;" + time + ": " + at + "<br>"
                                  : prevtime + "-" + time + ": " + at + "<br>" +
                                    "&lt;" + prevtime + ": " + below + "<br>") +
            "&gt;" + time + ": " + above;
    }

    // Style and position the tooltip correctly.
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

$("#navbar-groupby").change(function() {
    // When the current dimension name changes, regenerate everything.
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
    $("#reports-dim-name").text(val);

    var reports = null;
    var sessions = null;
    var normalize = normbtn.prop("checked");
    var plottedVars = {};

    // Replot on-demand as data come in; keep track of what we have and have not plotted.
    function replot() {
        var updateVars = {};
        if (!reports || !sessions) {
            $("#report-plot").prev("i.fa-spinner").fadeIn();
        } else if (reports !== plottedVars.reports ||
                   sessions !== plottedVars.sessions ||
                   normalize !== plottedVars.normalize) {
            replotReports($("#report-plot"), reports, sessions, {normalize: normalize});
            $("#report-plot").prev("i.fa-spinner").stop().fadeOut();
            updateVars.reports = updateVars.normalize = updateVars.sessions = true;
        }
        if (!reports || (normalize && !sessions)) {
            $("#info-plot").prev("i.fa-spinner").fadeIn();
        } else if (reports !== plottedVars.reports ||
                   (normalize && sessions !== plottedVars.sessions) ||
                   normalize !== plottedVars.normalize) {
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
        var units = normalize ? "(per 1k user-hours)" : "";
        $("#report-units").text(units);
        $("#reports-units").text(units);
        replot();
    });

    replot();
}).trigger("change");

$("#navbar-from").change(function() {
    // Refetch all data and regenerate everything if the user selects a different date range.
    // Date ranges go from a Sunday to the next Saturday.
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
        // Set the dimension name and kick off regenerating data.
        groupby.val(dims.indexOf(oldgroupby) >= 0
                    ? oldgroupby
                    : defaultDimension).trigger("change");
    });
}).trigger("change");

};

})(this);
