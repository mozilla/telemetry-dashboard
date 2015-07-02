var gInitialPageState = {};
var gCurrentDates = null;
var gCurrentHistogram = null;
var gFilterChangeTimeout = null;
var gFilters = null, gPreviousFilterAllSelected = {};

Telemetry.init(function() {
  gFilters = {
    "product":    $("#filter-product"),
    "os":         $("#filter-os"),
    "os_version": $("#filter-os-version"),
    "arch":       $("#filter-arch"),
  };
  gInitialPageState = loadStateFromUrlAndCookie();
  
  // Set up settings selectors
  multiselectSetOptions($("#channel-version"), Telemetry.versions().map(function(version) { return [version, version.replace("/", " ")] }));
  if (gInitialPageState.max_channel_version) { $("#channel-version").multiselect("select", gInitialPageState.max_channel_version); }
  $("#build-time-toggle").prop("checked", gInitialPageState.use_submission_date !== 0).trigger("change");
  
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

      for (var filterName in gFilters) {
        var selector = gFilters[filterName];
        var selected = selector.val() || [], options = selector.find("option");
        gPreviousFilterAllSelected[selector.attr("id")] = selected.length === options.length;
      }
      
      $("#channel-version").change(function() {
        updateMeasuresList(function() { $("#measure").trigger("change"); });
      });
      $("#build-time-toggle, #measure, #filter-product, #filter-arch, #filter-os, #filter-os-version").change(function() {
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
          if ($this.attr("id") === "filter-os") { $("#filter-os-version").multiselect("selectAll", false).multiselect("updateButtonText"); } // if the OS filter changes, select all the OS versions
          
          calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
            multiselectSetOptions($("#filter-product"), filterOptionsList[1]);
            multiselectSetOptions($("#filter-os"), filterOptionsList[2]);
            multiselectSetOptions($("#filter-os-version"), filterOptionsList[3]);
            multiselectSetOptions($("#filter-arch"), filterOptionsList[4]);
            
            // Update the measure description
            var measureDescription = gMeasureMap[$("#measure").val()].description;
            gCurrentDates = dates; gCurrentHistogram = histogram;
            displayHistogram(histogram, dates, $("#cumulative-toggle").prop("checked"));
            saveStateToUrlAndCookie();
          });
        }, 0);
      });

      // Perform a full display refresh
      $("#measure").trigger("change");
    });
  });

  $("#cumulative-toggle").change(function() {
    displayHistogram(gCurrentHistogram, gCurrentDates, $("#cumulative-toggle").prop("checked"));
  });
  
  // Switch to the evolution dashboard with the same settings
  $("#switch-views").click(function() {
    var evolutionURL = window.location.origin + window.location.pathname.replace(/dist\.html$/, "evo.html") + window.location.hash;
    window.location.href = evolutionURL;
    return false;
  });

  // Automatically resize range bar
  $(window).resize(function() {
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
  });
  $("#advanced-settings").on("shown.bs.collapse", function () {
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
    $(this).get(0).scrollIntoView({behavior: "smooth"}); // Scroll the advanced settings into view when opened
  });
});

function updateMeasuresList(callback) {
  var channelVersion = $("#channel-version").val();
  gMeasureMap = {};
  indicate("Updating measures...");
  Telemetry.measures(channelVersion, function(measures) {
    indicate();
    var measuresList = Object.keys(measures).sort().filter(function(measure) {
      return !measure.startsWith("STARTUP_"); // Ignore STARTUP_* histograms since nobody ever uses them
    }).map(function(measure) {
      gMeasureMap[measure] = measures[measure];
      return [measure, measure];
    });
    multiselectSetOptions($("#measure"), measuresList);
    $("#measure").multiselect("select", gInitialPageState.measure);
    if (callback !== undefined) { callback(); }
  });
}

function calculateHistogram(callback) {
  // Get selected version, measure, and aggregate options
  var channelVersion = $("#channel-version").val();
  var measure = $("#measure").val();
  var evolutionLoader = $("#build-time-toggle").prop("checked") ? Telemetry.loadEvolutionOverTime : Telemetry.loadEvolutionOverBuilds;
  
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

  indicate("Updating histogram...");
  evolutionLoader(channelVersion, measure, function(histogramEvolution) {
    indicate();
    updateDateRange(function(dates) {
      var filterOptionsList = getOptions(filterList, histogramEvolution); // Update filter options
      var fullHistogram = histogramEvolution.range(dates[0], dates[dates.length - 1]);
      var filteredHistogram = getFilteredHistogram(channelVersion, measure, fullHistogram, filters, filterList);
      callback(filterList, filterOptionsList, filteredHistogram, dates);
    }, histogramEvolution, false);
  });
}

