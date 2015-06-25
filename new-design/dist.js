var gVersions = null;
var gInitialPageState = null;
var gFilterChangeTimeout = null;

$(function() { Telemetry.init(function() {
  gVersions = Telemetry.getVersions();
  gInitialPageState = loadStateFromUrlAndCookie();
  
  // Set up aggregate, build, and measure selectors
  selectSetOptions($("#channel-version"), gVersions.map(function(version) { return [version, version.replace("/", " ")] }));
  if (gInitialPageState.max_channel_version) { $("#channel-version").select2("val", gInitialPageState.max_channel_version); }
  
  updateOptions(function() {      
    $("#filter-product").multiselect("select", gInitialPageState.product);
    if (gInitialPageState.os !== null) { $("#filter-os").multiselect("select", gInitialPageState.os); }
    else { $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText"); }
    if (gInitialPageState.arch !== null) { $("#filter-arch").multiselect("select", gInitialPageState.arch); }
    else { $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText"); }
    if (gInitialPageState.e10s !== null) { $("#filter-e10s").multiselect("select", gInitialPageState.e10s); }
    else { $("#filter-e10s").multiselect("selectAll", false).multiselect("updateButtonText"); }

      $("#channel-version").change(function() {
        updateOptions(function() { $("#measure").trigger("change"); });
      });
      $("#build-time-toggle, #measure, #filter-product, #filter-os, #filter-arch, #filter-e10s").change(function() {
        if (gFilterChangeTimeout !== null) { clearTimeout(gFilterChangeTimeout); }
        gFilterChangeTimeout = setTimeout(function() { // Debounce the changes to prevent rapid filter changes from causing too many updates
          calculateHistogram(function(histogram, histograms) {
            displayHistogram(histogram, histograms, $("#cumulative-toggle").prop("checked"));
            saveStateToUrlAndCookie();
          });
        }, 0);
      });

      // Perform a full display refresh
      $("#measure").trigger("change");
  });

  $("#cumulative-toggle").change(function() {
    displayHistogram(gCurrentLines, gCurrentSubmissionLines, $("#cumulative-toggle").prop("checked"));
  });
  
  // Switch to the evolution dashboard with the same settings
  $("#switch-views").click(function() {
    var evolutionURL = window.location.origin + window.location.pathname.replace(/dist\.html$/, "evo.html") + window.location.hash;
    window.location.href = evolutionURL;
    return false;
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
  
  // Automatically resize range bar
  $(window).resize(function() {
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().outerWidth() - dateControls.outerWidth() - 10);
  });
  $("#advanced-settings").on("shown.bs.collapse", function () {
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
  });
}); });

function updateOptions(callback) {
  var channelVersion = $("#channel-version").val();
  var parts = channelVersion.split("/"); //wip: clean this up
  Telemetry.getFilterOptions(parts[0], parts[1], function(optionsMap) {
    console.log(optionsMap)
    var measures = deduplicate(optionsMap.metric).filter(function(measure) {
      return !measure.startsWith("STARTUP_"); // Ignore STARTUP_* histograms since nobody ever uses them
    }).sort();
    selectSetOptions($("#measure"), measures.map(function(measure) { return [measure, measure]; }));
    selectSetSelected($("#measure"), gInitialPageState.measure);

    multiselectSetOptions($("#filter-product"), getHumanReadableOptions("product", deduplicate(optionsMap.application)));
    multiselectSetOptions($("#filter-os"), getHumanReadableOptions("os", deduplicate(optionsMap.os)));
    //wip: other filters like e10sEnabled and such
    multiselectSetOptions($("#filter-arch"), getHumanReadableOptions("arch", deduplicate(optionsMap.architecture)));
    multiselectSetOptions($("#filter-e10s"), getHumanReadableOptions("e10s", deduplicate(optionsMap.e10sEnabled)));
    if (callback !== undefined) { callback(); }
  });
}

function calculateHistogram(callback) {
  // Get selected version, measure, and aggregate options
  var channelVersion = $("#channel-version").val();
  var measure = $("#measure").val();
  var evolutionLoader = $("#build-time-toggle").prop("checked") ? Telemetry.getHistogramsOverTime : Telemetry.getHistogramsOverBuilds;
  
  var filters = {
    "application":  $("#filter-product"),
    "os":           $("#filter-os"),
    "architecture": $("#filter-arch"),
    "e10sEnabled": $("#filter-e10s"),
    //wip: add all the new filters
  };
  var filterSets = getFilterSets(filters);
  
  var filtersCount = 0;
  var finalEvolution = null;
  filterSets.forEach(function(filterSet) {
    var parts = channelVersion.split("/");
    evolutionLoader(parts[0], parts[1], measure, filterSet, function(evolution) {
      if (finalEvolution === null) {
        finalEvolution = evolution;
      } else {
        finalEvolution = finalEvolution.combine(evolution);
      }
      filtersCount ++;
      if (filtersCount === filterSets.length) { // Check if we have loaded all the needed filters
        updateDateRange(function(dates) {
          var fullHistogram = finalEvolution.histogram(dates[0], dates[dates.length - 1]);
          callback(fullHistogram, finalEvolution);
        }, finalEvolution, false);
      }
    });
  });
  if (filterSets.length === 0) {
    callback(null, null); // wip
  }
}

var gLastTimeoutID = null;
var gCurrentDateRangeUpdateCallback = null;
function updateDateRange(callback, evolution, updatedByUser, shouldUpdateRangebar) {
  shouldUpdateRangebar = shouldUpdateRangebar === undefined ? true : shouldUpdateRangebar;

  gCurrentDateRangeUpdateCallback = callback || function() {};

  var dates = evolution.dates();
  if (dates.length == 0) { $("#date-range").attr("disabled", ""); }
  else { $("#date-range").removeAttr("disabled"); }
  
  // Cut off all dates past one year in the future
  var timeCutoff = moment().add(1, "years").toDate().getTime();
  dates = dates.filter(function(date) { return date <= timeCutoff; });
  
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
    updateDateRange(gCurrentDateRangeUpdateCallback, histograms, true);
  });
  
  // If the selected date range is now out of bounds, or the bounds were updated programmatically, select the entire range
  if (picker.startDate.isAfter(endMoment) || picker.endDate.isBefore(startMoment) || !updatedByUser) {
    picker.setStartDate(startMoment);
    picker.setEndDate(endMoment);
  }
  
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
        updateDateRange(gCurrentDateRangeUpdateCallback, histograms, true, false);
      }, 100);
    });
    $("#range-bar").empty().append(rangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
    rangeBarControl.val([[picker.startDate, picker.endDate]]);
  }
  
  var min = picker.startDate.toDate(), max = picker.endDate.toDate();
  dates = dates.filter(function(date) { return min <= date && date <= max; });
  
  return gCurrentDateRangeUpdateCallback(dates);
}

