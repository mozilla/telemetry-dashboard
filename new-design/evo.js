var gFilterMapping = null;
var gVersions = null;
var gMeasureMap = null;
var gInitialPageState = null;

Telemetry.init(function() {
  gVersions = Telemetry.versions();
  gFilterMapping = {
    "product":   $("#filter-product"),
    "arch":      $("#filter-arch"),
    "os":        $("#filter-os"),
    "os_version": $("#filter-os-version"),
  };

  loadStateFromUrlAndCookie();
  
  // Set up the build selectors
  $("#min-channel-version, #max-channel-version, #line-channel-version").empty().append(gVersions.map(function(option) {
    return '<option value="' + option + '">' + option.replace("/", " ") + '</option>';
  }).join()).trigger("change");
  
  
  $("#aggregates").change(function() {
    calculateHistogramEvolutions();
  });
  $("#measure").change(function() {
    var measureEntry = gMeasureMap[$(this).val()];
    var options;
    if (measureEntry.kind == "linear" || measureEntry.kind == "exponential") {
      options = [["median", "Median"], ["mean", "Mean"], ["5th-percentile", "5th Percentile"], ["25th-percentile", "25th Percentile"], ["75th-percentile", "75th Percentile"], ["95th-percentile", "95th Percentile"]]
    } else {
      options = [["submissions", "Submissions"]];
    }
    
    var selected = $("#aggregates").val() || gInitialPageState.aggregates;
    $("#aggregates").empty().append(options.map(function(pair) {
      return '<option value="' + pair[0] + '">' + pair[1] + '</option>';
    }).join());
    var aggregates = {}; options.forEach(function(option) { aggregates[option[0]] = true; });
    selected = selected.filter(function(aggregate) { return aggregate in aggregates; })
    console.log(selected, options, aggregates);
    if (selected.length == 0) {
      selected = [options[0][0]];
    }
    $("#aggregates").multiselect("rebuild").multiselect("select", selected).trigger("change");
  });
  
  $("#min-channel-version, #max-channel-version").change(function() {
    var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
    var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
    gMeasureMap = {}, versionCount = 0;
    versions.forEach(function(channelVersion) {
      Telemetry.measures(channelVersion, function(measures) {
        versionCount ++;
        Object.keys(measures).forEach(function(measure) { gMeasureMap[measure] = measures[measure]; });
        if (versionCount == versions.length) {
          var measureList = Object.keys(gMeasureMap).sort();
          var selected = $("#measure").val() || gInitialPageState.measure;
          $("#measure").empty().append(measureList.map(function(measure) {
            return '<option value="' + measure + '">' + measure + '</option>';
          }).join());
          if (selected) { $("#measure").val(selected); }
          $("#measure").trigger("change");
        }
      });
    })
  })
  $("#min-channel-version").trigger("change");
  
  $("#filter-product").change(calculateHistogramEvolutions);
  $("#filter-arch").change(calculateHistogramEvolutions);
  $("#filter-os").change(function() {
    osVersions = ["10.0", "8.1", "8"]
    var versionSelector = $("#filter-os-version");
    versionSelector.empty().append(osVersions.map(function(option) {
      return '<option value="' + option + '">' + option + '</option>';
    }).join()).multiselect("rebuild");
    versionSelector.multiselect("select", versionSelector.find("option").map(function(i, option) { return $(option).val(); })
      .filter(function(i, option) { return option != "multiselect-all"; }).toArray())
    versionSelector.trigger("change");
    calculateHistogramEvolutions();
  });
  $("#filter-os-version").change(calculateHistogramEvolutions);
});

