var gInitialPageState = null;
var gFilterChangeTimeout = null;
var gFilters = null, gPreviousFilterAllSelected = {};

indicate("Initializing Telemetry...");

$(function() { Telemetry.init(function() {
  gFilters = {
    "application":  $("#filter-product"),
    "os":           $("#filter-os"),
    "architecture": $("#filter-arch"),
    "e10sEnabled":  $("#filter-e10s"),
    "processType":  $("#filter-process-type"),
  };
  gInitialPageState = loadStateFromUrlAndCookie();

  // Set up settings selectors
  $("#aggregates").multiselect("select", gInitialPageState.aggregates);
  selectSetOptions($("#min-channel-version, #max-channel-version"), Telemetry.getVersions().map(function(version) { return [version, version] }));
  if (gInitialPageState.min_channel_version) { selectSetSelected($("#min-channel-version"), gInitialPageState.min_channel_version); }
  if (gInitialPageState.max_channel_version) { selectSetSelected($("#max-channel-version"), gInitialPageState.max_channel_version); }
  $("#build-time-toggle").prop("checked", gInitialPageState.use_submission_date !== 0);
  $("#sanitize-toggle").prop("checked", gInitialPageState.sanitize !== 0);
  $("#sanitize-toggle").prop("checked", gInitialPageState.sanitize !== 0);

  indicate("Updating filters...");
  updateOptions(function(filterOptions) {
    $("#filter-product").multiselect("select", gInitialPageState.product);
    if (gInitialPageState.os !== null) { $("#filter-os").multiselect("select", gInitialPageState.os); }
    else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }
    if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
    else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
    if (gInitialPageState.e10s !== null) { $("#filter-e10s").multiselect("select", gInitialPageState.e10s); }
    else { $("#filter-e10s").multiselect("selectAll", false).multiselect("updateButtonText"); }
    if (gInitialPageState.processType !== null) { $("#filter-process-type").multiselect("select", gInitialPageState.processType); }
    else { $("#filter-process-type").multiselect("selectAll", false).multiselect("updateButtonText"); }
    
    for (var filterName in gFilters) {
      var selector = gFilters[filterName];
      var selected = selector.val() || [], options = selector.find("option");
      gPreviousFilterAllSelected[selector.attr("id")] = selected.length === options.length;
    }
    
    $("#min-channel-version, #max-channel-version").change(function(e) {
      var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
      var versions = Telemetry.getVersions(fromVersion, toVersion);
      if (versions.length === 0) { // Invalid range selected, move other version selector
        if (e.target.id === "min-channel-version") { selectSetSelected($("#max-channel-version"), fromVersion); }
        else { selectSetSelected($("#min-channel-version"), toVersion); }
      }
      indicate("Updating versions...");
      updateOptions(function() { $("#measure").trigger("change"); });
    });
    $("#build-time-toggle, #sanitize-toggle, #aggregates, #measure, #filter-product, #filter-os, #filter-arch, #filter-e10s, #filter-process-type").change(function(e) {
      var $this = $(this);
      if (gFilterChangeTimeout !== null) { clearTimeout(gFilterChangeTimeout); }
      gFilterChangeTimeout = setTimeout(function() { // Debounce the changes to prevent rapid filter changes from causing too many updates
        // If options (but not all options) were deselected when previously all options were selected, invert selection to include only those deselected
        var selected = $this.val() || [], options = $this.find("option");
        if (selected.length !== options.length && selected.length > 0 && gPreviousFilterAllSelected[$this.attr("id")]) {
          var nonSelectedOptions = options.map(function(i, option) { return option.getAttribute("value"); }).toArray()
            .filter(function(filterOption) { return selected.indexOf(filterOption) < 0; });
          $this.multiselect("deselectAll").multiselect("select", nonSelectedOptions);
        }
        gPreviousFilterAllSelected[$this.attr("id")] = selected.length === options.length; // Store state
        
        calculateEvolutions(function(lines, submissionLines, evolutionDescription) {
          $("#submissions-title").text($("#measure").val() + " submissions");
          $("#measure-description").text(evolutionDescription === null ? $("#measure").val() : evolutionDescription);
          displayEvolutions(lines, submissionLines);
          saveStateToUrlAndCookie();
        });
      });
    });
    
    // Perform a full display refresh
    $("#measure").trigger("change");
  });
  
  // Switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin + window.location.pathname.replace(/evo\.html$/, "dist.html") + window.location.hash;
  $("#switch-views").attr("href", dashboardURL);
}); });

