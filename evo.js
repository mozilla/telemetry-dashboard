var gInitialPageState = {};
var gMeasureMap = null, gVersionMeasureMap = null;
var gFilterChangeTimeout = null;
var gFilters = null, gPreviousFilterAllSelected = {};

indicate("Initializing Telemetry...");

Telemetry.init(function() {
  gFilters = {
    "product":    $("#filter-product"),
    "os_version": $("#filter-os"),
    "arch":       $("#filter-arch"),
  };
  gInitialPageState = loadStateFromUrlAndCookie();
  
  // Set up settings selectors
  $("#aggregates").multiselect("select", gInitialPageState.aggregates);
  multiselectSetOptions($("#min-channel-version, #max-channel-version"), getHumanReadableOptions("channelVersion", Telemetry.versions()));
  
  if (gInitialPageState.min_channel_version) { $("#min-channel-version").multiselect("select", gInitialPageState.min_channel_version); }
  if (gInitialPageState.max_channel_version) { $("#max-channel-version").multiselect("select", gInitialPageState.max_channel_version); }
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var versions = Telemetry.versions().filter(function(v) { return fromVersion <= v && v <= toVersion; });
  if (versions.length === 0) { $("#min-channel-version").multiselect("select", toVersion); }// Invalid range selected, move min version selector
  $("input[name=build-time-toggle][value=" + (gInitialPageState.use_submission_date !== 0 ? 1 : 0) + "]").prop("checked", true).trigger("change");
  $("input[name=sanitize-toggle][value=" + (gInitialPageState.sanitize !== 0 ? 1 : 0) + "]").prop("checked", true).trigger("change");
  
  updateMeasuresList(function() {
    calculateHistogramEvolutions(function(filterList, filterOptionsList, lines, submissionLines) {
      refreshFilters(filterList, filterOptionsList);
      
      $("#filter-product").multiselect("select", gInitialPageState.product);
      if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
      else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
      if (gInitialPageState.os !== null) { $("#filter-os").multiselect("select", gInitialPageState.os); }
      else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }
      
      for (var filterName in gFilters) {
        var selector = gFilters[filterName];
        var selected = selector.val() || [], options = selector.find("option");
        gPreviousFilterAllSelected[selector.attr("id")] = selected.length === options.length;
      }
      
      $("#min-channel-version, #max-channel-version").change(function(e) {
        var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
        var versions = Telemetry.versions().filter(function(v) { return fromVersion <= v && v <= toVersion; });
        if (versions.length === 0) {
          if (e.target.id === "min-channel-version") { $("#max-channel-version").multiselect("select", fromVersion); }
          else { $("#min-channel-version").multiselect("select", toVersion); }
        }
        updateMeasuresList(function() { $("#measure").trigger("change"); });
      });
      $("#measure").change(function() {
        // Update the measure description
        var measure = $("#measure").val();
        var measureEntry = gMeasureMap[measure];
        $("#measure-description").text(measureEntry.description + " (" + measure + ")");
        $("#submissions-title").text(measure + " submissions");
        
        // Figure out which aggregates actually apply to this measure
        var options;
        if (measureEntry.kind == "linear" || measureEntry.kind == "exponential") {
          options = [["median", "Median"], ["mean", "Mean"], ["5th-percentile", "5th Percentile"], ["25th-percentile", "25th Percentile"], ["75th-percentile", "75th Percentile"], ["95th-percentile", "95th Percentile"]]
        } else {
          options = [["submissions", "Submissions"]];
        }
        
        // Set the new aggregate options that apply to the current measure
        multiselectSetOptions($("#aggregates"), options, gInitialPageState.aggregates || [options[0][0]])
        $("#aggregates").trigger("change");
      });
      $("input[name=build-time-toggle], input[name=sanitize-toggle], #aggregates, #filter-product, #filter-arch, #filter-os").change(function(e) {
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
        
          calculateHistogramEvolutions(function(filterList, filterOptionsList, lines, submissionLines) {
            refreshFilters(filterList, filterOptionsList);
            
            displayEvolutions(lines, submissionLines, null, null, $("input[name=build-time-toggle]:checked").val() !== "0");
            saveStateToUrlAndCookie();
          });
        }, 0);
      });
      
      // Perform a full display refresh
      $("#measure").trigger("change");
    });
  });

  $("#advanced-settings").on("shown.bs.collapse", function () {
    $(this).get(0).scrollIntoView({behavior: "smooth"}); // Scroll the advanced settings into view when opened
  });
});