var gAggregateValue = {
  "mean":            function(histogram) { return histogram.mean(); },
  "5th-percentile":  function(histogram) { return histogram.percentile(5); },
  "25th-percentile": function(histogram) { return histogram.percentile(25); },
  "median":          function(histogram) { return histogram.median(); },
  "75th-percentile": function(histogram) { return histogram.percentile(75); },
  "95th-percentile": function(histogram) { return histogram.percentile(95); },
  "submissions":     function(histogram) { return histogram.submissions(); },
};
function calculateHistogramEvolutions() {
  saveStateToUrlAndCookie();

  var aggregates = ($("#aggregates").val() || []).filter(function(v) { return v != "multiselect-all" });
  var measure = $("#measure").val();
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var filters = {};
  for (var filterName in gFilterMapping) {
    var filterSelector = $(gFilterMapping[filterName]);
    var selection = (filterSelector.val() || []).filter(function(v) { return v != "multiselect-all" });
    var optionCount = filterSelector.find("option").length - 1; // Number of options, minus the "Select All" option
    if (selection.length != optionCount) { // Not all options are selected
      filters[filterName] = selection;
    }
  }

  var lines = [];
  var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
  var expectedCount = versions.length * aggregates.length;
  versions.forEach(function(version) {
    Telemetry.loadEvolutionOverBuilds(version, measure, function(histogramEvolution) {
      var evolutions = [histogramEvolution];
      filterList = [
        ["saved_session"],
        ("product" in filters) ? filters["product"] : null,
        ("os" in filters) ? filters["os"] : null,
        ("os_version" in filters) ? filters["os_version"] : null,
        ("arch" in filters) ? filters["arch"] : null,
      ];
      filterList.forEach(function(options, i) {
        // stop filtering here if the remaining filters are all null
        if (filterList.slice(i).filter(function(options) { return options !== null }).length == 0) {
          return;
        }
        
        if (evolutions.length == 0) { return; }
        evolutions = Array.concat.apply([], evolutions.map(function(evolution) {
          var actualOptions = options, fullOptions = evolution.filterOptions();
          if (actualOptions === null) { actualOptions = fullOptions; }
          actualOptions = actualOptions.filter(function(option) { return fullOptions.indexOf(option) >= 0 });
          return actualOptions.map(function(option) { return evolution.filter(option); });
        }));
      })
      
      // Filter each histogram's dataset and combine them into a single dataset
      var dateDatasets = {};
      var firstHistogram = null, firstFilterId = null;
      evolutions.forEach(function(evolution) {
        evolution.each(function(date, hgram) {
          // We just need a valid filter ID in order to have it pass filtering when constructing histograms later
          if (firstHistogram === null) {
            firstHistogram = hgram;
            firstFilterId = firstHistogram._dataset[0][firstHistogram._dataset[0].length + Telemetry.DataOffsets.FILTER_ID];
          }
          
          // precomputeAggregateQuantity will perform the actual filtering for us, and then we set the filter ID manually
          var timestamp = date.getTime();
          if (!(timestamp in dateDatasets)) { dateDatasets[timestamp] = []; }
          var filteredDataset = hgram._dataset[0].map(function(value, i) { return hgram.precomputeAggregateQuantity(i); });
          filteredDataset[filteredDataset.length + Telemetry.DataOffsets.FILTER_ID] = firstFilterId;
          dateDatasets[timestamp].push(filteredDataset);
        });
      });
      
      // Generate histograms for each date and generate points for the desired aggregates for each one
      var aggregatePoints = {}
      Object.keys(dateDatasets).sort().forEach(function(timestamp) {
        // Create a histogram that has no filters and contains the combined dataset
        var dataset = dateDatasets[timestamp];
        var histogram = new Telemetry.Histogram(measure, histogramEvolution._filter_path, firstHistogram._buckets, dataset, histogramEvolution._filter_tree, firstHistogram._spec);
        
        // Obtain the aggregate values from the histogram
        aggregates.forEach(function(aggregate) {
          if (!(aggregate in aggregatePoints)) { aggregatePoints[aggregate] = [] }
          aggregatePoints[aggregate].push({x: timestamp, y: gAggregateValue[aggregate](histogram)});
        })
      });
      
      // Generate lines from the points for each aggregate
      for (aggregate in aggregatePoints) {
        var newLine = new Line(measure, version, aggregate, null, filters, aggregatePoints[aggregate]);
        newLine.histogramEvolution = histogramEvolution;
        lines.push(newLine);
        if (lines.length === expectedCount) { // Check if we have loaded all the needed versions
          displayHistogramEvolutions(lines);
        }
      }
    });
  })
}