function updateOptions(callback) {
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var versions = Telemetry.getVersions(fromVersion, toVersion);
  var versionCount = 0;
  var optionsMap = {};
  versions.forEach(function(channelVersion) { // Load combined measures for all the versions
    var parts = channelVersion.split("/"); //wip: clean this up
    Telemetry.getFilterOptions(parts[0], parts[1], function(filterOptions) {
      // Combine options
      for (var filterName in filterOptions) {
        if (!optionsMap.hasOwnProperty(filterName)) { optionsMap[filterName] = []; }
        optionsMap[filterName] = optionsMap[filterName].concat(filterOptions[filterName]);
      }
      
      versionCount ++;
      if (versionCount === versions.length) { // All versions are loaded
        selectSetOptions($("#measure"), getHumanReadableOptions("measure", deduplicate(optionsMap.metric)));
        selectSetSelected($("#measure"), gInitialPageState.measure);

        multiselectSetOptions($("#filter-product"), getHumanReadableOptions("product", deduplicate(optionsMap.application)));
        multiselectSetOptions($("#filter-os"), getHumanReadableOptions("os", deduplicate(optionsMap.os)));
        multiselectSetOptions($("#filter-arch"), getHumanReadableOptions("arch", deduplicate(optionsMap.architecture)));
        multiselectSetOptions($("#filter-e10s"), getHumanReadableOptions("e10s", deduplicate(optionsMap.e10sEnabled)));
        multiselectSetOptions($("#filter-process-type"), getHumanReadableOptions("processType", deduplicate(optionsMap.child)));
        if (callback !== undefined) { callback(); }
      }
    });
  });
  if (versions.length == 0) { // All versions are loaded
    selectSetOptions($("#measure"), []);
    if (callback !== undefined) { callback(); }
    return;
  }
}

function calculateEvolutions(callback) {
  // Get selected version, measure, and aggregate options
  var channelVersions = Telemetry.getVersions($("#min-channel-version").val(), $("#max-channel-version").val());
  var measure = $("#measure").val();
  var aggregates = $("#aggregates").val() || [];

  // Obtain a mapping from filter names to filter options
  var filterSets = getFilterSets(gFilters);

  var lines = [], submissionLines = [];
  var versionCount = 0;
  var evolutionDescription = null;
  channelVersions.forEach(function(channelVersion) {
    var parts = channelVersion.split("/"); //wip: fix this
    getHistogramEvolutionLines(parts[0], parts[1], measure, aggregates, filterSets, $("#sanitize-toggle").prop("checked"), $("#build-time-toggle").prop("checked"), function(newLines, newSubmissionLines, newDescription) {
      lines = lines.concat(newLines);
      submissionLines = submissionLines.concat(newSubmissionLines);
      evolutionDescription = evolutionDescription || newDescription
      versionCount ++;
      if (versionCount === channelVersions.length) { // Check if lines were loaded for all the versions
        callback(lines, submissionLines, evolutionDescription);
      }
    });
  });
}

