(function(exports){

"use strict";

/** Namespace for this module */
var Dashboard = {};

/** Histogram currently displayed */
var _hgramEvo = null;

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

  $("#show-percentiles").change(function() {
    Dashboard.plotEvolution();
    Dashboard.plotHistogram();
    if ($("#show-percentiles").prop('checked')) {
      $("#percentile-legend").css("opacity", "1");
    } else {
      $("#percentile-legend").css("opacity", "0");
    }
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

    _hgramEvo = hgramEvo;

    // Plot histogram evolution
    Dashboard.plotEvolution();

    // Plot aggregated histogram for all dates
    Dashboard.plotHistogram();

    // Update info text
    $("#info").text(
      hgramEvo.description() + " (submissions " +
      hgramEvo.range().submissions() + ")"
    );
  });
};

/** Plot instance of HistogramEvolution */
Dashboard.plotEvolution = function Dashboard_plotEvolution() {
  if(!_hgramEvo) {
    return;
  }

  // Plot series
  var series = [
    {
      label:  "submissions",
      data:   _hgramEvo.map(function(date, hgram) {
        return [date.getTime(), hgram.submissions()];
      }),
      yaxis:  2
    },
    {
      label:  "mean",
      data:   _hgramEvo.map(function(date, hgram) {
        return [date.getTime(), hgram.mean()];
      })
    }
  ];


  if ($("#show-percentiles").prop('checked')) {
    // Add percentiles
    var percentileColor = ["#000", "#0f0", "#00f", "#f00", "#f0f"];
    [5, 25, 50, 75, 95].forEach(function(percent, index) {
      series.push(
        {
          label:  percent + "th percentile",
          color:  percentileColor[index],
          data:   _hgramEvo.map(function(date, hgram) {
            return [date.getTime(), hgram.percentile(percent)];
          })
        }
      );
    });
  }

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
      { mode: "time", timeformat: "%Y%m%d" }
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
Dashboard.plotHistogram = function Dashboard_plotHistogram() {
  if (!_hgramEvo) {
    return;
  }
  var hgram = _hgramEvo.range();

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

  var markings = [];
  if ($("#show-percentiles").prop('checked')) {
    // Add percentiles
    var percentileColor = ["#000", "#0f0", "#00f", "#f00", "#f0f"];
    [5, 25, 50, 75, 95].forEach(function(percent, index) {
      var tick = value2tick(hgram.percentile(percent));
      markings.push({
        xaxis: {from: tick, to: tick},
        color: percentileColor[index]
      });
    });
  }

  // Plot options
  var options = {
    "xaxis": { 
      "ticks": hgram.map(function(count, start, end, index) {
        return [index, start];
      })
    },
    "grid": {
      "hoverable":  true,
      "markings": markings
    }
  };
    
  // Plot histogram
  $("#histogram-plot").plot(series, options);
};

exports.Dashboard = Dashboard;
return exports.Dashboard;

})(this);
