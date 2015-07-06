var gCurrentEvolutionLines = []; // List of all current histogram evolutions
var gSelectedEvolutionLine = null; // Currently selected histogram evolution
var gCurrentHistogramEvolutionPlot = null; // Currently displayed histogram evolution plot
var gCurrentHistogramPlot = null; // Currently displayed histogram plot
var gCurrentHistogramEvolutionsPlot = null; // Currently displayed histogram evolution plots

$(".container, .container-fluid").hide(); // Hide the content until the page is fully loaded

// Entry point
Telemetry.init(function () {
  $(window).bind("hashchange", function() {
    $("#permalink-value").hide();
  });
  
  // Set up the build selectors
  var versions = Telemetry.versions();
  $("#min-channel-version, #max-channel-version, #line-channel-version").empty().append(versions.map(function(option) {
    return '<option value="' + option + '">' + option.replace("/", " ") + '</option>';
  }).join()).trigger("change");
  
  // Select the contents of the permalink text box on focus
  $("#permalink-value").hide().focus(function() {
    var $this = $(this);
    $this.select();
    // Work around Chrome's little problem (http://stackoverflow.com/questions/5797539)
    $this.mouseup(function() {
      // Prevent further mouseup intervention
      $this.unbind("mouseup");
      return false;
    });
  });
  
  // Shortened permalink button
  $('#permalink').click(function() {
    event('click', 'tinyUrl', 'generatedTinyUrl');
    var request = {
      url: "https://api-ssl.bitly.com/shorten",
      dataType: "jsonp",
      data: {
        longUrl: window.location.href, access_token: "48ecf90304d70f30729abe82dfea1dd8a11c4584",
        format: "json"
      },
      success: function(response) {
        var longUrl = Object.keys(response.results)[0];
        var shortUrl = response.results[longUrl].shortUrl;
        $("#permalink-value").val(shortUrl).show();
      }
    };
    $.ajax(request);
  });
  
  // Add series from either currently selected line, or a default line
  $("#add-evolution-line").click(function() {
    var newLine;
    if (gSelectedEvolutionLine != null) {
      newLine = new Line(gSelectedEvolutionLine.measure, gSelectedEvolutionLine.channelVersion, gSelectedEvolutionLine.aggregate,
                         gSelectedEvolutionLine.dateRange, gSelectedEvolutionLine.filters, gSelectedEvolutionLine.values);
    } else {
      newLine = new Line("GC_MS", "nightly/40", "median", null, {OS: ["WINNT"], product: ["Firefox"]}, []);
    }
    addEvolutionLine(newLine);
    saveStateToUrlAndCookie();
  });
  
  // Export as CSV button
  var previousCSVBlob = null;
  $('#export-csv').click(function () {
    if (gSelectedEvolutionLine === null) {
      return;
    }
    if (previousCSVBlob !== null) {
      URL.revokeObjectURL(previousCSVBlob);
      previousCSVBlob = null;
    }
    
    var histogram = gSelectedEvolutionLine.histogramEvolution.range();
    
    // Generate CSV output
    var csv = "start,\tend,\tcount\n";
    csv += histogram.map(function (count, start, end, index) {
      return [start, end, count].join(",\t");
    }).join("\n");

    previousCSVBlob = URL.createObjectURL(new Blob([csv]));
    $('#export-csv')[0].href = previousCSVBlob;
    $('#export-csv')[0].download = histogram.measure() + ".csv";
    event('click', 'download csv', 'download csv');
  });
  
  // Export as JSON button
  var previousJSONBlob = null
  $('#export-json').click(function () {
    if (gSelectedEvolutionLine === null) {
      return;
    }
    if (previousJSONBlob !== null) {
      URL.revokeObjectURL(previousJSONBlob);
      previousJSONBlob = null;
    }
    
    var histogram = gSelectedEvolutionLine.histogramEvolution.range();
    
    // Generate JSON output
    var result = JSON.stringify(histogram.map(function (count, start, end, index) {
      return {"start": start, "end": end, "count": count};
    }));

    previousJSONBlob = URL.createObjectURL(new Blob([result]));
    $('#export-json')[0].href = previousJSONBlob;
    $('#export-json')[0].download = histogram.measure() + ".json";
    event('click', 'download json', 'download json');
  });
  
  // Callbacks for selection changed
  var filterMapping = {
    "#line-filter-OS": "OS",
    "#line-filter-osVersion" : "osVersion",
    "#line-filter-product": "product",
    "#line-filter-arch": "arch",
  };
  for (var filterSelector in filterMapping) {
    var $this = $(filterSelector), filterName = filterMapping[filterSelector];
    $(filterSelector).change((function($this, filterName) {
      return function() {
        var selection = ($this.val() || []).filter(function(selection) { return selection != "multiselect-all" });
        var optionCount = $this.find("option").length - 1; // Number of options, not including the "Select All" option
        if (selection.length == optionCount) { // All options selected, clear filter
          delete gSelectedEvolutionLine.filters[filterName];
        } else {
          gSelectedEvolutionLine.filters[filterName] = selection;
        }
        refreshEvolutionLine(gCurrentEvolutionLines.indexOf(gSelectedEvolutionLine));
      };
    })($this, filterName));
  }
  
  $("#spinner").hide();
  $(".container, .container-fluid").show();
  
  loadStateFromUrlAndCookie();
});