function updateMeasuresList(callback) {
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var versions = Telemetry.versions().filter(function(v) { return fromVersion <= v && v <= toVersion; });
  var versionCount = 0;
  gMeasureMap = {}; gVersionMeasureMap = {};
  if (versions.length == 0) { // All versions are loaded
    multiselectSetOptions($("#measure"), []);
    if (callback !== undefined) { callback(); }
    return
  }
  
  indicate("Updating measures... 0%");
  versions.forEach(function(channelVersion) { // Load combined measures for all the versions
    Telemetry.measures(channelVersion, function(measures) {
      versionCount ++;
      indicate("Updating measures... " + Math.round(100 * versionCount / versions.length) + "%");
      Object.keys(measures).filter(function(measure) {
        return !measure.startsWith("STARTUP_"); // Ignore STARTUP_* histograms since nobody ever uses them
      }).forEach(function(measure) {
        gMeasureMap[measure] = measures[measure];
        gVersionMeasureMap[channelVersion] = measures;
      });
      if (versionCount === versions.length) { // All versions are loaded
        indicate();
        var measuresList = Object.keys(gMeasureMap).sort();
        multiselectSetOptions($("#measure"), getHumanReadableOptions("measure", measuresList));
        $("#measure").multiselect("select", gInitialPageState.measure);
        if (callback !== undefined) { callback(); }
      }
    });
  });
}

function refreshFilters(filterList, filterOptionsList) {
  // Remove duplicate filter values
  var optionsList = filterOptionsList.map(function(options) {
    var seen = {};
    return options.filter(function(option) {
      if (seen.hasOwnProperty(option[0])) { return false; }
      seen[option[0]] = true;
      return true;
    });
  });
  
  multiselectSetOptions($("#filter-product"), optionsList[1]);
  multiselectSetOptions($("#filter-os"), optionsList[3]);
  multiselectSetOptions($("#filter-arch"), optionsList[4]);
}

function calculateHistogramEvolutions(callback) {
  // Get selected version, measure, and aggregate options
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var measure = $("#measure").val(); // Handle the special case for measures, added in getHumanReadableOptions
  var aggregates = $("#aggregates").val() || [];
  var evolutionLoader = $("input[name=build-time-toggle]:checked").val() !== "0" ? Telemetry.loadEvolutionOverTime : Telemetry.loadEvolutionOverBuilds;
  
  // Obtain a mapping from filter names to filter options
  var filters = {};
  for (var filterName in gFilters) {
    var filterSelector = $(gFilters[filterName]);
    var selection = filterSelector.val() || [];
    var optionCount = filterSelector.find("option").length - 1; // Number of options, minus the "Select All" option
    if (selection.length != optionCount) { // Not all options are selected
      filters[filterName] = selection;
    }
  }
  
  // Handle the special case for the OS selector
  filters.os = deduplicate(filters.os_version.map(function(version) { return version.split(",")[0]; }));
  filters.os_version = filters.os_version.map(function(version) { return version.split(",")[1] });
  
  filterList = [
    ["saved_session"],                                                   // "reason" filter
    filters.hasOwnProperty("product") ? filters["product"] : null,       // "product" filter
    filters.hasOwnProperty("os") ? filters["os"] : null,                 // "os" filter
    filters.hasOwnProperty("os_version") ? filters["os_version"] : null, // "os_version" filter
    filters.hasOwnProperty("arch") ? filters["arch"] : null,             // "arch" filter
  ];
  for (var i = filterList.length - 1; i >= 0; i --) { // Remove unnecessary filters - trailing null entries in the filter list
    if (filterList[i] !== null) { break; }
    filterList.pop();
  }

  var versions = Telemetry.versions().filter(function(v) { return fromVersion <= v && v <= toVersion; });
  if (versions.length > 10) { versions = versions.slice(0, 10); } // Only show up to 10 versions for performance reasons
  
  // Exclude those versions that don't actually have the measure - a measure may be selectable but nonexistant if it exists in some other version, so we just ignore this version if it doesn't have that measure
  versions = versions.filter(function(channelVersion) { return gVersionMeasureMap[channelVersion][measure] !== undefined; });
  
  var lines = [];
  var submissionLines = [];
  var expectedCount = versions.length * aggregates.length;
  var filterOptionsList = []; // Each entry is an array of options for a particular filter
  indicate("Updating evolutions... 0%");
  versions.forEach(function(version) {
    evolutionLoader(version, measure, function(histogramEvolution) {
      indicate("Updating evolutions... " + Math.round(100 * lines.length / expectedCount) + "%");
    
      // Update filter options
      var versionOptionsList = getOptions(filterList, histogramEvolution);
      while (filterOptionsList.length < versionOptionsList.length) { filterOptionsList.push([]); }
      filterOptionsList = filterOptionsList.map(function(options, i) {
        return options.concat(versionOptionsList[i]);
      });
      
      var newLines = getHistogramEvolutionLines(version, measure, histogramEvolution, aggregates, filterList, $("input[name=sanitize-toggle]:checked").val() !== "0");
      lines = lines.concat(newLines.lines);
      submissionLines.push(newLines.submissionLine);
      if (lines.length === expectedCount) { // Check if we have loaded all the needed versions
        indicate();
        callback(filterList, filterOptionsList, lines, submissionLines);
      }
    });
  });
}

