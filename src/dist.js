var gInitialPageState = {};
var gCurrentEvolution = null;
var gCurrentDates = null;
var gCurrentHistogram = null;
var gFilterChangeTimeout = null;
var gFilters = null, gPreviousFilterAllSelected = {};

Telemetry.init(function() {
  gFilters = {
    "product":    $("#filter-product"),
    "os_version": $("#filter-os"),
    "arch":       $("#filter-arch"),
  };
  gInitialPageState = loadStateFromUrlAndCookie();
  
  // Set up settings selectors
  multiselectSetOptions($("#channel-version"), getHumanReadableOptions("channelVersion", Telemetry.versions()));
  if (gInitialPageState.max_channel_version) { $("#channel-version").multiselect("select", gInitialPageState.max_channel_version); }
  
  $("input[name=build-time-toggle][value=" + (gInitialPageState.use_submission_date !== 0 ? 1 : 0) + "]").prop("checked", true).trigger("change");
  $("input[name=cumulative-toggle][value=" + (gInitialPageState.cumulative !== 0 ? 1 : 0) + "]").prop("checked", true).trigger("change");
  
  updateMeasuresList(function() {
    calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
      multiselectSetOptions($("#filter-product"), filterOptionsList[1]);
      multiselectSetOptions($("#filter-os"), filterOptionsList[3]);
      multiselectSetOptions($("#filter-arch"), filterOptionsList[4]);
      
      $("#filter-product").multiselect("select", gInitialPageState.product);
      if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
      else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
      
      if (gInitialPageState.os !== null) { // We accept values such as "WINNT", as well as "WINNT,6.1"
        $("#filter-os").multiselect("select", expandOSs(gInitialPageState.os));
      } else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }

      for (var filterName in gFilters) {
        var selector = gFilters[filterName];
        if (selector.is("[multiple]")) {
          var selected = selector.val() || [], options = selector.find("option");
          gPreviousFilterAllSelected[selector.attr("id")] = selected.length === options.length;
        }
      }
      
      $("#channel-version").change(function() {
        updateMeasuresList(function() { $("#measure").trigger("change"); });
      });
      $("input[name=build-time-toggle], #measure, #filter-product, #filter-arch, #filter-os").change(function() {
        var $this = $(this);
        if (gFilterChangeTimeout !== null) { clearTimeout(gFilterChangeTimeout); }
        gFilterChangeTimeout = setTimeout(function() { // Debounce the changes to prevent rapid filter changes from causing too many updates
          if ($this.is("[multiple]")) { // Only apply the select all change to controls that allow multiple selections
            // If options (but not all options) were deselected when previously all options were selected, invert selection to include only those deselected
            var selected = $this.val() || [], options = $this.find("option");
            if (selected.length !== options.length && selected.length > 0 && gPreviousFilterAllSelected[$this.attr("id")]) {
              var nonSelectedOptions = options.map(function(i, option) { return option.getAttribute("value"); }).toArray()
                .filter(function(filterOption) { return selected.indexOf(filterOption) < 0; });
              $this.multiselect("deselectAll").multiselect("select", nonSelectedOptions);
            }
            gPreviousFilterAllSelected[$this.attr("id")] = selected.length === options.length; // Store state
          }
          
          calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
            refreshFilters(filterOptionsList);
            
            // Update the measure description
            var measureDescription = gMeasureMap[$("#measure").val()].description;
            gCurrentDates = dates; gCurrentHistogram = histogram;
            displayHistogram(histogram, dates, $("input[name=cumulative-toggle]:checked").val() !== "0");
            saveStateToUrlAndCookie();
          });
        }, 0);
      });

      // Perform a full display refresh
      $("#measure").trigger("change");
    });
  });

  $("input[name=cumulative-toggle]").change(function() {
    displayHistogram(gCurrentHistogram, gCurrentDates, $("input[name=cumulative-toggle]:checked").val() !== "0");
    saveStateToUrlAndCookie();
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

function refreshFilters(optionsList) {
  // Sort the OS versions list by OS name
  var newOSList = [];
  var systemOrder = {"WINNT": 1, "Darwin": 2};
  optionsList[2].map(function(entry) { return entry[0]; }).sort(function(a, b) {
    // Sort by explicit version order if available
    if (systemOrder.hasOwnProperty(a) && systemOrder.hasOwnProperty(b)) {
      return systemOrder[a] - systemOrder[b];
    } else if (systemOrder.hasOwnProperty(a)) {
      return -1;
    } else if (systemOrder.hasOwnProperty(b)) {
      return 1;
    }
    return ((a < b) ? -1 : ((a > b) ? 1 : 0));
  }).forEach(function(os) {
    newOSList = newOSList.concat(optionsList[3].filter(function(version) {
      return version[0].split(",")[0] == os;
    }));
  });
  
  multiselectSetOptions($("#filter-product"), optionsList[1]);
  multiselectSetOptions($("#filter-arch"), optionsList[4]);
  
  var selectedOSs = compressOSs();
  multiselectSetOptions($("#filter-os"), newOSList);
  $("#filter-os").multiselect("select", expandOSs(selectedOSs));
  
  // Update CSS classes for labels marking whether they are all selected
  var allSelectedOSList = compressOSs().filter(function(os) { return os.indexOf(",") < 0; }); // List of all OSs that are all selected
  var selector = $("#filter-os").next().find(".multiselect-container");
  selector.find(".multiselect-group-clickable").removeClass("all-selected");
  var optionsMap = {};
  getHumanReadableOptions("os", allSelectedOSList).forEach(function(option) { optionsMap[option[0]] = option[1]; });
  allSelectedOSList.forEach(function(os) {
    var optionGroupLabel = selector.find(".multiselect-group-clickable:contains('" + optionsMap[os] + "')");
    optionGroupLabel.addClass("all-selected");
  });
}

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
      return measure;
    });
    multiselectSetOptions($("#measure"), getHumanReadableOptions("measure", measuresList));
    $("#measure").multiselect("select", gInitialPageState.measure);
    if (callback !== undefined) { callback(); }
  });
}

