$(function() {

"use strict";

var serverUri = "https://s3-us-west-2.amazonaws.com" +
                "/telemetry-public-analysis/bhr/data/bhr-{from}-{to}");

var toDate = Date.today().last().saturday();
if (Date.today().isBefore(
        toDate.clone().next().day()
            .add(-toDate.getTimezoneOffset()).minutes()
            .add(8 /* PST */).hours())) {
    toDate.last().saturday();
}

var fromDate = toDate.clone().last().sunday();
var uri = serverUri.replace("{from}", fromDate.toString("yyyyMMdd"))
                   .replace("{to}", toDate.toString("yyyyMMdd"));

var re_grouping = /\D+|\d+/g;
function smartSort(str1, str2) {
    var match1 = (str1 + '').match(re_grouping);
    var match2 = (str2 + '').match(re_grouping);
    for (var i = 0; i < match1.length && i < match2.length; i++) {
        var diff = match1[i] - match2[i];
        if (!isNaN(diff)) {
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

d3.text(uri, "text/plain", function(error, raw) {
    if (!raw) {
        return;
    }
    var dimensions = {};
    var rows = d3.tsv.parseRows(raw, function(row) {
        if (row[0] === "all") {
            return null;
        }
        var dim = JSON.parse(row[0]);
        var data = JSON.parse(row[1]);
        dimensions[dim[0]] = dimensions[dim[0]] || {};
        dimensions[dim[0]][dim[1]] = true;
        return {
            dimension: dim[0],
            value: dim[1],
            count: data[0],
            average: data[1],
            low: data[2],
            high: data[3],
        };
    }).filter(function(row)
        row.count >= 10000
    );

    var plots = d3.select("#plots")
        .selectAll("div")
        .data(Object.keys(dimensions)
                    .sort(smartSort)
                    .map(function(d) {
                        return rows.filter(function(row) {
                            return row.dimension === d; }); }));

    var panel = plots.enter()
        .append("div")
        .classed("panel panel-default", true);
    panel.append("div")
         .classed("panel-heading", true)
         .text(function(d) { return d[0].dimension; });

    var row = panel.append("div")
         .classed("panel-body row", true)

    var countCharts = row.append("div")
        .classed("col-md-6", true)
        .datum(function(d) {
            var dim = d[0].dimension;
            return {
                dimension: dim,
                data: d.sort(function(a, b)
                        smartSort(a.value, b.value))
                    .map(function(row, i) { return {
                        x: i,
                        y: row.count,
                        label: row.value,
                    }; }),
            };
        })
        .each(function(d) {
            var palette = new Rickshaw.Color.Palette();
            var graph = new Rickshaw.Graph({
                element: this,
                renderer: "bar",
                series: [{
                    data: d.data,
                    color: palette.color(),
                }],
            });
            var yAxis = new Rickshaw.Graph.Axis.Y({
                graph: graph,
            });
            graph.render();
            var hoverDetail = new Rickshaw.Graph.HoverDetail( {
                graph: graph,
                xFormatter: function(x) {
                    return d.data[Math.floor(x)].label;
                },
                formatter: function(series, x, y) {
                    return d.data[Math.floor(x)].label + ": " + y;
                },
            } );
        });

    var uptimeCharts = row.append("div")
        .classed("col-md-6", true)
        .datum(function(d) {
            return {
                average: d.map(function(row, i) { return {
                        x: i,
                        y: row.average,
                        label: row.value,
                    }; }),
                low: d.map(function(row, i) { return {
                        x: i,
                        y: row.low,
                        label: row.value,
                    }; }),
                high: d.map(function(row, i) { return {
                        x: i,
                        y: row.high,
                        label: row.value,
                    }; }),
            };
        })
        .each(function(d) {
            var palette = new Rickshaw.Color.Palette();
            var graph = new Rickshaw.Graph({
                element: this,
                renderer: "line",
                series: [{
                    data: d.average,
                    color: palette.color(),
                }, /*{
                    data: d.low,
                    color: palette.color(),
                }, {
                    data: d.high,
                    color: palette.color(),
                }*/],
            });
            var yAxis = new Rickshaw.Graph.Axis.Y({
                graph: graph,
            });
            graph.render();
            var hoverDetail = new Rickshaw.Graph.HoverDetail( {
                graph: graph,
                xFormatter: function(x) {
                    return d.average[Math.floor(x)].label;
                },
                formatter: function(series, x, y) {
                    return d.average[Math.floor(x)].label + ": " + y;
                },
            } );
        });
});

});
