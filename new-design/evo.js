var gVersions = null;
var gMeasureMap = null;
var gInitialPageState = null;

Telemetry.init(function() {
  gVersions = Telemetry.versions();

  loadStateFromUrlAndCookie();
  
  // Set up aggregate, build, and measure selectors
  $("#aggregates").multiselect("select", gInitialPageState.aggregates);
  selectSetOptions($("#min-channel-version, #max-channel-version"), gVersions.map(function(version) { return [version, version.replace("/", " ")] }));
  if (gInitialPageState.min_channel_version) { $("#min-channel-version").select2("val", gInitialPageState.min_channel_version); }
  if (gInitialPageState.max_channel_version) { $("#max-channel-version").select2("val", gInitialPageState.max_channel_version); }
  updateMeasuresList(function() {
    calculateHistogramEvolutions(function(filterList, filterOptionsList, lines, submissionLines) {
      refreshFilters(filterList, filterOptionsList);
      
      $("#filter-product").multiselect("select", gInitialPageState.product);
      if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
      else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
      if (gInitialPageState.os !== null) { $("#filter-os").multiselect("select", gInitialPageState.os); }
      else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }
      if (gInitialPageState.os_version !== null) { $("#filter-os-version").multiselect("select", gInitialPageState.os_version); }
      else { $("#filter-os-version").multiselect("selectAll", false).multiselect("updateButtonText"); }
      
      $("#min-channel-version, #max-channel-version").change(function(e) {
        var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
        var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
        if (versions.length === 0) {
          if (e.target.id === "min-channel-version") { $("#max-channel-version").select2("val", fromVersion); }
          else { $("#min-channel-version").select2("val", toVersion); }
        }
        updateMeasuresList(function() { $("#measure").trigger("change"); });
      });
      $("#measure").change(function() {
        // Update the measure description
        var measure = $(this).val();
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
      $("#aggregates, #filter-product, #filter-arch, #filter-os, #filter-os-version").change(function(e) {
        calculateHistogramEvolutions(function(filterList, filterOptionsList, lines, submissionLines) {
          refreshFilters(filterList, filterOptionsList);
          
          // If the OS was changed, select all the OS versions
          if (e.target.id == "filter-os") { $("#filter-os-version").multiselect("selectAll", false).multiselect("updateButtonText"); }
          
          displayHistogramEvolutions(lines, submissionLines);
          saveStateToUrlAndCookie();
        });
      });
      
      // Perform a full display refresh
      $("#measure").trigger("change");
    });
  });
  
  // Switch to the evolution dashboard with the same settings
  $("#switch-views").click(function() {
    var evolutionURL = window.location.origin + window.location.pathname.replace(/evo\.html$/, "dist.html") + window.location.hash;
    window.location.href = evolutionURL;
  });
  
  // Obtain a short permalink to the current page
  $("#permalink-value").hide().focus(function() {
    // Workaround for broken selection: http://stackoverflow.com/questions/5797539
    var $this = $(this);
    $this.select().mouseup(function() { $this.unbind("mouseup"); return false; });
  });
  $("#get-permalink").click(function() {
    $.ajax({
      url: "https://api-ssl.bitly.com/shorten", dataType: "jsonp",
      data: {longUrl: window.location.href, access_token: "48ecf90304d70f30729abe82dfea1dd8a11c4584", format: "json"},
      success: function(response) {
        var longUrl = Object.keys(response.results)[0];
        var shortUrl = response.results[longUrl].shortUrl;
        $("#permalink-value").show().val(shortUrl).focus();
      }
    });
  });
});

function updateMeasuresList(callback) {
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
  var versionCount = 0;
  gMeasureMap = {};
  if (versions.length == 0) { // All versions are loaded
    selectSetOptions($("#measure"), []);
    if (callback !== undefined) { callback(); }
    return
  }
  versions.forEach(function(channelVersion) { // Load combined measures for all the versions
    Telemetry.measures(channelVersion, function(measures) {
      versionCount ++;
      Object.keys(measures).filter(function(measure) {
        return !measure.startsWith("STARTUP_"); // Ignore STARTUP_* histograms since nobody ever uses them
      }).forEach(function(measure) { gMeasureMap[measure] = measures[measure]; });
      if (versions.length === versionCount) { // All versions are loaded
        var measureList = Object.keys(gMeasureMap).sort().map(function(measure) { return [measure, measure] });
        selectSetOptions($("#measure"), measureList);
        $("#measure").select2("val", gInitialPageState.measure);
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
  multiselectSetOptions($("#filter-os"), optionsList[2]);
  multiselectSetOptions($("#filter-os-version"), optionsList[3]);
  multiselectSetOptions($("#filter-arch"), optionsList[4]);
}

function calculateHistogramEvolutions(callback) {
  // Get selected version, measure, and aggregate options
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var measure = $("#measure").val();
  var aggregates = $("#aggregates").val() || [];
  
  // Obtain a mapping from filter names to filter options
  var filters = {};
  var filterMapping = {
    "product":    $("#filter-product"),
    "arch":       $("#filter-arch"),
    "os":         $("#filter-os"),
    "os_version": $("#filter-os-version"),
  };
  for (var filterName in filterMapping) {
    var filterSelector = $(filterMapping[filterName]);
    var selection = filterSelector.val() || [];
    var optionCount = filterSelector.find("option").length - 1; // Number of options, minus the "Select All" option
    if (selection.length != optionCount) { // Not all options are selected
      filters[filterName] = selection;
    }
  }
  filterList = [
    ["saved_session"],                                        // "reason" filter
    ("product" in filters) ? filters["product"] : null,       // "product" filter
    ("os" in filters) ? filters["os"] : null,                 // "os" filter
    ("os_version" in filters) ? filters["os_version"] : null, // "os_version" filter
    ("arch" in filters) ? filters["arch"] : null,             // "arch" filter
  ];
  for (var i = filterList.length - 1; i >= 0; i --) { // Remove unnecessary filters - trailing null entries in the filter list
    if (filterList[i] !== null) { break; }
    filterList.pop();
  }

  var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
  if (versions.length > 10) { versions = versions.slice(0, 10); } // Only show up to 10 versions for performance reasons
  var lines = [];
  var submissionLines = [];
  var expectedCount = versions.length * aggregates.length;
  var filterOptionsList = []; // Each entry is an array of options for a particular filter
  versions.forEach(function(version) {
    Telemetry.loadEvolutionOverBuilds(version, measure, function(histogramEvolution) {
      // Update filter options
      var versionOptionsList = getOptions(filterList, histogramEvolution);
      while (filterOptionsList.length < versionOptionsList.length) { filterOptionsList.push([]); }
      filterOptionsList = filterOptionsList.map(function(options, i) {
        return options.concat(versionOptionsList[i]);
      });
      
      var newLines = getHistogramEvolutionLines(version, measure, histogramEvolution, aggregates, filters, filterList);
      lines = lines.concat(newLines.lines);
      submissionLines.push(newLines.submissionLine);
      if (lines.length === expectedCount) { // Check if we have loaded all the needed versions
        callback(filterList, filterOptionsList, lines, submissionLines);
      }
    });
  });
}

function getOptions(filterList, histogramEvolution) {
  function getCombinedFilterTree(histogramEvolution) {
    var fullOptions = histogramEvolution.filterOptions(), filterTree = {};
    if (histogramEvolution.filterName() == "os") {
      return filterTree
    }
    fullOptions.forEach(function(option) {
      var filteredEvolution = histogramEvolution.filter(option);
      filterTree[option] = getCombinedFilterTree(filteredEvolution);
    });
    filterTree._name = histogramEvolution.filterName();
    return filterTree
  }
  function getOptionsList(filterTree, optionsList, currentPath, depth, includeSelf) {
    var options = Object.keys(filterTree).sort();
    var filterOptions = Object.keys(filterTree).filter(function(option) { return option != "_name"; });
    if (filterOptions.length === 0) { return optionsList; }
    
    // Add the current options into the option map
    if (optionsList[depth] === undefined) { optionsList[depth] = []; }
    if (includeSelf) {
      var os = null;
      if (filterTree._name === "osVersion") { os = currentPath[currentPath.length - 1]; }
      var currentOptions = getHumanReadableOptions(filterTree._name, filterOptions, os);
      optionsList[depth] = optionsList[depth].concat(currentOptions);
    }
    
    var selectedValues = (!filterList[depth] || filterList[depth].length === 0) ?
                         filterOptions : filterList[depth];
    filterOptions.forEach(function(option) {
      // Don't include direct children if we are not in the right OS
      var includeChildren = true;
      if (filterTree._name === "OS") { includeChildren = selectedValues.indexOf(option) >= 0; }
      
      getOptionsList(filterTree[option], optionsList, currentPath.concat([option]), depth + 1, includeChildren);
    });
    return optionsList;
  }

  var filterTree = getCombinedFilterTree(histogramEvolution);
  var optionsList = getOptionsList(filterTree, [], [], 0, true);
  
  // Remove duplicate options
  optionsList = optionsList.map(function(options) {
    var result = [], seen = {};
    options.forEach(function(option) {
      if (!(option[0] in seen)) {
        result.push(option);
        seen[option[0]] = true;
      }
    })
    return result;
  })
  return optionsList;
}

function getHistogramEvolutionLines(version, measure, histogramEvolution, aggregates, filters, filterList, sanitize) {
  sanitize = sanitize || true;

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
    var newLine = new Line(measure, version, aggregate, filters, aggregatePoints[aggregate]);
    newLine.histogramEvolution = histogramEvolution;
    lines.push(newLine);
  }
  
  var submissionLine = new Line(measure, version, "submissions", filters, submissionPoints);
  submissionLine.histogramEvolution = histogramEvolution;
  
  return {lines: lines, submissionLine: submissionLine};
}

function displayHistogramEvolutions(lines, submissionLines, minDate, maxDate) {
  minDate = minDate || null; maxDate = maxDate || null;

  // Transform the data into a form that is suitable for plotting
  var lineData = lines.map(function (line) {
    return line.values.map(function(point) { return {date: new Date(point.x), value: point.y}; });
  });
  var submissionLineData = submissionLines.map(function (line) {
    return line.values.map(function(point) { return {date: new Date(point.x), value: point.y}; });
  });
  
  var aggregateLabels = lines.map(function(line) { return line.aggregate; })
  
  var aggregateMap = {};
  lines.forEach(function(line) { aggregateMap[line.aggregate] = true; });
  var valueLabel = Object.keys(aggregateMap).sort().join(", ") + " " + (lines.length > 0 ? lines[0].measure : "");
  
  var markers = [], usedDates = {};
  lines.forEach(function(line) {
    if (line.values.length > 0 && !(line.values[0].x in usedDates)) {
      markers.push({date: new Date(line.values[0].x), label: line.getVersionString()});
      usedDates[line.values[0].x] = true;
    }
  });

  // Plot the data using MetricsGraphics
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
      // Create legend
      var date = d.key;
      var lineList = d.values ? d.values.map(function(entry) { return lines[entry.line_id - 1]; }) : [lines[d.line_id - 1]];
      var values = d.values ? d.values.map(function(entry) { return entry.value; }) : [d.value];
      var legend = d3.select("#evolutions .mg-active-datapoint").text(moment(date).format("MMM D, YYYY") + " (build " + moment(date).format("YYYYMMDD") + "):").style("fill", "white");
      var lineHeight = 1.1;
      lineList.forEach(function(line, i) {
        var lineIndex = i + 1;
        var label = legend.append("tspan").attr({x: 0, y: (lineIndex * lineHeight) + "em"}).text(line.getDescriptionString() + ": " + formatNumber(values[i]));
        legend.append("tspan").attr({x: -label.node().getComputedTextLength(), y: (lineIndex * lineHeight) + "em"})
          .text("\u2014 ").style({"font-weight": "bold", "stroke": line.color});
      });
      
      // Reposition element
      var rolloverRect = $("#evolutions .mg-rollover-rect rect:nth-child(" + (i + 1) + ")").get(0);
      var x = parseInt(rolloverRect.getAttribute("x")) + 30, y = parseInt(rolloverRect.getAttribute("y")) + 10;
      var bbox = legend[0][0].getBBox();
      if (x + bbox.width + 50 > $("#evolutions svg").width()) x -= bbox.width + 35;
      d3.select("#evolutions .mg-active-datapoint-container").attr("transform", "translate(" + (x + bbox.width) + "," + (y + 15) + ")");
      
      // Add background
      var padding = 10;
      d3.select("#evolutions svg").insert("rect", ".mg-active-datapoint-container").classed("active-datapoint-background", true)
        .attr("x", x - padding).attr("y", y)
        .attr("width", bbox.width + padding * 2).attr("height", bbox.height + 8)
        .attr("rx", "3").attr("ry", "3").style("fill", "#333");
    },
    mouseout: function(d, i) {
      d3.select("#evolutions .active-datapoint-background").remove(); // Remove old background
    },
  });
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
      // Create legend
      var date = d.key;
      var lineList = d.values ? d.values.map(function(entry) { return lines[entry.line_id - 1]; }) : [lines[d.line_id - 1]];
      var submissionLineList = d.values ? d.values.map(function(entry) { return submissionLines[entry.line_id - 1]; }) : [submissionLines[d.line_id - 1]];
      var values = d.values ? d.values.map(function(entry) { return entry.value; }) : [d.value];
      var legend = d3.select("#submissions svg .mg-active-datapoint").text(moment(date).format("MMM D, YYYY") + " (build " + moment(date).format("YYYYMMDD") + "):").style("fill", "white");
      var lineHeight = 1.1;
      submissionLineList.forEach(function(line, i) {
        var lineIndex = i + 1;
        var label = legend.append("tspan").attr({x: 0, y: (lineIndex * lineHeight) + "em"}).text(line.getDescriptionString() + ": " + formatNumber(values[i]));
        legend.append("tspan").attr({x: -label.node().getComputedTextLength(), y: (lineIndex * lineHeight) + "em"}).text("\u2014 ").style({"font-weight": "bold", "stroke": (lineList[i] || line).color});
      });
      
      // Reposition element
      var rolloverRect = $("#submissions .mg-rollover-rect rect:nth-child(" + (i + 1) + ")").get(0);
      var x = parseInt(rolloverRect.getAttribute("x")) + 30, y = parseInt(rolloverRect.getAttribute("y")) + 10;
      var bbox = legend[0][0].getBBox();
      if (x + bbox.width + 50 > $("#submissions svg").width()) x -= bbox.width + 35;
      d3.select("#submissions .mg-active-datapoint-container").attr("transform", "translate(" + (x + bbox.width) + "," + (y + 15) + ")");
      
      // Add background
      var padding = 10;
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
    $(".mg-main-line.mg-line" + lineIndex + "-color").css("stroke", line.color);
    $(".mg-area" + lineIndex + "-color, .mg-hover-line" + lineIndex + "-color").css("fill", line.color).css("stroke", line.color);
    $(".mg-line" + lineIndex + "-legend-color").css("fill", line.color);
  });
  
  // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .mg-year-marker text").attr("dy", "5");
  $(".mg-x-axis .label").attr("dy", "20");
  $(".mg-y-axis .label").attr("y", "10").attr("dy", "0");
  $(".mg-line-legend text").css("font-size", "12px")
  $(".mg-marker-text").css("font-size", "12px").attr("text-anchor", "start").attr("dy", "18").attr("dx", "5");
}

