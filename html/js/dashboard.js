(function(exports){

"use strict";

/** Namespace for this module */
var Dashboard = {};

/** Initialize the dashboard, load state from window.location.hash, etc. */
Dashboard.init = function Dashboard_init() {

  // Update plot sizes on resize
  var resizeTimeout;
  $(window).resize(function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      // Resize plots
      var evolutionPlot = $("#evolution-plot").data("plot");
      if (evolutionPlot !== null) {
        evolutionPlot.resize();
        evolutionPlot.setupGrid();
        evolutionPlot.draw();
      }
      var histogramPlot = $("#histogram-plot").data("plot");
      if (histogramPlot !== null) {
        histogramPlot.resize();
        histogramPlot.setupGrid();
        histogramPlot.draw();
      }
    }, 100);
  });

  // Setup plot hover
  var previousPoint;
  $("#plot-area").bind("plothover", function(event, pos, item) {
    if (!item) {
      $("#tooltip").remove();
      previousPoint = null;
      return;
    }
    if (previousPoint == item.dataIndex) {
      return;
    }
    previousPoint = item.dataIndex;
    $("#tooltip").remove();
    $('<div id="tooltip">' + item.datapoint[1].toFixed(2) + '</div>')
      .css({
        top: item.pageY + 5,
        left: item.pageX + 5,
      })
      .appendTo("body").fadeIn(200);
  });

  // Create histogram filter
  $("#filters").histogramfilter({
    windowHashPrefix:           "path=",
    synchronizeStateWithHash:   true,
    defaultVersion:             function(versions) {
      var nightlies = versions.filter(function(version) {
        return version.substr(0,8) == "nightly/";
      });
      nightlies.sort();
      return nightlies.pop() || versions.sort().pop();
    }
  });

  // Plot histogram, whenever filtering changes
  $("#filters").bind("histogramfilterchange", function(event, data) {

    // Get HistogramEvolution instance
    var hgramEvo = data.histogram;

    // Don't plot anything if we're loading
    if (!hgramEvo) {
      $("#info").text("Loading...");
      return;
    }

    // Plot histogram evolution
    Dashboard.plotEvolution(hgramEvo);

    // Plot aggregated histogram for all dates
    Dashboard.plotHistogram(hgramEvo.range());

    // Update info text
    $("#info").text(
      hgramEvo.description() + " (submissions " +
      hgramEvo.range().submissions() + ")"
    );
  });
};

/** Plot instance of HistogramEvolution */
Dashboard.plotEvolution = function Dashboard_plotEvolution(hgramEvo) {
  // Plot series
  var series = [
    {
      label:  "submissions",
      data:   hgramEvo.map(function(date, hgram) {
        return [date.getTime(), hgram.submissions()];
      }),
      yaxis:  2
    },
    {
      label:  "mean",
      data:   hgramEvo.map(function(date, hgram) {
        return [date.getTime(), hgram.mean()];
      })
    },
    {
      label:  "median",
      data:   hgramEvo.map(function(date, hgram) {
        return [date.getTime(), hgram.median()];
      })
    }
  ];

  // Add percentiles
  [5, 25, 75, 95].forEach(function(percent) {
    series.push(
      {
        label:  percent + "th percentile",
        data:   hgramEvo.map(function(date, hgram) {
          return [date.getTime(), hgram.percentile(percent)];
        })
      }
    );
  })

  // Plot options
  var options = {
    grid: {
      hoverable: true
    },
    series: {
      lines:  { show: true },
      points: { show: true },
    },
    xaxes: [
      { mode: "time", timeformat: "%y%m%d" }
    ],
    yaxes: [
      {min: 0},
      {min: 0, position: "right"}
    ],
  };

  // Plot evolution
  $("#evolution-plot").plot(series, options);
};

/** Plot instance of Histogram */
Dashboard.plotHistogram = function Dashboard_plotHistogram(hgram) {
  // Plot series
  var series = [
    {
      bars: {show: true},
      data: hgram.map(function(count, start, end, index) {
        return [index, count];
      })
    }
  ];

  // Auxiliary function for converting value to a tick offset
  function value2tick(value) {
    var tick = 0;
    hgram.each(function(count, start, end, index) {
      // If this the bucket that contains the value
      if (start < value && value <= end) {
        // Value tick is index, plus ratio of value between start and end
        tick = index + (value - start) / (end - start);
      }
    });
    return tick;
  }

  // Find tick for percentiles
  var p05 = value2tick(hgram.percentile(5));
  var p25 = value2tick(hgram.percentile(25));
  var p50 = value2tick(hgram.percentile(50));
  var p75 = value2tick(hgram.percentile(75));
  var p95 = value2tick(hgram.percentile(95));

  // Plot options
  var options = {
    "xaxis": { 
      "ticks": hgram.map(function(count, start, end, index) {
        return [index, start];
      })
    },
    "grid": {
      "hoverable":  true,
      "markings": [
        {xaxis: {from: p05, to: p05}, color: "#000"},
        {xaxis: {from: p25, to: p25}, color: "#0f0"},
        {xaxis: {from: p50, to: p50}, color: "#00f"},
        {xaxis: {from: p75, to: p75}, color: "#f00"},
        {xaxis: {from: p95, to: p95}, color: "#f0f"}
      ]
    }
  };
    
  // Plot histogram
  $("#histogram-plot").plot(series, options);
};

exports.Dashboard = Dashboard;
return exports.Dashboard;

})(this);