function displayHistogramEvolutionLineHistogram(line) {
  // Compute chart data values
  var histogram = line.histogramEvolution.range();
  var total = histogram.count();
  var tooltipLabels = {};
  var labels = histogram.map(function (count, start, end, index) {
    var label = formatNumber(start);
    tooltipLabels[label] = formatNumber(count) + " hits (" + Math.round(100 * count / total, 2) + "%) between " + start + " and " + end;
    return label;
  });
  var data = histogram.map(function (count, start, end, index) { return count; });
  
  // Plot the data using Chartjs
  var ctx = document.getElementById("histogram").getContext("2d");
  if (gCurrentHistogramPlot !== null) {
    gCurrentHistogramPlot.destroy();
  }
  Chart.defaults.global.responsive = true;
  Chart.defaults.global.animation = false;
  gCurrentHistogramPlot = new Chart(ctx).Bar({
    labels: labels,
    datasets: [{
      fillColor: "#555555",
      data: data,
    }]
  }, {
    barValueSpacing : 0,
    barDatasetSpacing : 0,
    barShowStroke: false,
    scaleLabel: function(valuesObject) { return formatNumber(valuesObject.value); },
    tooltipFontSize: 10,
    tooltipTemplate: function(valuesObject) { return tooltipLabels[valuesObject.label] || valuesObject.label; },
  });
  
  // Assign random colors to make it easy to differentiate between bars
  gCurrentHistogramPlot.datasets[0].bars.forEach(function(bar) {
    bar.fillColor = "hsla(" + Math.floor(Math.random() * 256) + ", 80%, 70%, 0.8)";
  });
  gCurrentHistogramPlot.update();
  
  // Update summary for the first histogram evolution
  var dates = line.histogramEvolution.dates();
  $("#prop-kind").text(histogram.kind());
  $("#prop-submissions").text(formatNumber(histogram.submissions()));
  $("#prop-count").text(formatNumber(histogram.count()));
  $("#prop-dates").text(formatNumber(dates.length));
  $("#prop-date-range").text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ?
    "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  if (histogram.kind() === "linear" || histogram.kind() === "exponential") {
    if (histogram.kind() === "linear") {
      $("#prop-mean").text(formatNumber(histogram.mean()));
      $("#prop-standardDeviation").text(formatNumber(histogram.standardDeviation()));
      $(".linear-only").show();
    } else {
      $("#prop-mean2").text(formatNumber(histogram.mean()));
      $("#prop-geometricMean").text(formatNumber(histogram.geometricMean()));
      $("#prop-geometricStandardDeviation").text(formatNumber(histogram.geometricStandardDeviation()));
      $(".exponential-only").show();
    }
    $("#prop-p5").text(formatNumber(histogram.percentile(5)));
    $("#prop-p25").text(formatNumber(histogram.percentile(25)));
    $("#prop-p50").text(formatNumber(histogram.percentile(50)));
    $("#prop-p75").text(formatNumber(histogram.percentile(75)));
    $("#prop-p95").text(formatNumber(histogram.percentile(95)));
  } else {
    $(".linear-only, .exponential-only").hide();
  }
}