function getHistogramEvolutionLines(channel, version, measure, aggregates, filterSets, sanitize, useSubmissionDate, callback) {
  var aggregateSelector = {
    "mean":            function(evolution) { return evolution.means(); },
    "5th-percentile":  function(evolution) { return evolution.percentiles(5); },
    "25th-percentile": function(evolution) { return evolution.percentiles(25); },
    "median":          function(evolution) { return evolution.percentiles(50); },
    "75th-percentile": function(evolution) { return evolution.percentiles(75); },
    "95th-percentile": function(evolution) { return evolution.percentiles(95); },
    "submissions":     function(evolution) { return evolution.submissions(); },
  };

  var filtersCount = 0;
  var lines = [];
  var finalEvolution = null;
  indicate("Updating evolution for " + channel + " " + version + "... 0%");
  filterSets.forEach(function(filterSet) {
    Telemetry.getEvolution(channel, version, measure, filterSet, useSubmissionDate, function(evolution) {
      filtersCount ++;
      indicate("Updating evolution for " + channel + " " + version + "... " + Math.round(100 * filtersCount / filterSets.length) + "%");
      if (finalEvolution === null) {
        finalEvolution = evolution;
      } else if (evolution !== null) {
        finalEvolution = finalEvolution.combine(evolution);
      }
      if (filtersCount === filterSets.length) { // Check if we have loaded all the needed filters
        indicate();
        if (finalEvolution === null) { // No evolutions available
          callback([], [], measure);
          return;
        }
        
        // Obtain the X and Y values of points
        var aggregateValues = aggregates.map(function(aggregate) {
          return aggregateSelector[aggregate](finalEvolution);
        });
        var submissionValues = finalEvolution.submissions();
        var dates = finalEvolution.dates();
        
        // Filter out those points corresponding to histograms where the number of submissions is too low
        var submissionsCutoff = sanitize ? Math.max(Math.max.apply(Math, submissionValues) / 100, 100) : 0;
        var timeCutoff = moment().add(1, "years").toDate(); // Cut off all dates past one year in the future
        var finalAggregateValues = aggregateValues.map(function(values) { return []; }), finalSubmissionValues = [];
        dates.forEach(function(date, i) {
          if (submissionValues[i] < submissionsCutoff) { return; }
          if (date > timeCutoff) { return; }
          finalAggregateValues.forEach(function(values, j) { values.push({x: date.getTime(), y: aggregateValues[j][i]}); });
          finalSubmissionValues.push({x: date.getTime(), y: submissionValues[i]});
        });
        
        // Create line objects
        var aggregateLines = finalAggregateValues.map(function(values, i) {
          return new Line(measure, channel + "/" + version, aggregates[i], values);
        });
        var submissionLines = [new Line(measure, channel + "/" + version, "submissions", finalSubmissionValues)];
        
        callback(aggregateLines, submissionLines, finalEvolution !== null ? finalEvolution.description : null);
      }
    });
  });
  if (filterSets.length === 0) {
    indicate();
    callback([], [], measure);
  }
}