var gLastTimeoutID = null;
var gLoadedDateRangeFromState = false;
var gCurrentDateRangeUpdateCallback = null;
var gPreviousStartMoment = null, gPreviousEndMoment = null;
function updateDateRange(callback, evolution, updatedByUser, shouldUpdateRangebar) {
  shouldUpdateRangebar = shouldUpdateRangebar === undefined ? true : shouldUpdateRangebar;

  gCurrentDateRangeUpdateCallback = callback || function() {};
  
  var dates = [];
  if (evolution !== null) {
    var timeCutoff = moment().add(1, "years").toDate().getTime();
    dates = evolution.dates().filter(function(date) { return date <= timeCutoff; }); // Cut off all dates past one year in the future
  }
  if (dates.length === 0) {
    if (evolution.dates().length === 0) {
      $("#date-range").prop("disabled", true);
      $("#range-bar").hide();
    }
    gCurrentDateRangeUpdateCallback(null);
    return;
  }
  
  var startMoment = moment(dates[0]), endMoment = moment(dates[dates.length - 1]);

  // Update the start and end range and update the selection if necessary
  var picker = $("#date-range").data("daterangepicker");
  picker.setOptions({
    format: "YYYY/MM/DD",
    minDate: startMoment,
    maxDate: endMoment,
    showDropdowns: true,
    drops: "up",
    ranges: {
       "All": [startMoment, endMoment],
       "Last 30 Days": [endMoment.clone().subtract(30, "days"), endMoment],
       "Last 7 Days": [endMoment.clone().subtract(6, 'days'), endMoment],
    },
  }, function(chosenStartMoment, chosenEndMoment, label) {
    updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true);
  });
  
  // First load, update the date picker from the page state
  if (!gLoadedDateRangeFromState && gInitialPageState.start_date !== null && gInitialPageState.end_date !== null) {
    gLoadedDateRangeFromState = true;
    var picker = $("#date-range").data("daterangepicker");
    var start = moment(gInitialPageState.start_date), end = moment(gInitialPageState.end_date);
    if (start.isValid() && end.isValid()) {
      picker.setStartDate(start); picker.setEndDate(end);
      gPreviousStartMoment = startMoment; gPreviousEndMoment = endMoment;
    }
  }
  
  // If the selected date range is now out of bounds, or the bounds were updated programmatically and changed, select the entire range
  if (picker.startDate.isAfter(endMoment) || picker.endDate.isBefore(startMoment) ||
    (!updatedByUser && (!startMoment.isSame(gPreviousStartMoment) || !endMoment.isSame(gPreviousEndMoment)))) {
    picker.setStartDate(startMoment);
    picker.setEndDate(endMoment);
  }
  gPreviousStartMoment = startMoment; gPreviousEndMoment = endMoment;
  
  // Rebuild rangebar if it was changed by something other than the user
  if (shouldUpdateRangebar) {
    var rangeBarControl = RangeBar({
      min: startMoment, max: endMoment.clone().add(1, "days"),
      maxRanges: 1,
      valueFormat: function(ts) { return ts; },
      valueParse: function(date) { return moment(date).valueOf(); },
      label: function(a) {
        var days = (a[1] - a[0]) / 86400000;
        return days < 5 ? days : moment(a[1]).from(a[0], true);
      },
      snap: 1000 * 60 * 60 * 24, minSize: 1000 * 60 * 60 * 24, bgLabels: 0,
    }).on("changing", function(e, ranges, changed) {
      var range = ranges[0];
      if (gLastTimeoutID !== null) { clearTimeout(gLastTimeoutID); }
      gLastTimeoutID = setTimeout(function() { // Debounce slider movement callback
        picker.setStartDate(moment(range[0]));
        picker.setEndDate(moment(range[1]).subtract(1, "days"));
        updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true, false);
      }, 50);
    });
    $("#range-bar").empty().append(rangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
    rangeBarControl.val([[picker.startDate, picker.endDate]]);
  }
  
  var min = picker.startDate.toDate(), max = picker.endDate.toDate();
  dates = dates.filter(function(date) { return min <= date && date <= max; });
  
  if (dates.length == 0) {
    if (evolution.dates().length === 0) {
      $("#date-range").prop("disabled", true);
      $("#range-bar").hide();
    }
    gCurrentDateRangeUpdateCallback(null);
    return;
  }
  
  // Enable date range controls
  $("#date-range").prop("disabled", false);
  $("#range-bar").show();
  
  gCurrentDateRangeUpdateCallback(dates);
}