function displayHistogramEvolutions(lines) {
  //wip: get minDate and maxDate
  var minDate = 0, maxDate = Infinity;
  
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
function clearEvolutionLines() {
  gCurrentEvolutionLines = [];
  $("#evolution-line-list .evolution-line").remove();
  displayHistogramEvolutions(gCurrentEvolutionLines);
}
function addEvolutionLine(line) {
  gCurrentEvolutionLines.push(line);
  refreshEvolutionLines();
  
  // Add the new line element
  var lineElement = $(
    '<a class="evolution-line list-group-item">' +
      '<span class="legend-color"></span>' +
      '&nbsp;' +
      '<div class="evolution-line-description">' +
        '<span></span> <button class="evolution-line-remove btn btn-default btn-xs">remove</button>' +
      '</div>' +
    '</a>\n'
  );
  lineElement.click(function() {
    var $this = $(this);
    var lineElements = $this.parent().find(".evolution-line");
    selectEvolutionLine(lineElements.index($this));
  });
  lineElement.find(".evolution-line-remove").click(function(event) {
    var $this = $(this).parents(".evolution-line").first();
    var lineElements = $("#evolution-line-list .evolution-line");
    removeEvolutionLine(lineElements.index($this));
    saveStateToUrlAndCookie();
    event.stopPropagation();
  });
  $("#evolution-line-list").append(lineElement);
  var index = $("#evolution-line-list .evolution-line").size() - 1;
  refreshEvolutionLine(index);
  if (index === 0) { selectEvolutionLine(0); }
}
function refreshEvolutionLines() {
  var selectableLineTitles = {};
  gCurrentEvolutionLines.forEach(function(line) {
    var key = line.measure + " - " + line.channelVersion.replace("/", " ");
    selectableLineTitles[key] = true;
  });
  var options = Object.keys(selectableLineTitles).sort();
  $("#selected-line").empty().append(options.map(function(option, i) {
      return '<option value="' + i + '">' + option + '</option>';
  }).join()).trigger("change");
}
function refreshEvolutionLine(evolutionLineIndex) {
  refreshEvolutionLines();
  var line = gCurrentEvolutionLines[evolutionLineIndex];
  
  // Set the line label
  var label = line.getTitleString();
  var lineElement = $($("#evolution-line-list .evolution-line").get(evolutionLineIndex));
  lineElement.attr("title", label);
  lineElement.contents().filter(function() { return this.nodeType == 3; }).each(function() { this.textContent = line.getTitleString(); });
  
  // Set the line filters label
  lineElement.find(".evolution-line-description span").text(line.getFilterString());
  
  // Set the line color
  lineElement.find(".legend-color").css("background-color", line.color);
  
  Telemetry.loadEvolutionOverTime(line.channelVersion, line.measure, function(histogramEvolution) {
    line.histogramEvolution = histogramEvolution;
    var filteredHistogramEvolution = line.histogramEvolution; //wip: filter the histogram properly
    line.values = filteredHistogramEvolution.map(function(date, hgram) {
      var value;
      if (line.aggregate === "mean") { value = hgram.mean(); }
      else if (line.aggregate === "5th-percentile") { value = hgram.percentile(5); }
      else if (line.aggregate === "25th-percentile") { value = hgram.percentile(25); }
      else if (line.aggregate === "median") { value = hgram.median(); }
      else if (line.aggregate === "75th-percentile") { value = hgram.percentile(75); }
      else if (line.aggregate === "95th-percentile") { value = hgram.percentile(95); }
      return {x: date, y: value};
    });
    displayHistogramEvolutions(gCurrentEvolutionLines);
    
    // Refresh the histogram display if the current line is the selected one
    if (compareEvolutionLines(gSelectedEvolutionLine, line)) { displayHistogramEvolutionLineHistogram(line); }
  });
}
function removeEvolutionLine(evolutionLineIndex) {
  var line = gCurrentEvolutionLines[evolutionLineIndex];
  gCurrentEvolutionLines.splice(evolutionLineIndex, 1);
  refreshEvolutionLines();
  if (compareEvolutionLines(line, gSelectedEvolutionLine)) {
    selectEvolutionLine(gCurrentEvolutionLines.length - 1);
  }
  var lineElement = $($("#evolution-line-list .evolution-line").get(evolutionLineIndex)).remove();
  displayHistogramEvolutions(gCurrentEvolutionLines);
}
function selectEvolutionLine(evolutionLineIndex) {
  // Handle selecting none of the lines
  if (evolutionLineIndex < 0) {
    $("#line-measure").empty().trigger("change");
    return;
  }
  
  var line = gCurrentEvolutionLines[evolutionLineIndex];
  gSelectedEvolutionLine = line;

  // Select the line element
  var lineElements = $("#evolution-line-list .evolution-line");
  lineElements.filter(".active").removeClass("active");
  $(lineElements.get(evolutionLineIndex)).addClass("active");
  
  // Load measure, channel version, and aggregate
  Telemetry.measures(line.channelVersion, function(measures) {
    var options = Object.keys(measures).sort();
    $("#line-measure").empty().append(options.map(function(option) {
      return '<option value="' + option + '">' + option + '</option>';
    }).join());
    if (options.length > 0) {
      var selectedOption = (line && measures[line.measure] !== undefined) ? line.measure : options[0];
      $("#line-measure").val(selectedOption).trigger("change");
    }
  });
  $("#line-channel-version").val(line.channelVersion).trigger("change");
  $("#line-aggregate").val(line.aggregate).trigger("change");
  
  // Load filters
  var filterMapping = {
    "OS": $("#line-filter-OS"),
    "osVersion": $("#line-filter-osVersion"),
    "product": $("#line-filter-product"),
    "arch": $("#line-filter-arch"),
  };
  for (var filterName in filterMapping) {
    var element = filterMapping[filterName];
    if (filterName in line.filters) {
      element.multiselect("select", line.filters[filterName]);
    } else { // Select all options (using "selectAll" is broken in the library)
      element.multiselect("select", element.find("option")
             .map(function(i, option) { return $(option).val(); })
             .filter(function(i, option) { return option != "multiselect-all"; }).toArray());
    }
  }
}
function compareEvolutionLines(line1, line2) { // Returns true if two evolution lines have the same histogram
  if (line1.measure !== line2.measure || line1.channelVersion !== line2.channelVersion) { return false; }
  var keys1 = Object.keys(line1.filters).sort(), keys2 = Object.keys(line2.filters).sort();
  if (keys1.length !== keys2.length) { return false; }
  var equal = true;
  keys1.forEach(function(key1, i) {
    if (key1 !== keys2[i]) { equal = false; }
    else {
      var values1 = line1.filters[key1].sort();
      var values2 = line2.filters[keys2[i]].sort();
      if (values1.length !== values2.length) { equal = false; }
      else {
        values1.forEach(function(value1, i) {
          if (value1 !== values2[i]) { equal = false; }
        });
      }
    }
  });
  return equal;
}

function unique(array) {
  var keySet = {};
  array.forEach(function(value) { keySet[value] = true; });
  return Object.keys(keySet).sort();
}

// Trigger a Google Analytics event
function event() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('event');
  args.unshift('send');
  ga.apply(ga, args);
}