function displayEvolutions(lines, submissionLines, minDate, maxDate) {
  minDate = minDate || null; maxDate = maxDate || null;

  // filter out empty lines
  lines = lines.filter(function(line) { return line.values.length > 0; });
  submissionLines = submissionLines.filter(function(line) { return line.values.length > 0; });
  
  // Transform the data into a form that is suitable for plotting
  var lineData = lines.map(function (line) {
    var dataset = line.values.map(function(point) { return {date: new Date(point.x), value: point.y}; });
    dataset.push(dataset[dataset.length - 1]); // duplicate the last point to work around a metricsgraphics bug if there are multiple datasets where one or more datasets only have one point
    return dataset;
  });
  var submissionLineData = submissionLines.map(function (line) {
    var dataset = line.values.map(function(point) { return {date: new Date(point.x), value: point.y}; });
    dataset.push(dataset[dataset.length - 1]); // duplicate the last point to work around a metricsgraphics bug if there are multiple datasets where one or more datasets only have one point
    return dataset;
  });
  var aggregateLabels = lines.map(function(line) { return line.aggregate; })
  
  var aggregateMap = {};
  lines.forEach(function(line) { aggregateMap[line.aggregate] = true; });
  var valueLabel = Object.keys(aggregateMap).sort().join(", ") + " " + (lines.length > 0 ? lines[0].measure : "");
  
  var markers = [], usedDates = {};
  lines.forEach(function(line) {
    var minDate = Math.min.apply(Math, line.values.map(function(point) { return point.x; }));
    usedDates[minDate] = usedDates.hasOwnProperty(minDate) ? usedDates[minDate] + ", " + line.getVersionString() : line.getVersionString();
  });
  for (var date in usedDates) {
    markers.push({date: new Date(parseInt(date) + 1), label: usedDates[date]}); // Need to add 1ms because the leftmost marker won't show up otherwise
  }

  // Plot the data using MetricsGraphics
  d3.select("#evolutions .active-datapoint-background").remove(); // Remove old background
  MG.data_graphic({
    data: lineData,
    chart_type: lineData.length == 0 || lineData[0].length === 0 ? "missing-data" : "line",
    full_width: true, height: 600,
    right: 100, bottom: 50, // Extra space on the right and bottom for labels
    target: "#evolutions",
    x_extended_ticks: true,
    x_label: "Build ID", y_label: valueLabel,
    transition_on_update: false,
    interpolate: "linear",
    markers: markers, legend: aggregateLabels,
    aggregate_rollover: true,
    linked: true,
    min_x: minDate === null ? null : new Date(minDate),
    max_x: maxDate === null ? null : new Date(maxDate),
    mouseover: function(d, i) {
      var date, rolloverCircle, lineList, values;
      if (d.values) {
        date = d.values[0].date;
        rolloverCircle = $("#evolutions .mg-line-rollover-circle.mg-line" + d.values[0].line_id + "-color").get(0);
        var seen = {}; var entries = d.values.filter(function(entry) {
          if (seen[entry.line_id]) return false;
          seen[entry.line_id] = true; return true;
        });
        lineList = entries.map(function(entry) { return lines[entry.line_id - 1]; });
        values = entries.map(function(entry) { return entry.value; });
      } else {
        date = d.date;
        rolloverCircle = $("#evolutions .mg-line-rollover-circle").get(0);
        lineList = [lines[d.line_id - 1]];
        values = [d.value];
      }
      var legend = d3.select("#evolutions .mg-active-datapoint").text(moment(date).format("MMM D, YYYY") + " (build " + moment(date).format("YYYYMMDD") + "):").style("fill", "white");
      var lineHeight = 1.1;
      lineList.forEach(function(line, i) {
        var lineIndex = i + 1;
        var label = legend.append("tspan").attr({x: 0, y: (lineIndex * lineHeight) + "em"}).text(line.getDescriptionString() + ": " + formatNumber(values[i]));
        legend.append("tspan").attr({x: -label.node().getComputedTextLength(), y: (lineIndex * lineHeight) + "em"})
          .text("\u2014 ").style({"font-weight": "bold", "stroke": line.color});
      });
      
      // Reposition element
      var x = parseInt(rolloverCircle.getAttribute("cx")) + 20, y = 40;
      var bbox = legend[0][0].getBBox();
      if (x + bbox.width + 50 > $("#evolutions svg").width()) x -= bbox.width + 40;
      d3.select("#evolutions .mg-active-datapoint-container").attr("transform", "translate(" + (x + bbox.width) + "," + (y + 15) + ")");
      
      // Add background
      var padding = 10;
      d3.select("#evolutions .active-datapoint-background").remove(); // Remove old background
      d3.select("#evolutions svg").insert("rect", ".mg-active-datapoint-container").classed("active-datapoint-background", true)
        .attr("x", x - padding).attr("y", y)
        .attr("width", bbox.width + padding * 2).attr("height", bbox.height + 8)
        .attr("rx", "3").attr("ry", "3").style("fill", "#333");
    },
    mouseout: function(d, i) {
      d3.select("#evolutions .active-datapoint-background").remove(); // Remove old background
    },
  });
  d3.select("#submissions .active-datapoint-background").remove(); // Remove old background
  MG.data_graphic({
    data: submissionLineData,
    chart_type: submissionLineData.length === 0 || submissionLineData[0].length === 0 ? "missing-data" : "line",
    full_width: true, height: 300,
    right: 100, bottom: 50, // Extra space on the right and bottom for labels
    target: "#submissions",
    x_extended_ticks: true,
    x_label: "Build ID", y_label: "Daily Ping Count",
    transition_on_update: false,
    interpolate: "linear",
    markers: markers,
    aggregate_rollover: true,
    linked: true,
    min_x: minDate === null ? null : new Date(minDate),
    max_x: maxDate === null ? null : new Date(maxDate),
    mouseover: function(d, i) {
      var date, rolloverCircle, lineList, values;
      if (d.values) {
        date = d.values[0].date;
        rolloverCircle = $("#submissions .mg-line-rollover-circle.mg-line" + d.values[0].line_id + "-color").get(0);
        var seen = {}; var entries = d.values.filter(function(entry) {
          if (seen[entry.line_id]) return false;
          seen[entry.line_id] = true; return true;
        });
        lineList = entries.map(function(entry) { return submissionLines[entry.line_id - 1]; });
        values = entries.map(function(entry) { return entry.value; });
      } else {
        date = d.date;
        rolloverCircle = $("#submissions .mg-line-rollover-circle").get(0);
        lineList = [submissionLines[d.line_id - 1]];
        values = [d.value];
      }
      var legend = d3.select("#submissions .mg-active-datapoint").text(moment(date).format("MMM D, YYYY") + " (build " + moment(date).format("YYYYMMDD") + "):").style("fill", "white");
      var lineHeight = 1.1;
      lineList.forEach(function(line, i) {
        var lineIndex = i + 1;
        var label = legend.append("tspan").attr({x: 0, y: (lineIndex * lineHeight) + "em"}).text(line.getDescriptionString() + ": " + formatNumber(values[i]));
        legend.append("tspan").attr({x: -label.node().getComputedTextLength(), y: (lineIndex * lineHeight) + "em"})
          .text("\u2014 ").style({"font-weight": "bold", "stroke": line.color});
      });
      
      // Reposition element
      var x = parseInt(rolloverCircle.getAttribute("cx")) + 20, y = 40;
      var bbox = legend[0][0].getBBox();
      if (x + bbox.width + 50 > $("#submissions svg").width()) x -= bbox.width + 40;
      d3.select("#submissions .mg-active-datapoint-container").attr("transform", "translate(" + (x + bbox.width) + "," + (y + 15) + ")");
      
      // Add background
      var padding = 10;
      d3.select("#submissions .active-datapoint-background").remove(); // Remove old background
      d3.select("#submissions svg").insert("rect", ".mg-active-datapoint-container").classed("active-datapoint-background", true)
        .attr("x", x - padding).attr("y", y)
        .attr("width", bbox.width + padding * 2).attr("height", bbox.height + 8)
        .attr("rx", "3").attr("ry", "3").style("fill", "#333");
    },
    mouseout: function(d, i) {
      d3.select("#submissions .active-datapoint-background").remove(); // Remove old background
    },
  });
  
  // Set the line colors
  lines.forEach(function(line, i) {
    var lineIndex = i + 1;
    $("#evolutions .mg-main-line.mg-line" + lineIndex + "-color").css("stroke", line.color);
    $("#evolutions .mg-area" + lineIndex + "-color, .mg-hover-line" + lineIndex + "-color").css("fill", line.color).css("stroke", line.color);
    $("#evolutions .mg-line" + lineIndex + "-legend-color").css("fill", line.color);
  });
  submissionLines.forEach(function(line, i) {
    var lineIndex = i + 1;
    $("#submissions .mg-main-line.mg-line" + lineIndex + "-color").css("stroke", line.color);
    $("#submissions .mg-area" + lineIndex + "-color, .mg-hover-line" + lineIndex + "-color").css("fill", line.color).css("stroke", line.color);
    $("#submissions .mg-line" + lineIndex + "-legend-color").css("fill", line.color);
  });
  
  // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .mg-year-marker text").attr("dy", "5");
  $(".mg-x-axis .label").attr("dy", "20");
  $(".mg-y-axis .label").attr("y", "10").attr("dy", "0");
  $(".mg-line-legend text").css("font-size", "12px")
  $(".mg-marker-text").css("font-size", "12px").attr("text-anchor", "start").attr("dy", "18").attr("dx", "5");
}