function getHumanReadableOptions(filterName, options, os) {
  os = os || null;

  var systemNames = {"WINNT": "Windows", "Darwin": "OS X"};
  var ignoredOSs = {"Windows_95": true, "Windows_NT": true, "Windows_98": true};
  var windowsVersionNames = {"5.0": "2000", "5.1": "XP", "5.2": "XP Pro x64", "6.0": "Vista", "6.1": "7", "6.2": "8", "6.3": "8.1", "6.4": "10 (Tech Preview)", "10.0": "10"};
  var windowsVersionOrder = {"5.0": 0, "5.1": 1, "5.2": 2, "6.0": 3, "6.1": 4, "6.2": 5, "6.3": 6, "6.4": 7, "10.0": 8};
  var darwinVersionPrefixes = {
    "1.2.": "Kodiak", "1.3.": "Cheetah", "1.4.": "Puma", "6.": "Jaguar",
    "7.": "Panther", "8.": "Tiger", "9.": "Leopard", "10.": "Snow Leopard",
    "11.": "Lion", "12.": "Mountain Lion", "13.": "Mavericks", "14.": "Yosemite",
  };
  var archNames = {"x86": "32-bit", "x86-64": "64-bit"};
  if (filterName === "OS") {
    // Replace OS names with pretty OS names where possible
    return options.filter(function(option) { return !ignoredOSs[option]; }).map(function(option) {
      return [option, systemNames.hasOwnProperty(option) ? systemNames[option] : option];
    });
  } else if (filterName === "osVersion") {
    var osPrefix = os === null ? "" : (systemNames.hasOwnProperty(os) ? systemNames[os] : os) + " ";
    if (os === "WINNT") {
      return options.sort(function(a, b) {
        // Sort by explicit version order if available
        if (windowsVersionOrder.hasOwnProperty(a) && windowsVersionOrder.hasOwnProperty(b)) {
          return windowsVersionOrder[a] < windowsVersionOrder[b] ? -1 : (windowsVersionOrder[a] > windowsVersionOrder[b] ? 1 : 0);
        } else if (windowsVersionOrder.hasOwnProperty(a)) {
          return -1;
        } else if (windowsVersionOrder.hasOwnProperty(b)) {
          return 1;
        }
        return ((a < b) ? -1 : ((a > b) ? 1 : 0));
      }).map(function(option) {
        return [option, osPrefix + (windowsVersionNames.hasOwnProperty(option) ? windowsVersionNames[option] : option)];
      });
    } else if (os === "Darwin") {
      return options.map(function(option) {
        for (var prefix in darwinVersionPrefixes) {
          if (option.startsWith(prefix)) {
            return [option, osPrefix + option + " (" + darwinVersionPrefixes[prefix] + ")"];
          }
        }
        return [option, osPrefix + option];
      });
    }
    return options.map(function(option) { return [option, osPrefix + option]; });
  } else if (filterName === "arch") {
    return options.map(function(option) {
      return [option, archNames.hasOwnProperty(option) ? archNames[option] : option];
    });
  }
  return options.map(function(option) { return [option, option] });
}