// Load the current state from the URL, or the cookie if the URL is not specified
function loadStateFromUrlAndCookie() {
  var url = window.location.hash;
  if (url.length === 0) { return; }
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
  if (url.indexOf("&") < 0) { return; }
  
  // Load the options
  var pageState = {};
  url.split("&").forEach(function(fragment, i) {
    var parts = fragment.split("=");
    pageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });

  // Load lines if specified
  if (pageState.lines !== undefined) {
    pageState.lines = pageState.lines.split("!");
    clearEvolutionLines();
    pageState.lines.forEach(function(stateString, i) {
      var line = (new Line()).setStateString(stateString);
      addEvolutionLine(line);
    });
    
    // Load the line selection if specified
    if (pageState.selectedLineIndex !== undefined && pageState.selectedLineIndex >= 0) {
      selectEvolutionLine(pageState.selectedLineIndex);
    }
  }
  saveStateToUrlAndCookie();
}
// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  var pageState = {
    lines: gCurrentEvolutionLines.map(function(line) { return line.getStateString(); }),
    selectedLineIndex: gCurrentEvolutionLines.indexOf(gSelectedEvolutionLine),
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

var gHasReportedDateRangeSelectorUsedInThisSession = false;
var gDrawTimer = null;
var gUserSelectedRange = false;
function updateRendering(hgramEvo, lines, start, end) {
  // Update the start and end range and update the selection if necessary
  var picker = $("#dateRange").data("daterangepicker");
  var startMoment = moment(start), endMoment = moment(end);
  picker.setOptions({
    format: "MM/DD/YYYY",
    minDate: startMoment,
    maxDate: endMoment,
    showDropdowns: true,
    ranges: {
       "All": [startMoment, endMoment],
       "Last 30 Days": [endMoment.clone().subtract(30, "days"), endMoment],
       "Last 7 Days": [endMoment.clone().subtract(6, 'days'), endMoment],
    },
  }, function(chosenStart, chosenEnd, label) {
    // Report it the first time the date-range selector is used in a session
    if (!gHasReportedDateRangeSelectorUsedInThisSession) {
     gHasReportedDateRangeSelectorUsedInThisSession = true;
     event('report', 'date-range-selector', 'used-in-session', 1);
    }
    gUserSelectedRange = true;
    updateRendering(hgramEvo, lines, startMoment, endMoment);
  });
  if (picker.startDate.isAfter(endMoment) || picker.endDate.isBefore(startMoment)) {
    gUserSelectedRange = false;
  }
  if (!gUserSelectedRange) {
    picker.setStartDate(startMoment);
    picker.setEndDate(endMoment);
  }
  var minDate = picker.startDate.toDate().getTime(), maxDate = picker.endDate.toDate().getTime();
  
  var hgram;
  hgram = hgramEvo.range(new Date(minDate), new Date(maxDate));
  gCurrentHistogram = hgram;
  
  // Schedule redraw of histogram for the first histogram evolution
  if (gDrawTimer) {
    clearTimeout(gDrawTimer);
  }
  gDrawTimer = setTimeout(function () {
    renderHistogramEvolution(lines, minDate, maxDate);
    var renderType = $('input[name=render-type]:radio:checked').val();
    if (renderType == 'Table') {
      renderHistogramTable(hgram);
    } else {
      renderHistogramGraph(hgram);
    }
  }, 100);
  
  // Update summary for the first histogram evolution
  var dates = hgramEvo.dates();
  $('#prop-kind').text(hgram.kind());
  $('#prop-submissions').text(formatNumber(hgram.submissions()));
  $('#prop-count').text(formatNumber(hgram.count()));
  $('#prop-dates').text(formatNumber(dates.length));
  $('#prop-date-range').text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ?
    "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  if (hgram.kind() == 'linear') {
    $('#prop-mean').text(formatNumber(hgram.mean()));
    $('#prop-standardDeviation').text(formatNumber(hgram.standardDeviation()));
  }
  else if (hgram.kind() == 'exponential') {
    $('#prop-mean2').text(formatNumber(hgram.mean()));
    $('#prop-geometricMean').text(formatNumber(hgram.geometricMean()));
    $('#prop-geometricStandardDeviation').text(formatNumber(hgram.geometricStandardDeviation()));
  }
  if (hgram.kind() == 'linear' || hgram.kind() == 'exponential') {
    $('#prop-p5').text(formatNumber(hgram.percentile(5)));
    $('#prop-p25').text(formatNumber(hgram.percentile(25)));
    $('#prop-p50').text(formatNumber(hgram.percentile(50)));
    $('#prop-p75').text(formatNumber(hgram.percentile(75)));
    $('#prop-p95').text(formatNumber(hgram.percentile(95)));
  }
}

