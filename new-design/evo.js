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
  selectSetOptions($("#min-channel-version, #max-channel-version"), gVersions.map(function(version) { return [version, version.replace("/", " ")] }));
  if (gInitialPageState.min_channel_version) { $("#min-channel-version").val(gInitialPageState.min_channel_version); }
  if (gInitialPageState.max_channel_version) { $("#max-channel-version").val(gInitialPageState.max_channel_version); }
  $("#min-channel-version, #max-channel-version").trigger("change").change(function() {
    var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
    var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
    gMeasureMap = {}, versionCount = 0;
    versions.forEach(function(channelVersion) { // Load combined measures for all the versions
      Telemetry.measures(channelVersion, function(measures) {
        versionCount ++;
        Object.keys(measures).forEach(function(measure) { gMeasureMap[measure] = measures[measure]; });
        if (versionCount == versions.length) { // All versions are loaded
          var measureList = Object.keys(gMeasureMap).sort().map(function(measure) { return [measure, measure] });
          selectSetOptions($("#measure"), measureList);
          $("#measure").val(gInitialPageState.measure).trigger("change");
        }
      });
    });
  });
  $("#measure").change(function() {
    // Figure out which aggregates actually apply to this measure
    var measureEntry = gMeasureMap[$(this).val()];
    var options;
    if (measureEntry.kind == "linear" || measureEntry.kind == "exponential") {
      options = [["median", "Median"], ["mean", "Mean"], ["5th-percentile", "5th Percentile"], ["25th-percentile", "25th Percentile"], ["75th-percentile", "75th Percentile"], ["95th-percentile", "95th Percentile"]]
    } else {
      options = [["submissions", "Submissions"]];
    }
    
    // Set the new aggregate options that apply to the current measure
    multiselectSetOptions($("#aggregates"), options, gInitialPageState.aggregates)
    var selected = $("#aggregates").val() || [];
    if (selected.length == 0) { selected = [options[0][0]]; }
    $("#aggregates").multiselect("rebuild").multiselect("select", selected).trigger("change");
  });
  $("#aggregates").change(calculateHistogramEvolutions);
  $("#filter-product").change(calculateHistogramEvolutions);
  $("#filter-arch").change(calculateHistogramEvolutions);
  $("#filter-os").change(calculateHistogramEvolutions);
  $("#filter-os-version").change(calculateHistogramEvolutions);
  
  $("#min-channel-version").trigger("change");
});

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
  function getOptionsList(filterTree, optionsList, currentPath, depth = 0, includeSelf = true) {
    var options = Object.keys(filterTree).sort();
    var filterOptions = Object.keys(filterTree).filter(function(option) { return option != "_name"; });
    if (filterOptions.length == 0) { return optionsList; }
    
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
    for (option in filterTree) {
      if (option === "_name") { continue; }
      
      // Don't include direct children if we are not in the right OS
      var includeChildren = true;
      if (filterTree._name === "osVersion") { includeChildren = selectedValues.indexOf(option) >= 0; }
      
      getOptionsList(filterTree[option], optionsList, currentPath.concat([option]), depth + 1, includeChildren);
    }
    return optionsList;
  }

  var filterTree = getCombinedFilterTree(histogramEvolution);
  var optionsList = getOptionsList(filterTree, [], []);
  
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