var Line = (function(){
  var lineColors = {};
  var goodColors = ["#FCC376", "#EE816A", "#5C8E6F", "#030303", "#93AE9F", "#E7DB8F", "#9E956A", "#FFB284", "#4BB4A3", "#32506C", "#77300F", "#C8B173"];
  var goodColorIndex = 0;
  var filterSortOrder = ["product", "OS", "osVersion", "arch"];

  function Line(measure, channelVersion, aggregate, values) {
    if (typeof measure !== "string") { throw "Bad measure value: must be string"; }
    if (typeof channelVersion !== "string") { throw "Bad channelVersion value: must be string"; }
    if (typeof aggregate !== "string") { throw "Bad aggregate value: must be string"; }
    if (!$.isArray(values)) { throw "Bad values value: must be array"; }
  
    this.measure = measure;
    this.channelVersion = channelVersion;
    this.aggregate = aggregate;
    this.values = values || [];
    
    // Assign a color to the line
    var stateString = this.getStateString();
    if (!lineColors.hasOwnProperty(stateString)) {
      goodColorIndex = (goodColorIndex + 1) % goodColors.length;
      lineColors[stateString] = goodColors[goodColorIndex];
    }
    this.color = lineColors[stateString];
  }

  Line.prototype.getVersionString = function Line_getVersionString() {
    return this.channelVersion.replace("/", " ");
  };
  Line.prototype.getTitleString = function Line_getTitleString() {
    return this.channelVersion.replace("/", " ") + " - " + this.aggregate;
  };
  Line.prototype.getDescriptionString = function Line_getTitleString() {
    if (this.aggregate === "submissions") { return this.measure + " submissions for " + this.channelVersion.replace("/", " "); }
    return this.aggregate + " " + this.measure + " for " + this.channelVersion.replace("/", " ");
  };
  Line.prototype.getStateString = function Line_getTitleString() {
    return this.aggregate + "/" + this.measure + "/" + this.channelVersion;
  };
  
  return Line;
})();

// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  var startDate = gInitialPageState.start_date, endDate = gInitialPageState.end_date;
  gInitialPageState = {
    aggregates: $("#aggregates").val() || [],
    measure: $("#measure").val(),
    min_channel_version: $("#min-channel-version").val(),
    max_channel_version: $("#max-channel-version").val(),
    product: $("#filter-product").val() || [],
    use_submission_date: $("#build-time-toggle").prop("checked") ? 1 : 0,
    sanitize: $("#sanitize-toggle").prop("checked") ? 1 : 0,
  };
  
  // Save a few unused properties that are used in the distribution dashboard, since state is shared between the two dashboards
  if (startDate !== undefined) { gInitialPageState.start_date = startDate; }
  if (endDate !== undefined) { gInitialPageState.end_date = endDate; }
  
  // Only store these in the state if they are not all selected
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) { gInitialPageState.arch = selected; }
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) { gInitialPageState.os = selected; }
  var selected = $("#filter-os-version").val() || [];
  if (selected.length !== $("#filter-os-version option").size()) { gInitialPageState.os_version = selected; }
  
  var fragments = [];
  $.each(gInitialPageState, function(k, v) {
    if ($.isArray(v)) { v = v.join("!"); }
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