var gLastHistogramEvos = null;
var gLineColors = {};
var gGoodColors = ["aqua", "orange", "purple", "red", "yellow", "teal", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "silver", "black", "blue"];
var gGoodColorIndex = 0;
function update(hgramEvos) {
  // Obtain a list of histogram evolutions (histogram series)
  var evosVals = [];
  $.each(hgramEvos, function (key, value) {
    evosVals.push(value);
  });
  var hgramEvo = evosVals[0];
  if (hgramEvos === undefined || hgramEvos === []) {
    return;
  }
  if (!hgramEvos) {
    hgramEvos = gLastHistogramEvos;
  }
  gLastHistogramEvos = hgramEvos;

  // Compute list of each individual series and bucket labels
  var lines = [];
  var labels = [];
  var start = null, end = null;
  $.each(hgramEvos, function (state, evo) {
    var series = prepareData(state, evo);
    for (var x in series) {
      labels.push(series[x].key);
    }

    // Create new series with updated fields for each entry
    series = $.map(series, function(entry, i) {
      // Update the bounds properly
      entry.values.forEach(function(point) {
        if (start === null || point.x < start) {
          start = point.x;
        }
        if (end === null || point.x > end) {
          end = point.x;
        }
      });
      
      // Add extra fields to the lines such as their cached color
      if (gLineColors[state + "\n" + entry.key] === undefined) {
        gGoodColorIndex = (gGoodColorIndex + 1) % gGoodColors.length;
        gLineColors[state + "\n" + entry.key] = gGoodColors[gGoodColorIndex];
      }
      var parts = state.split("/");
      var key = parts[0] + " " + parts[1] + ": " +  entry.key;
      return $.extend({}, entry, {
        color: gLineColors[state + "\n" + entry.key],
        fullState: state,
        title: entry.key,
        key: key,
      });
    });

    $.merge(lines, series);
  });
  labels = unique(labels);
  start = new Date(start);
  end = new Date(end);

  // Select the required aggregates in the data
  function updateDisabledAggregates() {
    var toBeSelected = $("#aggregateSelector").multiselect("getSelected").val();
    if (toBeSelected === undefined) {
      return;
    }
    if (toBeSelected === null) {
      toBeSelected = [];
    }
    var linesAreSelected = false;
    lines.forEach(function(line) {
      if (toBeSelected.indexOf(line.title) !== -1) {
        linesAreSelected = true;
      }
    });
    if (!linesAreSelected) {
      toBeSelected = [lines[0].title];
      $("#aggregateSelector").children().removeAttr("selected");
      $("#aggregateSelector").multiselect("select", toBeSelected);
    }
    lines.forEach(function(line) {
      line.disabled = toBeSelected.indexOf(line.title) === -1 || toBeSelected.length === 0;
    });
  }

  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());
  
  setAggregateSelectorOptions(labels, function() {
    updateDisabledAggregates();
    updateRendering(hgramEvo, lines, start, end);
  }, true);
  updateUrlHashIfNeeded();
}