function getFilteredHistogram(version, measure, histogram, filters, filterList) {
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

function displayHistogram(histogram, dates, cumulative) {
  cumulative = cumulative || false;

  if (histogram === null) {
    $("#summary").hide();
    MG.data_graphic({
      chart_type: "missing-data",
      full_width: true, height: 600,
      left: 100, right: 150,
      target: "#distribution",
    });
    return;
  }
  $("#summary").show();

  // Update the summary
  $("#prop-kind").text(histogram.kind());
  $("#prop-dates").text(formatNumber(dates.length));
  $("#prop-date-range").text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ? "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  $("#prop-submissions").text(formatNumber(histogram.submissions()));
  $("#prop-count").text(formatNumber(histogram.count()));
  if (histogram.kind() == "linear" || histogram.kind() == "exponential") {
    $("#prop-p5").text(formatNumber(histogram.percentile(5)));
    $("#prop-p25").text(formatNumber(histogram.percentile(25)));
    $("#prop-p50").text(formatNumber(histogram.median()));
    $("#prop-p75").text(formatNumber(histogram.percentile(75)));
    $("#prop-p95").text(formatNumber(histogram.percentile(95)));
    $(".scalar-only").show();
  } else {
    $(".scalar-only").hide();
  }
  
  var starts = histogram.map(function(count, start, end, i) { return start; });
  var counts = histogram.map(function(count, start, end, i) { return count; });
  if (cumulative) {
    var total = 0;
    counts = counts.map(function(count) { return total += count; });
  }
  var ends = histogram.map(function(count, start, end, i) { return end; });
  var totalCount = histogram.count();
  var distributionSamples = counts.map(function(count, i) { return {value: i, count: (count / totalCount) * 100}; });

  // Plot the data using MetricsGraphics
  MG.data_graphic({
    data: distributionSamples,
    binned: true,
    chart_type: totalCount > 0 ? "histogram" : "missing-data",
    full_width: true, height: 600,
    left: 100, right: 150,
    transition_on_update: false,
    target: "#distribution",
    x_label: histogram.description(), y_label: "Percentage of Samples",
    xax_ticks: 20,
    y_extended_ticks: true,
    x_accessor: "value", y_accessor: "count",
    xax_format: function(index) { return formatNumber(starts[index]); },
    yax_format: function(value) { return value + "%"; },
    mouseover: function(d, i) {
      var count = formatNumber(counts[d.x]), percentage = Math.round(d.y * 100) / 100 + "%";
      var label = count + " samples (" + percentage + ") between " +
        formatNumber(cumulative ? 0 : starts[d.x]) + " and " + formatNumber(ends[d.x]);
      var offset = $("#distribution .mg-bar:nth-child(" + (i + 1) + ")").get(0).getAttribute("transform");
      var barWidth = $("#distribution .mg-bar:nth-child(" + (i + 1) + ") rect").get(0).getAttribute("width");
      
      // Reposition element
      var legend = d3.select("#distribution .mg-active-datapoint").text(label).attr("transform", offset)
        .attr("x", barWidth / 2).attr("y", "0").attr("dy", "-10").attr("text-anchor", "middle").style("fill", "white");
      var bbox = legend[0][0].getBBox();
      var padding = 5;
      
      // Add background
      d3.select("#distribution .active-datapoint-background").remove(); // Remove old background
      d3.select("#distribution svg").insert("rect", ".mg-active-datapoint").classed("active-datapoint-background", true)
        .attr("x", bbox.x - padding).attr("y", bbox.y - padding).attr("transform", offset)
        .attr("width", bbox.width + padding * 2).attr("height", bbox.height + padding * 2)
        .attr("rx", "3").attr("ry", "3").style("fill", "#333");
    },
    mouseout: function(d, i) {
      d3.select("#distribution .active-datapoint-background").remove(); // Remove old background
    },
  });
  
    // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .label").attr("dy", "1.2em");
  $(".mg-x-axis text").each(function(i, text) { // Remove "NaN" labels
    if ($(text).text() === "NaN") { text.parentNode.removeChild(text); }
  });
  $(".mg-y-axis .label").attr("y", "50").attr("dy", "0");
  $(".mg-missing-pane").remove();
}

// Save the current state to the URL and the page cookie
function saveStateToUrlAndCookie() {
  gInitialPageState = {
    measure: $("#measure").val(),
    max_channel_version: $("#channel-version").val(),
    min_channel_version: gInitialPageState.min_channel_version !== undefined ? // Save the minimum channel version in case we switch to evolution dashboard later
      gInitialPageState.min_channel_version : "nightly/38",
    product: $("#filter-product").val() || [],
    
    // Save a few unused properties that are used in the evolution dashboard, since state is shared between the two dashboards
    min_channel_version: gInitialPageState.min_channel_version !== undefined ?
      gInitialPageState.min_channel_version : "nightly/38",
    use_submission_date: gInitialPageState.use_submission_date !== undefined ?
      gInitialPageState.use_submission_date : 0,
    sanitize: gInitialPageState.sanitize !== undefined ?
      gInitialPageState.sanitize : 1,
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
  
  // Add link to switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin + window.location.pathname.replace(/dist\.html$/, "evo.html") + window.location.hash;
  $("#switch-views").attr("href", dashboardURL);
}
