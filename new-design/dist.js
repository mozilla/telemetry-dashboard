var gFilterMapping = null;
var gVersions = null;
var gMeasureMap = null;
var gInitialPageState = null;

Telemetry.init(function() {
  gVersions = Telemetry.versions();
  gFilterMapping = {
    "product":    $("#filter-product"),
    "arch":       $("#filter-arch"),
    "os":         $("#filter-os"),
    "os_version": $("#filter-os-version"),
  };

  loadStateFromUrlAndCookie();
  
  // Set up aggregate, build, and measure selectors
  selectSetOptions($("#channel-version"), gVersions.map(function(version) { return [version, version.replace("/", " ")] }));
  if (gInitialPageState.max_channel_version) { $("#channel-version").val(gInitialPageState.max_channel_version); }
  $("#channel-version").trigger("change");
  updateMeasuresList(function() {
    calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
      multiselectSetOptions($("#filter-product"), filterOptionsList[1]);
      multiselectSetOptions($("#filter-os"), filterOptionsList[2]);
      multiselectSetOptions($("#filter-os-version"), filterOptionsList[3]);
      multiselectSetOptions($("#filter-arch"), filterOptionsList[4]);
      
      $("#filter-product").multiselect("select", gInitialPageState.product);
      if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
      else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
      if (gInitialPageState.os !== null) { $("#filter-os").multiselect("select", gInitialPageState.os); }
      else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }
      if (gInitialPageState.os_version !== null) { $("#filter-os-version").multiselect("select", gInitialPageState.os_version); }
      else { $("#filter-os-version").multiselect("selectAll", false).multiselect("updateButtonText"); }
      
      $("#channel-version").change(function() { updateMeasuresList(); });
      $("#measure, #filter-product, #filter-arch, #filter-os, #filter-os-version").change(function() {
        calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
          multiselectSetOptions($("#filter-product"), filterOptionsList[1]);
          multiselectSetOptions($("#filter-os"), filterOptionsList[2]);
          multiselectSetOptions($("#filter-os-version"), filterOptionsList[3]);
          multiselectSetOptions($("#filter-arch"), filterOptionsList[4]);
          
          displayHistogram(histogram, dates);
          saveStateToUrlAndCookie();
        });
      });
      
      $("#measure").trigger("change");
    });
  });
  
  // Switch to the evolution dashboard with the same settings
  $("#switch-views").click(function() {
    var evolutionURL = window.location.origin + window.location.pathname.replace(/dist\.html$/, "evo.html") + window.location.hash;
    window.location.href = evolutionURL;
  })
});

function updateMeasuresList(callback) {
  var channelVersion = $("#channel-version").val();
  Telemetry.measures(channelVersion, function(measures) {
    var measuresList = Object.keys(measures).sort().map(function(measure) { return [measure, measure]; });
    selectSetOptions($("#measure"), measuresList);
    $("#measure").val(gInitialPageState.measure).trigger("change");
    if (callback !== undefined) { callback(); }
  });
}

