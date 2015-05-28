var gFilterMapping = null;
var gVersions = null;

Telemetry.init(function() {
  gVersions = Telemetry.versions();
  gFilterMapping = {
    "product":   $("#filter-product"),
    "arch":      $("#filter-arch"),
    "OS":        $("#filter-os"),
    "osVersion": $("#filter-os-version"),
  };

  loadStateFromUrlAndCookie();
  
  $("#aggregates").change(function() {
    var $this = $(this);
    if (($this.val() || []).length == 0) { $this.multiselect("select", ["median"]); };
    calculateHistogramEvolutions();
  });
  $("#measure, #min-channel-version, #max-channel-version").change(calculateHistogramEvolutions);
  for (var filterName in gFilterMapping) { gFilterMapping[filterName].change(calculateHistogramEvolutions); }
  calculateHistogramEvolutions();
});

var gAggregateValue = {
  "mean":            function(histogram) { return histogram.mean(); },
  "5th-percentile":  function(histogram) { return histogram.percentile(5); },
  "25th-percentile": function(histogram) { return histogram.percentile(25); },
  "median":          function(histogram) { return histogram.median(); },
  "75th-percentile": function(histogram) { return histogram.percentile(75); },
  "95th-percentile": function(histogram) { return histogram.percentile(95); },
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
  //wip: loop over versions
  var lines = [];
  var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
  var expectedCount = versions.length * aggregates.length;
  versions.forEach(function(version) {
    Telemetry.loadEvolutionOverBuilds(version, measure, function(histogramEvolution) {
      var filteredHistogramEvolution = histogramEvolution; //wip: filter using `filters`
      aggregates.forEach(function(aggregate) {
        var valueFunction = gAggregateValue[aggregate];
        var values = filteredHistogramEvolution.map(function(date, hgram) {
          return {x: date, y: valueFunction(hgram)};
        });
        var newLine = new Line(measure, version, aggregate, null, filters, values);
        newLine.histogramEvolution = histogramEvolution
        lines.push(newLine);
        if (lines.length === expectedCount) { // Check if we have loaded all the needed versions
          displayHistogramEvolutions(lines);
        }
      });
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
  if (url.length === 0) { return; }
  
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
  if (url.indexOf("&") < 0) { return; }
  
  // Load the options
  var pageState = {};
  url.split("&").forEach(function(fragment, i) {
    var parts = fragment.split("=");
    pageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });

  $("#aggregates").val(pageState.aggregates !== undefined ? pageState.aggregates.split("!") : ["median"]);
  $("#measure").val(pageState.measure !== undefined ? pageState.measure : ["GC_MS"]);
  $("#min-channel-version").val(pageState.min_channel_version !== undefined ? pageState.min_channel_version : "nightly/38");
  $("#min-channel-version").val(pageState.max_channel_version !== undefined ? pageState.max_channel_version : "nightly/40");
  $("#filter-product").val(pageState.product !== undefined ? pageState.product.split("!") : ["Firefox"]);
  if (pageState.arch !== undefined) { $("#filter-arch").val(pageState.arch.split("!")); }
  if (pageState.os !== undefined) { $("#filter-os").val(pageState.os.split("!")); }
  if (pageState.os_version !== undefined) { $("#filter-os-version").val(pageState.os_version.split("!")); }
}

// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  var pageState = {
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
  $.each(pageState, function(k, v) {
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