function getHistogramEvolutionLines(version, measure, histogramEvolution, aggregates, filterList, sanitize) {
  sanitize = sanitize === undefined ? true : sanitize;

  // Repeatedly apply filters to each evolution to get a new list of filtered evolutions
  var evolutions = [histogramEvolution];
  filterList.forEach(function(options, i) {
    if (evolutions.length === 0) { return; } // No more evolutions, probably because a filter had no options selected
    evolutions = [].concat.apply([], evolutions.map(function(evolution) {
      var actualOptions = options, fullOptions = evolution.filterOptions();
      if (actualOptions === null) { actualOptions = fullOptions; }
      actualOptions = actualOptions.filter(function(option) { return fullOptions.indexOf(option) >= 0 });
      return actualOptions.map(function(option) { return evolution.filter(option); });
    }));
  });

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
  var aggregateValue = {
    "mean":            function(histogram) { return histogram.mean(); },
    "5th-percentile":  function(histogram) { return histogram.percentile(5); },
    "25th-percentile": function(histogram) { return histogram.percentile(25); },
    "median":          function(histogram) { return histogram.median(); },
    "75th-percentile": function(histogram) { return histogram.percentile(75); },
    "95th-percentile": function(histogram) { return histogram.percentile(95); },
    "submissions":     function(histogram) { return histogram.submissions(); },
  };
  var aggregatePoints = {};
  var submissionPoints = [];
  aggregates.forEach(function(aggregate) { aggregatePoints[aggregate] = []; });
  var timeCutoff = moment().add(1, "years").toDate().getTime(); // Cut off all dates past one year in the future
  var maxSubmissions = 0, submissionCounts = [];
  Object.keys(dateDatasets).sort().forEach(function(timestamp) {
    timestamp = parseInt(timestamp);
    
    if (timestamp > timeCutoff) { return; } // point past the cutoff date
    
    // Create a histogram that has no filters and contains the combined dataset
    var dataset = dateDatasets[timestamp];
    var histogram = new Telemetry.Histogram(measure, histogramEvolution._filter_path, firstHistogram._buckets, dataset, histogramEvolution._filter_tree, firstHistogram._spec);
    
    // Obtain the aggregate values from the histogram
    aggregates.forEach(function(aggregate) {
      aggregatePoints[aggregate].push({x: timestamp, y: aggregateValue[aggregate](histogram)});
    });
    
    // Process submission points
    var submissions = histogram.submissions();
    submissionPoints.push({x: timestamp, y: submissions});
    if (sanitize) {
      if (submissions > maxSubmissions) { maxSubmissions = submissions; }
      submissionCounts.push(submissions);
    }
  });
  
  // Filter out those points corresponding to histograms where the number of submissions is too low
  var submissionsCutoff = 0;
  if (sanitize) {
    submissionsCutoff = Math.max(maxSubmissions / 100, 100);
    for (aggregate in aggregatePoints) {
      aggregatePoints[aggregate] = aggregatePoints[aggregate].filter(function(point, i) {
        return submissionCounts[i] >= submissionsCutoff;
      });
    }
    submissionPoints = submissionPoints.filter(function(point, i) {
      return submissionCounts[i] >= submissionsCutoff;
    });
  }
  
  // Generate lines from the points for each aggregate
  var lines = [];
  for (aggregate in aggregatePoints) {
    var newLine = new Line(measure, version, aggregate, aggregatePoints[aggregate]);
    newLine.histogramEvolution = histogramEvolution;
    lines.push(newLine);
  }
  
  var submissionLine = new Line(measure, version, "submissions", submissionPoints);
  submissionLine.histogramEvolution = histogramEvolution;
  
  return {lines: lines, submissionLine: submissionLine};
}