var Line = (function(){
  var lineColors = {};
  var goodColors = ["#FCC376", "#EE816A", "#5C8E6F", "#030303", "#93AE9F", "#E7DB8F", "#9E956A", "#FFB284", "#4BB4A3", "#32506C", "#77300F", "#C8B173"];
  var goodColorIndex = 0;
  var filterSortOrder = ["product", "OS", "osVersion", "arch"];

  function Line(measure, channelVersion, aggregate, filters, values) {
    if (typeof measure !== "string") { throw "Bad measure value: must be string"; }
    if (typeof channelVersion !== "string") { throw "Bad channelVersion value: must be string"; }
    if (typeof aggregate !== "string") { throw "Bad aggregate value: must be string"; }
    if (!$.isArray(values)) { throw "Bad values value: must be array"; }
  
    this.measure = measure;
    this.channelVersion = channelVersion;
    this.aggregate = aggregate;
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
    gInitialPageState.aggregates.split("!").filter(function(v) { return v !== ""; }) : ["median"];
  gInitialPageState.measure = gInitialPageState.measure !== undefined ?
    gInitialPageState.measure : "GC_MS";
  gInitialPageState.min_channel_version = gInitialPageState.min_channel_version !== undefined ?
    gInitialPageState.min_channel_version : "nightly/38";
  gInitialPageState.max_channel_version = gInitialPageState.max_channel_version !== undefined ?
    gInitialPageState.max_channel_version : "nightly/41";
  gInitialPageState.product = gInitialPageState.product !== undefined ?
    gInitialPageState.product.split("!").filter(function(v) { return v !== ""; }) : ["Firefox"];
  gInitialPageState.arch = gInitialPageState.arch !== undefined ?
    gInitialPageState.arch.split("!").filter(function(v) { return v !== ""; }) : null;
  gInitialPageState.os = gInitialPageState.os !== undefined ?
    gInitialPageState.os.split("!").filter(function(v) { return v !== ""; }) : null;
  gInitialPageState.os_version = gInitialPageState.os_version !== undefined ?
    gInitialPageState.os_version.split("!").filter(function(v) { return v !== ""; }) : null;
}

// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  var gInitialPageState = {
    aggregates: $("#aggregates").val() || [],
    measure: $("#measure").val(),
    min_channel_version: $("#min-channel-version").val(),
    max_channel_version: $("#max-channel-version").val(),
    product: $("#filter-product").val() || [],
  };
  
  // Only store these in the state if they are not all selected
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) { gInitialPageState.arch = selected; }
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) { gInitialPageState.os = selected; }
  var selected = $("#filter-os-version").val() || [];
  if (selected.length !== $("#filter-os-version option").size()) { gInitialPageState.os_version = selected; }
  
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
  var exponent = Math.log10 !== undefined ? Math.floor(Math.log10(mag)) : Math.floor(Math.log(mag) / Math.log(10));
  var interval = Math.pow(10, Math.floor(exponent / 3) * 3);
  var units = {1000: "k", 1000000: "M", 1000000000: "B", 1000000000000: "T"};
  if (interval in units) {
    return Math.round(number * 100 / interval) / 100 + units[interval];
  }
  return Math.round(number * 100) / 100;
}