var gCurrentHistogramEvolutionsPlot = null;
function displayHistogramEvolutions(lines, minDate = -Infinity, maxDate = Infinity) {
  // Filter out the points that are outside of the time range
  var filteredDatasets = lines.map(function (line) {
    return {
      label: line.getTitleString() + " (" + line.getFilterString() + ")",
      strokeColor: line.color,
      data: line.values.filter(function(point) { return point.x >= minDate && point.x <= maxDate; }),
    };
  });
  
  // Plot the data using Chartjs
  var ctx = document.getElementById("evolutions").getContext("2d");
  if (gCurrentHistogramEvolutionsPlot !== null) {
    gCurrentHistogramEvolutionsPlot.destroy();
  }
  Chart.defaults.global.responsive = true;
  gCurrentHistogramEvolutionsPlot = new Chart(ctx).Scatter(filteredDatasets, {
    animation: false,
    scaleType: "date",
    scaleLabel: function(valuesObject) { return formatNumber(valuesObject.value); },
    tooltipFontSize: 10,
    tooltipTemplate: function(valuesObject) {
      return valuesObject.datasetLabel + " - " + valuesObject.valueLabel + " on " + moment(valuesObject.arg).format("MMM D, YYYY");
    },
    multiTooltipTemplate: function(valuesObject) {
      return valuesObject.datasetLabel + " - " + valuesObject.valueLabel + " on " + moment(valuesObject.arg).format("MMM D, YYYY");
    },
    bezierCurveTension: 0.3,
    pointDotStrokeWidth: 0,
    pointDotRadius: 3,
  });
}

var Line = (function(){
  var lineColors = {};
  var goodColors = ["aqua", "orange", "purple", "red", "yellow", "teal", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "silver", "black", "blue"];
  var goodColorIndex = 0;
  var filterSortOrder = ["product", "OS", "osVersion", "arch"];

  function Line(measure, channelVersion, aggregate, dateRange, filters, values) {
    this.measure = measure;
    this.channelVersion = channelVersion;
    this.aggregate = aggregate;
    this.dateRange = dateRange || null;
    this.filters = filters || {};
    this.values = values || [];
    
    // Assign a color to the line
    var stateString = this.getStateString();
    if (!lineColors.hasOwnProperty(stateString)) {
      goodColorIndex = (goodColorIndex + 1) % goodColors.length;
      lineColors[stateString] = goodColors[goodColorIndex];
    }
    this.color = lineColors[stateString];
  }

  Line.prototype.getTitleString = function Line_getTitleString() {
    return this.measure + " - " + this.channelVersion.replace("/", " ") + " - " + this.aggregate;
  };
  Line.prototype.getFilterString = function Line_getFilterString() {
    return ("OS" in this.filters ? this.filters["OS"].join(", ") : "Any OS")
      + " " + ("osVersion" in this.filters ? this.filters["osVersion"].join(", ") + " " : "")
      + " - " + ("product" in this.filters ? this.filters["product"].join(", ") : "Any Product")
      + " - " + ("arch" in this.filters ? this.filters["arch"].join(", ") : "Any Build");
  };
  Line.prototype.getStateString = function Line_getStateString() {
    var filters = this.filters;
    var filterState = filterSortOrder.map(function(filterName) {
      if (!(filterName in filters)) { return ""; }
    
      // Sort the selected options of each filter
      return filters[filterName].sort().join("|");
    }).join("/");
    return this.measure + "/" + this.channelVersion + "/" + this.aggregate + "/" + filterState;
    //wip: store date range somehow
  };
  Line.prototype.setStateString = function Line_setStateString(stateString) {
    var parts = stateString.split("/");
    this.measure = parts.shift();
    this.channelVersion = parts.shift() + "/" + parts.shift();
    this.aggregate = parts.shift();
    this.filters = {};
    var filters = this.filters;
    parts.forEach(function(filterOption, i) {
      if (i < filterSortOrder.length) {
        if (filterOption !== "") {
          filters[filterSortOrder[i]] = filterOption.split("|");
        }
      } else {
        throw new Error("Unknown filter option " + filter);
      }
    });
    
    if (!lineColors.hasOwnProperty(stateString)) {
      goodColorIndex = (goodColorIndex + 1) % goodColors.length;
      lineColors[stateString] = goodColors[goodColorIndex];
    }
    this.color = lineColors[stateString];
    return this;
  }

  return Line;
})();