function displayEvolutions(lines, submissionLines, minDate, maxDate, useSubmissionDate) {
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
    usedDates[minDate] = usedDates[minDate] || [];
    if (usedDates[minDate].indexOf(line.getVersionString()) < 0) { usedDates[minDate].push(line.getVersionString()); }
  });
  for (var date in usedDates) {
    markers.push({date: new Date(parseInt(date) + 1), label: usedDates[date].join(", ")}); // Need to add 1ms because the leftmost marker won't show up otherwise
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
      var legendLabel = moment(date).format("MMM D, YYYY") + (useSubmissionDate ? ":" : " (build " + moment(date).format("YYYYMMDD") + "):");
      var legend = d3.select("#evolutions .mg-active-datapoint").text(legendLabel).style("fill", "white");
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
      var legendLabel = moment(date).format("MMM D, YYYY") + (useSubmissionDate ? ":" : " (build " + moment(date).format("YYYYMMDD") + "):");
      var legend = d3.select("#submissions .mg-active-datapoint").text(legendLabel).style("fill", "white");
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
  $(".mg-markers line").css("stroke-width", "2px");
}

var Line = (function(){
  var lineColors = {};
  var goodColors = ["#FCC376", "#EE816A", "#5C8E6F", "#030303", "#93AE9F", "#E7DB8F", "#9E956A", "#FFB284", "#4BB4A3", "#32506C", "#77300F", "#C8B173"];
  var goodColorIndex = 0;

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
  var startDate = gInitialPageState.start_date, endDate = gInitialPageState.end_date, cumulative = gInitialPageState.cumulative;
  gInitialPageState = {
    aggregates: $("#aggregates").val() || [],
    measure: $("#measure").val(),
    min_channel_version: $("#min-channel-version").val(),
    max_channel_version: $("#max-channel-version").val(),
    product: $("#filter-product").val() || [],
    use_submission_date: $("input[name=build-time-toggle]:checked").val() !== "0" ? 1 : 0,
    sanitize: $("input[name=sanitize-toggle]:checked").val() !== "0" ? 1 : 0,
  };
  
  // Save a few unused properties that are used in the distribution dashboard, since state is shared between the two dashboards
  if (endDate !== undefined) { gInitialPageState.end_date = endDate; }
  if (startDate !== undefined) { gInitialPageState.start_date = startDate; }
  if (cumulative !== undefined) { gInitialPageState.cumulative = cumulative; }
  
  // Only store these in the state if they are not all selected
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) { gInitialPageState.arch = selected; }
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) { gInitialPageState.os = selected; }
  
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
  if (url !== stateString) { window.location.replace(window.location.origin + window.location.pathname + "#" + stateString); }
  
  // Save the state in a cookie that expires in 3 days
  var expiry = new Date();
  expiry.setTime(expiry.getTime() + (3 * 24 * 60 * 60 * 1000));
  document.cookie = "stateFromUrl=" + stateString + "; expires=" + expiry.toGMTString();
  
  // Add link to switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin + window.location.pathname.replace(/evo\.html$/, "dist.html") + window.location.hash;
  $("#switch-views").attr("href", dashboardURL);
}