function selectSetOptions(element, options, defaultSelected) {
  if (defaultSelected !== undefined && typeof defaultSelected !== "string") {
    throw "Bad defaultSelected value: must be a string.";
  }
  options.forEach(function(option) {
    if (!$.isArray(option) || option.length !== 2 || typeof option[0] !== "string" || typeof option[1] !== "string") {
      throw "Bad options value: must be array of arrays, each with two strings.";
    }
  });
  var selected = element.val() || defaultSelected;
  element.empty().append(options.map(function(option) {
    return '<option value="' + option[0] + '">' + option[1] + '</option>';
  }).join());
  if (typeof selected === "string") { element.select2("val", selected); }
}

// Sets the options of a multiselect to a list of pairs where the first element is the value, and the second is the text
function multiselectSetOptions(element, options, defaultSelected) {
  defaultSelected = defaultSelected || null;

  // Check inputs
  if (defaultSelected !== null) {
    defaultSelected.forEach(function(option) {
      if (typeof option !== "string") { throw "Bad defaultSelected value: must be array of strings."; }
    });
  }
  options.forEach(function(option) {
    if (!$.isArray(option) || option.length !== 2 || typeof option[0] !== "string" || typeof option[1] !== "string") {
      throw "Bad options value: must be array of arrays, each with two strings.";
    }
  });
  
  var selected = element.val() || defaultSelected;
  element.empty().append(options.map(function(option) {
    return '<option value="' + option[0] + '">' + option[1] + '</option>';
  }).join()).multiselect("rebuild");
  if (selected !== null) {
    // Filter out the options that were selected but no longer exist
    var availableOptionMap = {};
    options.forEach(function(option) { availableOptionMap[option[0]] = true; });
    selected = selected.filter(function(selectedOption) {
      return availableOptionMap.hasOwnProperty(selectedOption);
    });
    element.multiselect("select", selected); // Select the original options where applicable
  }
}