function formatOption(filterName, option) {
  var _systemNames = {"WINNT": "Windows", "Windows_95": "Windows 95", "Darwin": "OS X"};
  var _windowsVersionNames = {"5.0": "2000", "5.1": "XP", "5.2": "XP Pro x64", "6.0": "Vista", "6.1": "7", "6.2": "8", "6.3": "8.1", "6.4": "10 (Tech Preview)", "10.0": "10"};
  var _windowsVersionOrder = {"5.0": 0, "5.1": 1, "5.2": 2, "6.0": 3, "6.1": 4, "6.2": 5, "6.3": 6, "6.4": 7, "10.0": 8};
  var _darwinVersionPrefixes = {
    "1.2.": "Kodiak", "1.3.": "Cheetah", "1.4.": "Puma", "6.": "Jaguar",
    "7.": "Panther", "8.": "Tiger", "9.": "Leopard", "10.": "Snow Leopard",
    "11.": "Lion", "12.": "Mountain Lion", "13.": "Mavericks", "14.": "Yosemite",
  };
  var _archNames = {"x86": "32-bit", "x86-64": "64-bit"};
  if (filterName === "OS") {
    return _systemNames.hasOwnProperty(option) ? _systemNames[option] : option;
  } else if (filterName === "osVersion") {
    var selectedSystems = $("#line-filter-OS").val();
    if (selectedSystems.indexOf("WINNT") >= 0 && _windowsVersionNames.hasOwnProperty(option)) {
      return _windowsVersionNames[option];
    }
    if (selectedSystems.indexOf("Darwin") >= 0) {
      for (var prefix in _darwinVersionPrefixes) {
        if (option.startsWith(prefix)) {
          return option + " (" + _darwinVersionPrefixes[prefix] + ")";
        }
      }
    }
  } else if (filterName === "arch") {
    return _archNames.hasOwnProperty(option) ? _archNames[option] : option;
  }
  return option;
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