function displayHistogram(histogram, evolution, cumulative) {
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
  var dates = evolution.dates();
  $("#prop-kind").text(histogram.kind);
  $("#prop-dates").text(formatNumber(dates.length));
  $("#prop-date-range").text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ? "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  $("#prop-submissions").text(formatNumber(histogram.submissions));
  $("#prop-count").text(formatNumber(histogram.count));
  if (histogram.kind == "linear" || histogram.kind == "exponential") {
    $("#prop-mean").text(formatNumber(histogram.mean()));
    $("#prop-p5").text(formatNumber(histogram.percentile(5)));
    $("#prop-p25").text(formatNumber(histogram.percentile(25)));
    $("#prop-p50").text(formatNumber(histogram.percentile(50)));
    $("#prop-p75").text(formatNumber(histogram.percentile(75)));
    $("#prop-p95").text(formatNumber(histogram.percentile(95)));
    $(".scalar-only").show();
  } else {
    $(".scalar-only").hide();
  }
  
  var counts, starts;
  if (cumulative) {
    starts = histogram.map(function(count, start, end, i) { return 0; });
    var total = 0;
    counts = histogram.map(function(count, start, end, i) { return total += count; });
  } else {
    starts = histogram.map(function(count, start, end, i) { return start; });
    counts = histogram.map(function(count, start, end, i) { return count; });
  }
  var ends = histogram.map(function(count, start, end, i) { return end; });
  
  var distributionSamples = counts.map(function(count, i) { return {value: i, count: (count / histogram.count) * 100}; });
  
  // Plot the data using MetricsGraphics
  $("#distribution").css("margin", "0 -50px 0 -50px");
  MG.data_graphic({
    data: distributionSamples,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 600,
    left: 100, right: 150,
    transition_on_update: false,
    target: "#distribution",
    x_label: histogram.description, y_label: "Percentage of Samples",
    xax_ticks: 20,
    y_extended_ticks: true,
    x_accessor: "value", y_accessor: "count",
    xax_format: function(index) { return formatNumber(starts[index]); },
    yax_format: function(value) { return value + "%"; },
    mouseover: function(d, i) {
      var count = formatNumber(counts[d.x]), percentage = Math.round(d.y * 100) / 100 + "%";
      var label = count + " samples (" + percentage + ") between " + formatNumber(starts[d.x]) + " and " + formatNumber(ends[d.x]);
      var offset = $("#distribution .mg-bar:nth-child(" + (i + 1) + ")").get(0).getAttribute("transform");
      
      // Reposition element
      var legend = d3.select("#distribution .mg-active-datapoint").text(label).attr("transform", offset)
        .attr("x", "0").attr("y", "0").attr("dy", "-10").attr("text-anchor", "middle").style("fill", "white");
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
  $(".mg-y-axis .label").attr("y", "50").attr("dy", "0");
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
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) { gInitialPageState.os = selected; }
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) { gInitialPageState.arch = selected; }
  var selected = $("#filter-e10s").val() || [];
  if (selected.length !== $("#filter-e10s option").size()) { gInitialPageState.e10s = selected; }
  
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