// Load the current state from the URL, or the cookie if the URL is not specified
function loadStateFromUrlAndCookie() {
  var url = window.location.hash;
  url = url[0] === "#" ? url.slice(1) : url;
  
  // Load from cookie if URL does not have state, and give up if still no state available
  if (url.indexOf("&") < 0) {
    var name = "stateFromUrl=";
    document.cookie.split(';').forEach(function(entry) {
      entry = entry.trim();
      if (entry.indexOf(name) == 0) {
        url = entry.substring(name.length, entry.length);
      }
    });
  }
  
  // Load the options
  gInitialPageState = {};
  url.split("&").forEach(function(fragment, i) {
    var parts = fragment.split("=");
    if (parts.length != 2) return;
    gInitialPageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });

  // Process the saved state value
  gInitialPageState.aggregates = gInitialPageState.aggregates !== undefined ?
    gInitialPageState.aggregates.split("!") : ["median"];
  gInitialPageState.measure = gInitialPageState.measure !== undefined ?
    gInitialPageState.measure : "GC_MS";
  gInitialPageState.min_channel_version = gInitialPageState.min_channel_version ?
    gInitialPageState.min_channel_version : "nightly/38";
  gInitialPageState.max_channel_version = gInitialPageState.max_channel_version ?
    gInitialPageState.max_channel_version : "nightly/41";
  gInitialPageState.product = gInitialPageState.product ?
    gInitialPageState.product.split("!") : ["Firefox"];
  gInitialPageState.arch = gInitialPageState.arch ?
    gInitialPageState.arch.split("!") : null;
  gInitialPageState.os = gInitialPageState.os ?
    gInitialPageState.os.split("!") : null;
  gInitialPageState.os_version = gInitialPageState.os_version ?
    gInitialPageState.os_version.split("!") : null;
  
  $("#aggregates").val(gInitialPageState.aggregates);
  $("#measure").val(gInitialPageState.measure);

  $("#min-channel-version").val(gInitialPageState.min_channel_version).trigger("change");
  $("#max-channel-version").val(gInitialPageState.max_channel_version).trigger("change");
  $("#filter-product").val(gInitialPageState.product);
  if (gInitialPageState.arch !== null) { $("#filter-arch").val(gInitialPageState.arch); }
  if (gInitialPageState.os !== null) { $("#filter-os").val(gInitialPageState.os); }
  if (gInitialPageState.os_version !== null) { $("#filter-os-version").val(gInitialPageState.os_version); }
}

// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  var gInitialPageState = {
    aggregates: $("#aggregates").val() || [],
    measure: $("#measure").val(),
    min_channel_version: $("#min-channel-version").val(),
    max_channel_version: $("#max-channel-version").val(),
    product: $("#filter-product").val() || [],
    arch: $("#filter-arch").val() || [],
    os: $("#filter-os").val() || [],
    os_version: $("#filter-os-version").val() || [],
  };
  var fragments = [];
  $.each(gInitialPageState, function(k, v) {
    if (v instanceof Array) {
      v = v.join("!");
    }
    fragments.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
  });
  var stateString = fragments.join("&");
  
  // Save to the URL hash if it changed
  var url = window.location.hash;
  url = url[0] === "#" ? url.slice(1) : url;
  if (url !== stateString) { window.location.hash = "#" + stateString; }
  
  // Save the state in a cookie that expires in 3 days
  var expiry = new Date();
  expiry.setTime(expiry.getTime() + (3 * 24 * 60 * 60 * 1000));
  document.cookie = "stateFromUrl=" + stateString + "; expires=" + expiry.toGMTString();
}

function formatNumber(number) {
  if (number == Infinity) return "Infinity";
  if (number == -Infinity) return "-Infinity";
  if (isNaN(number)) return "NaN";
  var mag = Math.abs(number);
  var exponent = Math.floor(Math.log10(mag));
  var interval = Math.pow(10, Math.floor(exponent / 3) * 3);
  var units = {1000: "k", 1000000: "M", 1000000000: "B", 1000000000000: "T"};
  if (interval in units) {
    return Math.round(number * 100 / interval) / 100 + units[interval];
  }
  return Math.round(number * 100) / 100;
}