function calculateHistogram(callback) {
  // Get selected version, measure, and aggregate options
  var channelVersion = $("#channel-version").val();
  var measure = $("#measure").val();
  var evolutionLoader = $("input[name=build-time-toggle]:checked").val() !== "0" ? Telemetry.loadEvolutionOverTime : Telemetry.loadEvolutionOverBuilds;
  
  // Obtain a mapping from filter names to filter options
  var filters = {};
  for (var filterName in gFilters) {
    var filterSelector = gFilters[filterName];
    var selection = filterSelector.val() || [];
    if (selection.length != filterSelector.find("option").length) { // Not all options are selected
      filters[filterName] = selection;
    }
  }

  // Handle the special case for the OS selector
  if (filters.os_version !== undefined) {
    filters.os = deduplicate(filters.os_version.map(function(version) { return version.split(",")[0]; }));
    filters.os_version = filters.os_version.map(function(version) { return version.split(",")[1] });
  }

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

  indicate("Updating histogram...");
  evolutionLoader(channelVersion, measure, function(histogramEvolution) {
    indicate();
    updateDateRange(function(dates) {
      var filterOptionsList = getOptions(filterList, histogramEvolution); // Update filter options
      if (dates === null) {
        callback(filterList, filterOptionsList, null, []);
      } else {
        var fullHistogram = histogramEvolution.range(dates[0], dates[dates.length - 1]);
        var filteredHistogram = getFilteredHistogram(channelVersion, measure, fullHistogram, filters, filterList);
        callback(filterList, filterOptionsList, filteredHistogram, dates);
      }
    }, histogramEvolution, false);
  });
}