function refreshFilters(filterList, filterOptionsList) {
  // Remove duplicate filters
  var optionsList = filterOptionsList.map(function(options) {
    var seen = {};
    return options.filter(function(option) {
      if (option in seen) { return false; }
      seen[option] = true;
      return true;
    });
  });
  
  var element = $("#filter-product");
  var selected = element.val();
  console.log(selected);
  element.empty().append(optionsList[1].map(function(option) {
    return '<option value="' + option[0] + '">' + option[1] + '</option>';
  }).join()).multiselect("rebuild");
  if (selected !== null) {
    element.multiselect("select", selected.filter(function(option) { return options.indexOf(options) >= 0; }));
  }
  
  //multiselectSetOptions($("#filter-product"), optionsList[1]);
  multiselectSetOptions($("#filter-os"), optionsList[2]);
  multiselectSetOptions($("#filter-os-version"), optionsList[3]);
  multiselectSetOptions($("#filter-arch"), optionsList[4]);
}

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
  
  // Get selected version, measure, and aggregate options
  var fromVersion = $("#min-channel-version").val(), toVersion = $("#max-channel-version").val();
  var measure = $("#measure").val();
  var aggregates = multiselectGetSelected($("#aggregates"));
  
  // Obtain a mapping from filter names to filter options
  var filters = {};
  for (var filterName in gFilterMapping) {
    var filterSelector = $(gFilterMapping[filterName]);
    var selection = multiselectGetSelected(filterSelector);
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

  var lines = [];
  var versions = gVersions.filter(function(v) { return fromVersion <= v && v <= toVersion; });
  var expectedCount = versions.length * aggregates.length;
  var filterOptionsList = []; // Each entry is an array of options for a particular filter
  versions.forEach(function(version) {
    Telemetry.loadEvolutionOverBuilds(version, measure, function(histogramEvolution) {
      var evolutions = [histogramEvolution];
      
      // Update filter options
      var versionOptionsList = getOptions(filterList, histogramEvolution);
      while (filterOptionsList.length < versionOptionsList.length) { filterOptionsList.push([]); }
      filterOptionsList = filterOptionsList.map(function(options, i) {
        return options.concat(versionOptionsList[i]);
      });
      
      // Repeatedly apply filters to each evolution to get a new list of filtered evolutions
      filterList.forEach(function(options, i) {
        if (evolutions.length == 0) { return; } // No more evolutions, probably because a filter had no options selected
        evolutions = Array.concat.apply([], evolutions.map(function(evolution) {
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
      var aggregatePoints = {}
      aggregates.forEach(function(aggregate) { aggregatePoints[aggregate] = []; });
      Object.keys(dateDatasets).sort().forEach(function(timestamp) {
        // Create a histogram that has no filters and contains the combined dataset
        var dataset = dateDatasets[timestamp];
        var histogram = new Telemetry.Histogram(measure, histogramEvolution._filter_path, firstHistogram._buckets, dataset, histogramEvolution._filter_tree, firstHistogram._spec);
        
        // Obtain the aggregate values from the histogram
        aggregates.forEach(function(aggregate) {
          aggregatePoints[aggregate].push({x: timestamp, y: gAggregateValue[aggregate](histogram)});
        });
      });
      
      // Generate lines from the points for each aggregate
      for (aggregate in aggregatePoints) {
        var newLine = new Line(measure, version, aggregate, null, filters, aggregatePoints[aggregate]);
        newLine.histogramEvolution = histogramEvolution;
        lines.push(newLine);
        if (lines.length === expectedCount) { // Check if we have loaded all the needed versions
          refreshFilters(filterList, filterOptionsList);
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

function getHumanReadableOptions(filterName, options, os = null) {
  var systemNames = {"WINNT": "Windows", "Windows_95": "Windows 95", "Darwin": "OS X"};
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
    return options.map(function(option) {
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
  var goodColors = ["aqua", "orange", "purple", "red", "teal", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "silver", "black", "blue"];
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
    aggregates: multiselectGetSelected($("#aggregates")),
    measure: $("#measure").val(),
    min_channel_version: $("#min-channel-version").val(),
    max_channel_version: $("#max-channel-version").val(),
    product: multiselectGetSelected($("#filter-product")),
    arch: multiselectGetSelected($("#filter-arch")),
    os: multiselectGetSelected($("#filter-os")),
    os_version: multiselectGetSelected($("#filter-os-version")),
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

function multiselectSelectAll(element) {
  var options = element.find("option").map(function(i, option) { return $(option).val(); })
    .filter(function(i, option) { return option != "multiselect-all"; }).toArray();
  element.multiselect("select", options).multiselect("rebuild");
}

function selectSetOptions(element, options, defaultSelected = null) {
  var selected = element.val() || defaultSelected;
  element.empty().append(options.map(function(option) {
    return '<option value="' + option[0] + '">' + option[1] + '</option>';
  }).join());
  if (selected !== null) { element.val(selected); }
}

// Sets the options of a multiselect to a list of pairs where the first element is the value, and the second is the text
function multiselectSetOptions(element, options, defaultSelected = null) {
  var selected = element.val() || defaultSelected;
  element.empty().append(options.map(function(option) {
    return '<option value="' + option[0] + '">' + option[1] + '</option>';
  }).join()).multiselect("rebuild");
  if (selected !== null) {
    element.multiselect("select", selected.filter(function(option) { return options.indexOf(options) >= 0; }));
  }
}

function multiselectGetSelected(element) {
  return (element.val() || []).filter(function (option) { return option !== "multiselect-all"; });
}