function calculateHistogram(callback, minDate, maxDate) {
  minDate = minDate || -Infinity; maxDate = maxDate || Infinity;

  // Get selected version, measure, and aggregate options
  var channelVersion = $("#channel-version").val();
  var measure = $("#measure").val();
  
  // Obtain a mapping from filter names to filter options
  var filters = {};
  for (var filterName in gFilterMapping) {
    var filterSelector = $(gFilterMapping[filterName]);
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

  var filterOptionsList = []; // Each entry is an array of options for a particular filter
  Telemetry.loadEvolutionOverBuilds(channelVersion, measure, function(histogramEvolution) {
    var histogram = histogramEvolution.range();
    var dates = histogramEvolution.dates().filter(function(date) { return minDate <= date && date <= maxDate; });
  
    // Update filter options
    var filterOptionsList = getOptions(filterList, histogram);
    
    var histogram = getHistogram(channelVersion, measure, histogram, filters, filterList);
    callback(filterList, filterOptionsList, histogram, dates);
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

function getHistogram(version, measure, histogram, filters, filterList) {
  // Repeatedly apply filters to each evolution to get a new list of filtered evolutions
  var histograms = [histogram];
  filterList.forEach(function(options, i) {
    if (histograms.length === 0) { return; } // No more evolutions, probably because a filter had no options selected
    histograms = [].concat.apply([], histograms.map(function(histogram) {
      var actualOptions = options, fullOptions = histogram.filterOptions();
      if (actualOptions === null) { actualOptions = fullOptions; }
      actualOptions = actualOptions.filter(function(option) { return fullOptions.indexOf(option) >= 0 });
      return actualOptions.map(function(option) { return histogram.filter(option); });
    }));
  });

  // Filter each histogram's dataset and combine them into a single dataset
  var firstFilterId = histogram._dataset[0][histogram._dataset[0].length + Telemetry.DataOffsets.FILTER_ID];
  var dataset = histograms.map(function(hgram) {
    // precomputeAggregateQuantity will perform the actual filtering for us, and then we set the filter ID manually
    var filteredDataset = hgram._dataset[0].map(function(value, i) { return hgram.precomputeAggregateQuantity(i); });
    filteredDataset[filteredDataset.length + Telemetry.DataOffsets.FILTER_ID] = firstFilterId;
    return filteredDataset;
  });

  return new Telemetry.Histogram(measure, histogram._filter_path, histogram._buckets, dataset, histogram._filter_tree, histogram._spec);
}

function displayHistogram(histogram, dates) {
  // Update the summary
  $("#prop-kind").text(histogram.kind());
  $("#prop-dates").text(formatNumber(dates.length));
  $("#prop-date-range").text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ? "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  $("#prop-submissions").text(formatNumber(histogram.submissions()));
  $("#prop-count").text(formatNumber(histogram.count()));
  if (histogram.kind() == "linear") {
    $("#prop-mean").text(formatNumber(histogram.mean()));
    $("#prop-stddev").text(formatNumber(histogram.standardDeviation()));
    $(".linear-only").show(); $(".exponential-only").hide();
  }
  else if (histogram.kind() == "exponential") {
    $("#prop-mean2").text(formatNumber(histogram.mean()));
    $("#prop-geometric-mean").text(formatNumber(histogram.geometricMean()));
    $("#prop-geometric-stddev").text(formatNumber(histogram.geometricStandardDeviation()));
    $(".linear-only").hide(); $(".exponential-only").show();
  } else {
    $(".linear-only, .exponential-only").hide();
  }
  if (histogram.kind() == "linear" || histogram.kind() == "exponential") {
    $("#prop-p5").text(formatNumber(histogram.percentile(5)));
    $("#prop-p25").text(formatNumber(histogram.percentile(25)));
    $("#prop-p50").text(formatNumber(histogram.percentile(50)));
    $("#prop-p75").text(formatNumber(histogram.percentile(75)));
    $("#prop-p95").text(formatNumber(histogram.percentile(95)));
  }
  
  var totalHits = 0;
  var distributionData = histogram.map(function(count, start, end, i) {
    totalHits += count;
    return {value: i, count: count};
  });
  var starts = histogram.map(function(count, start, end, i) { return start; });
  var ends = histogram.map(function(count, start, end, i) { return end; });
  
  // Plot the data using MetricsGraphics
  MG.data_graphic({
    data: distributionData,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 600,
    transition_on_update: false,
    target: "#distribution",
    x_label: "Value Buckets", y_label: "Number of Samples",
    xax_ticks: 20,
    y_extended_ticks: true,
    x_accessor: "value", y_accessor: "count",
    xax_format: function(index) { return formatNumber(starts[index]); },
    mouseover: function(d, i) {
      var percentage = Math.round((d.y / totalHits) * 10000) / 100 + "%";
      d3.select("#distribution svg .mg-active-datapoint").text(
        formatNumber(d.y) + " hits (" + percentage + ") between " + formatNumber(starts[d.x]) + " and " + formatNumber(ends[d.x])
      );
    }
  });
  
    // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .label").attr("dy", "1.2em");
  $(".mg-y-axis .label").attr("y", "10").attr("dy", "0");
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


// Load the current state from the URL, or the cookie if the URL is not specified
function loadStateFromUrlAndCookie() {
  var url = window.location.hash;
  url = url[0] === "#" ? url.slice(1) : url;
  
  // Load from cookie if URL does not have state, and give up if still no state available
  if (url.indexOf("&") < 0) {
    var name = "stateFromUrl=";
    document.cookie.split(";").forEach(function(entry) {
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
  gInitialPageState.measure = gInitialPageState.measure !== undefined ?
    gInitialPageState.measure : "GC_MS";
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
  gInitialPageState = {
    measure: $("#measure").val(),
    max_channel_version: $("#channel-version").val(),
    min_channel_version: gInitialPageState.min_channel_version !== undefined ? // Save the minimum channel version in case we switch to evolution dashboard later
      gInitialPageState.min_channel_version : "nightly/38",
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
  var exponent = Math.floor(Math.log10(mag));
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
  if (typeof selected === "string") { element.val(selected); }
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