var gLastTimeoutID = null;
var gLoadedDateRangeFromState = false;
var gCurrentDateRangeUpdateCallback = null;
var gPreviousMinMoment = null, gPreviousMaxMoment = null;
function updateDateRange(callback, evolution, updatedByUser, shouldUpdateRangebar) {
  gCurrentEvolution = evolution;
  shouldUpdateRangebar = shouldUpdateRangebar === undefined ? true : shouldUpdateRangebar;

  gCurrentDateRangeUpdateCallback = callback || function() {};
  
  var timezoneOffsetMinutes = (new Date).getTimezoneOffset(); // All moments and dates are UTC mode where possible, and should have 00:00:00 as their time
  var dates = [];
  if (evolution !== null) {
    var timeCutoff = moment.utc().add(1, "years").toDate().getTime();
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
  
  var minMoment = moment.utc(dates[0]).clone(), maxMoment = moment.utc(dates[dates.length - 1]);

  // Update the start and end range and update the selection if necessary
  var picker = $("#date-range").data("daterangepicker");
  picker.setOptions({
    format: "YYYY/MM/DD",
    minDate: minMoment.format("YYYY-MM-DD"),
    maxDate: maxMoment.format("YYYY-MM-DD"),
    showDropdowns: true,
    drops: "up", opens: "center",
    ranges: {
       "All": [minMoment, maxMoment],
       "Last 30 Days": [maxMoment.clone().subtract(30, "days"), endMoment],
       "Last 7 Days": [maxMoment.clone().subtract(6, "days"), endMoment],
    },
  }, function(chosenStartMoment, chosenEndMoment, label) {
    updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true);
  });
  
  // First load, update the date picker from the page state
  if (!gLoadedDateRangeFromState && gInitialPageState.start_date !== null && gInitialPageState.end_date !== null) {
    gLoadedDateRangeFromState = true;
    var startMoment = moment.utc(gInitialPageState.start_date), endMoment = moment.utc(gInitialPageState.end_date);
    if (startMoment.isValid() && endMoment.isValid()) {
      picker.setStartDate(startMoment.format("YYYY-MM-DD"));
      picker.setEndDate(endMoment.format("YYYY-MM-DD"));
      gPreviousMinMoment = minMoment; gPreviousMaxMoment = maxMoment;
    }
    
    // If advanced settings are not at their defaults, expand the settings pane on load
    var fullDates = evolution.dates();
    if (gInitialPageState.use_submission_date !== 0 || gInitialPageState.cumulative !== 0 || !startMoment.isSame(fullDates[0]) || !endMoment.isSame(fullDates[fullDates.length - 1])) {
      $("#advanced-settings-toggle").click();
    }
  }
  
  // If the selected date range is now out of bounds, or the bounds were updated programmatically and changed, select the entire range
  var pickerStartDate = picker.startDate.clone().subtract(timezoneOffsetMinutes, "minutes").utc();
  var pickerEndDate = picker.endDate.clone().subtract(timezoneOffsetMinutes, "minutes").utc();
  if (pickerStartDate.isAfter(maxMoment) || pickerEndDate.isBefore(minMoment) ||
    (!updatedByUser && (!minMoment.isSame(gPreviousMinMoment) || !maxMoment.isSame(gPreviousMaxMoment)))) {
    picker.setStartDate(minMoment.format("YYYY-MM-DD"));
    picker.setEndDate(maxMoment.format("YYYY-MM-DD"));
    pickerStartDate = minMoment;
    pickerEndDate = maxMoment.clone().add(1, "days").subtract(1, "milliseconds");
  }
  gPreviousMinMoment = minMoment; gPreviousMaxMoment = maxMoment;
  
  // Rebuild rangebar if it was changed by something other than the user
  if (shouldUpdateRangebar) {
    var rangeBarControl = RangeBar({
      min: minMoment.clone().add(timezoneOffsetMinutes, "minutes").local(),
      max: maxMoment.clone().add(timezoneOffsetMinutes, "minutes").local(),
      maxRanges: 1,
      valueFormat: function(ts) { return ts; },
      valueParse: function(date) { return moment.utc(date).valueOf(); },
      label: function(a) {
        var days = (a[1] - a[0]) / 86400000;
        return days < 5 ? days : moment.utc(a[1]).from(a[0], true);
      },
      snap: 1000 * 60 * 60 * 24, minSize: 1000 * 60 * 60 * 24, bgLabels: 0,
    }).on("changing", function(e, ranges, changed) {
      var range = ranges[0];
      if (gLastTimeoutID !== null) { clearTimeout(gLastTimeoutID); }
      gLastTimeoutID = setTimeout(function() { // Debounce slider movement callback
        picker.setStartDate(moment.utc(range[0]).format("YYYY-MM-DD"))
        picker.setEndDate(moment.utc(range[1]).format("YYYY-MM-DD"));
        updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true, false);
      }, 50);
    });
    $("#range-bar").empty().append(rangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
    rangeBarControl.val([[
      pickerStartDate.clone().add(timezoneOffsetMinutes, "minutes").local().toDate(),
      pickerEndDate.clone().add(timezoneOffsetMinutes, "minutes").local().subtract(1, "days").add(1, "milliseconds").toDate(),
    ]]);
  }
  
  var min = pickerStartDate.toDate(), max = pickerEndDate.toDate();
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

  // Show that the data is missing if there is no histogram, the histogram has an invalid number of buckets, or the histogram exists but has no samples
  if (histogram === null || histogram._buckets.length < 2 || histogram.count() === 0) {
    $("#summary").hide();
    MG.data_graphic({
      chart_type: "missing-data",
      full_width: true, height: 600,
      left: 100, right: 0,
      target: "#distribution",
    });
    $(".mg-missing-pane").remove();
    return;
  }
  $("#summary").show();

  // Update the summary
  $("#prop-kind").text(histogram.kind());
  $("#prop-dates").text(formatNumber(dates.length));
  var timezoneOffsetMinutes = (new Date).getTimezoneOffset();
  $("#prop-date-range").text(
    moment.utc(dates[0]).format("YYYY/MM/DD") +
    ((dates.length == 1) ? "" : " to " + moment.utc(dates[dates.length - 1]).format("YYYY/MM/DD"))
  );
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
  ends[ends.length - 1] = Infinity;
  var totalCount = histogram.count();
  var distributionSamples = counts.map(function(count, i) { return {value: i, count: (count / totalCount) * 100}; });

  // Plot the data using MetricsGraphics
  MG.data_graphic({
    data: distributionSamples,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 600,
    left: 150, right: $("#distribution").width() / (distributionSamples.length + 1) + 150,
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
      var label;
      if (ends[d.x] === Infinity) {
        label = count + " samples (" + percentage + ") where sample value \u2265 " + formatNumber(cumulative ? 0 : starts[d.x]);
      } else {
        label = count + " samples (" + percentage + ") where " + formatNumber(cumulative ? 0 : starts[d.x]) + " \u2264 sample value < " + formatNumber(ends[d.x]);
      }
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
  $(".mg-x-axis .label").attr("dy", "1.2em");
  $(".mg-x-axis text:not(.label)").each(function(i, text) { // Axis tick labels
    if ($(text).text() === "NaN") { text.parentNode.removeChild(text); } // Remove "NaN" labels resulting from interpolation in histogram labels
    $(text).attr("dx", "0.3em").attr("dy", "0").attr("text-anchor", "start");
  });
  $(".mg-x-axis line").each(function(i, tick) { // Extend axis ticks to 15 pixels
    $(tick).attr("y2", parseInt($(tick).attr("y1")) + 12);
  });
  $(".mg-y-axis .label").attr("y", "55").attr("dy", "0");
  
  // Extend the Y axis ticks to cover the last bucket
  var barWidth = parseFloat($("#distribution .mg-rollover-rects:last-child rect").attr("width"))
  $("#distribution .mg-extended-y-ticks").each(function(i, yTick) {
    var x2 = parseFloat(yTick.attributes.x2.value) + barWidth;
    yTick.setAttribute("x2", x2);
  });
}

// Save the current state to the URL and the page cookie
var gPreviousCSVBlobUrl = null, gPreviousJSONBlobUrl = null;
function saveStateToUrlAndCookie() {
  var picker = $("#date-range").data("daterangepicker");
  gInitialPageState = {
    measure: $("#measure").val(),
    max_channel_version: $("#channel-version").val(),
    min_channel_version: gInitialPageState.min_channel_version !== undefined ? // Save the minimum channel version in case we switch to evolution dashboard later
      gInitialPageState.min_channel_version : "nightly/38",
    product: $("#filter-product").val() || [],
    cumulative: $("input[name=cumulative-toggle]:checked").val() !== "0" ? 1 : 0,
    use_submission_date: $("input[name=build-time-toggle]:checked").val() !== "0" ? 1 : 0,
    start_date: moment(picker.startDate).format("YYYY-MM-DD"), end_date: moment(picker.endDate).format("YYYY-MM-DD"),
    
    // Save a few unused properties that are used in the evolution dashboard, since state is shared between the two dashboards
    min_channel_version: gInitialPageState.min_channel_version !== undefined ?
      gInitialPageState.min_channel_version : "nightly/38",
    sanitize: gInitialPageState.sanitize !== undefined ?
      gInitialPageState.sanitize : 1,
  };
  
  // Only store these in the state if they are not all selected
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) { gInitialPageState.arch = selected; }
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) { gInitialPageState.os = compressOSs(); }
  
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
  if (url !== stateString) {
    window.location.replace(window.location.origin + window.location.pathname + "#" + stateString);
    $(".permalink-control input").hide(); // Hide the permalink box again since the URL changed
  }
  
  // Save the state in a cookie that expires in 3 days
  var expiry = new Date();
  expiry.setTime(expiry.getTime() + (3 * 24 * 60 * 60 * 1000));
  document.cookie = "stateFromUrl=" + stateString + "; expires=" + expiry.toGMTString();
  
  // Add link to switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin + window.location.pathname.replace(/dist\.html$/, "evo.html") + window.location.hash;
  $("#switch-views").attr("href", dashboardURL);
  
  // Update export links with the new histogram
  if (gCurrentHistogram !== null) {
    if (gPreviousCSVBlobUrl !== null) { URL.revokeObjectURL(gPreviousCSVBlobUrl); }
    if (gPreviousJSONBlobUrl !== null) { URL.revokeObjectURL(gPreviousJSONBlobUrl); }
    var csvValue = "start,\tcount\n" + gCurrentHistogram.map(function (count, start, end, i) {
      return start + ",\t" + count;
    }).join("\n");
    var jsonValue = JSON.stringify(gCurrentHistogram.map(function(count, start, end, i) { return {start: start, count: count} }));
    gPreviousCSVBlobUrl = URL.createObjectURL(new Blob([csvValue]));
    gPreviousJSONBlobUrl = URL.createObjectURL(new Blob([jsonValue]));
    $("#export-csv").attr("href", gPreviousCSVBlobUrl).attr("download", gCurrentHistogram.measure() + ".csv");
    $("#export-json").attr("href", gPreviousJSONBlobUrl).attr("download", gCurrentHistogram.measure() + ".json");
  }
  
  // If advanced settings are not at their defaults, display a notice in the panel header
  var start = moment(gInitialPageState.start_date), end = moment(gInitialPageState.end_date);
  if (gCurrentEvolution !== null) {
    var fullDates = gCurrentEvolution.dates();
    var startMoment = moment(fullDates[0]), endMoment = moment(fullDates[fullDates.length - 1]);
  } else {
    var startMoment = start, endMoment = end;
  }
  if (gInitialPageState.use_submission_date !== 0 || gInitialPageState.cumulative !== 0 || !start.isSame(startMoment) || !end.isSame(endMoment)) {
    $("#advanced-settings-toggle").find("span").text(" (modified)");
  } else {
    $("#advanced-settings-toggle").find("span").text("");
  }
}
