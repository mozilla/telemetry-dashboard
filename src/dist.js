(function() {
"use strict";

var gInitialPageState = {};
var gCurrentEvolution = null;
var gCurrentDates = null;
var gCurrentHistogram = null;
var gMeasureMap = null;
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
  multiselectSetOptions(
    $("#channel-version"),
    getHumanReadableOptions("channelVersion", Telemetry.versions())
  );
  if (gInitialPageState.max_channel_version !== undefined) {
    // No version selected, select the latest nightly
    if (gInitialPageState.max_channel_version === null) {
      var nightlyVersions = Telemetry.versions().filter(function(channelVersion) {
        return channelVersion.startsWith("nightly/");
      }).sort();
      gInitialPageState.max_channel_version = nightlyVersions[nightlyVersions.length - 1];
    }
    $("#channel-version").next().find("input[type=radio]").attr("checked", false);
    $("#channel-version").multiselect("select", gInitialPageState.max_channel_version);
  }

  // Initialize setting values from the page state
  $("input[name=table-toggle][value=" + (gInitialPageState.table !== 0 ? 1 : 0) + "]")
    .prop("checked", true).trigger("change");
  $("input[name=cumulative-toggle][value=" + (gInitialPageState.cumulative !== 0 ? 1 : 0) + "]")
    .prop("checked", true).trigger("change");
  $("input[name=trim-toggle][value=" + (gInitialPageState.trim !== 0 ? 1 : 0) + "]")
    .prop("checked", true).trigger("change");
  $("input[name=build-time-toggle][value=" + (gInitialPageState.use_submission_date !== 0 ? 1 : 0) + "]")
    .prop("checked", true).trigger("change");

  updateMeasuresList(function() {
    calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
      multiselectSetOptions($("#filter-product"), filterOptionsList[1]);
      multiselectSetOptions($("#filter-os"), filterOptionsList[3]);
      multiselectSetOptions($("#filter-arch"), filterOptionsList[4]);

      // Set the initial selection for the selectors
      if (gInitialPageState.product !== null) {
        $("#filter-product").multiselect("select", gInitialPageState.product);
      } else {
        $("#filter-product").multiselect("selectAll", false).multiselect("updateButtonText");
      }
      if (gInitialPageState.arch !== null) {
        $("#filter-arch").multiselect("select", gInitialPageState.arch);
      } else {
        $("#filter-arch").multiselect("selectAll", false).multiselect("updateButtonText");
      }
      if (gInitialPageState.os !== null) { // We accept values such as "WINNT", as well as "WINNT,6.1"
        $("#filter-os").multiselect("select", expandOSs(gInitialPageState.os));
      } else {
        $("#filter-os").multiselect("selectAll", false).multiselect("updateButtonText");
      }

      for (var filterName in gFilters) {
        var selector = gFilters[filterName];

        // Only apply the select all change to the product and OS selector
        if (["filter-product", "filter-os"].indexOf(selector.attr("id")) >= 0) {
          var selected = selector.val() || [], options = selector.find("option");
          gPreviousFilterAllSelected[selector.attr("id")] = selected.length === options.length;
        }
      }

      $("#channel-version").change(function() {
        updateMeasuresList(function() { $("#measure").trigger("change"); });
      });
      $([
        "#measure",
        "#filter-product",
        "#filter-arch",
        "#filter-os",
      ].join(",")).change(function() {
        var $this = $(this);

        // Debounce the changes to prevent rapid filter changes from causing too many updates
        if (gFilterChangeTimeout !== null) { clearTimeout(gFilterChangeTimeout); }
        gFilterChangeTimeout = setTimeout(function() {
          // Only apply the select all change to the product and OS selector
          if (["filter-product", "filter-os"].indexOf($this.attr("id")) >= 0) {
            // If options (but not all options) were deselected when previously all options
            // were selected, invert selection to include only those deselected
            var selected = $this.val() || [], options = $this.find("option");
            var wasAllSelected = gPreviousFilterAllSelected[$this.attr("id")];
            if (selected.length !== options.length && selected.length > 0 && wasAllSelected) {
              var nonSelectedOptions = options.map(function(i, option) {
                return option.getAttribute("value");
              }).toArray().filter(function(filterOption) {
                return selected.indexOf(filterOption) < 0;
              });
              $this.multiselect("deselectAll").multiselect("select", nonSelectedOptions);
            }
            gPreviousFilterAllSelected[$this.attr("id")] = selected.length === options.length;
          }

          calculateHistogram(function(filterList, filterOptionsList, histogram, dates) {
            refreshFilters(filterOptionsList);

            // Update the measure description
            var measureDescription = gMeasureMap[$("#measure").val()].description;
            gCurrentDates = dates; gCurrentHistogram = histogram;
            $("input[name=table-toggle]").trigger("change");
          });
        }, 0);
      });

      // Perform a full display refresh
      $("#measure").trigger("change");
    });
  });

  $([
    "input[name=table-toggle]",
    "input[name=cumulative-toggle]",
    "input[name=trim-toggle]",
  ].join(",")).change(function() {
    displayHistogram(
      gCurrentHistogram, gCurrentDates,
      $("input[name=table-toggle]:checked").val() !== "0",
      $("input[name=cumulative-toggle]:checked").val() !== "0",
      $("input[name=trim-toggle]:checked").val() !== "0"
    );
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

    // Scroll the advanced settings into view when opened
    $(this).get(0).scrollIntoView({behavior: "smooth"});
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
  updateOSs();
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
  var evolutionLoader = $("input[name=build-time-toggle]:checked").val() !== "0" ?
    Telemetry.loadEvolutionOverTime : Telemetry.loadEvolutionOverBuilds;

  // Obtain a mapping from filter names to filter options
  var filters = {};
  for (var filterName in gFilters) {
    var filterSelector = gFilters[filterName];
    var selection = filterSelector.val() || [];
    if (selection.length != filterSelector.find("option").length) {
      // Not all options are selected, set filter values
      filters[filterName] = selection;
    }
  }

  // Handle the special case for the OS selector
  if (filters.os_version !== undefined) {
    filters.os = deduplicate(filters.os_version.map(function(version) {
      return version.split(",")[0];
    }));
    filters.os_version = filters.os_version.map(function(version) {
      return version.split(",")[1]
    });
  }

  var filterList = [
    ["saved_session"],                                                   // "reason" filter
    filters.hasOwnProperty("product") ? filters["product"] : null,       // "product" filter
    filters.hasOwnProperty("os") ? filters["os"] : null,                 // "os" filter
    filters.hasOwnProperty("os_version") ? filters["os_version"] : null, // "os_version" filter
    filters.hasOwnProperty("arch") ? filters["arch"] : null,             // "arch" filter
  ];

  // Remove unnecessary filters - trailing null entries in the filter list
  for (var i = filterList.length - 1; i >= 0; i --) {
    if (filterList[i] !== null) { break; }
    filterList.pop();
  }

  indicate("Updating histogram...");
  evolutionLoader(channelVersion, measure, function(histogramEvolution) {
    indicate();
    updateDateRange(function(dates) {
      // Update filter options
      var filterOptionsList = getOptions(filterList, histogramEvolution);
      if (dates === null) {
        callback(filterList, filterOptionsList, null, []);
      } else {
        var fullHistogram = histogramEvolution.range(dates[0], dates[dates.length - 1]);
        var filteredHistogram = getFilteredHistogram(
          channelVersion, measure,
          fullHistogram, filters, filterList
        );
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

  var dates = [];

  // Cut off all dates past one year in the future
  if (evolution !== null) {
    var timeCutoff = moment.utc().add(1, "years").toDate().getTime();
    dates = evolution.dates().filter(function(date) { return date <= timeCutoff; });
  }

  if (dates.length === 0) {
    if (evolution.dates().length === 0) {
      $("#date-range").prop("disabled", true);
      $("#range-bar").hide();
    }
    gCurrentDateRangeUpdateCallback(null);
    return;
  }

  var minMoment = moment.utc(dates[0]).format("YYYY-MM-DD");
  var maxMoment = moment.utc(dates[dates.length - 1]).format("YYYY-MM-DD");

  // Update the start and end range and update the selection if necessary
  var picker = $("#date-range").data("daterangepicker");
  picker.setOptions({
    format: "YYYY/MM/DD",
    minDate: minMoment,
    maxDate: maxMoment,
    showDropdowns: true,
    drops: "up", opens: "center",
    ranges: {
      "All": [minMoment, maxMoment],
      "Last 30 Days": [
        moment.utc(maxMoment).subtract(30, "days").format("YYYY-MM-DD"),
        endMoment,
      ],
      "Last 7 Days": [
        moment.utc(maxMoment).subtract(6, "days").format("YYYY-MM-DD"),
        endMoment,
      ],
    },
  }, function(chosenStartMoment, chosenEndMoment, label) {
    updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true);
  });

  // First load, update the date picker from the page state
  var shouldLoadDateRange = !gLoadedDateRangeFromState &&
    gInitialPageState.start_date !== null &&
    gInitialPageState.end_date !== null;
  if (shouldLoadDateRange) {
    gLoadedDateRangeFromState = true;
    var startMoment = gInitialPageState.start_date;
    var endMoment = gInitialPageState.end_date;
    if (moment.utc(startMoment).isValid() && moment.utc(endMoment).isValid()) {
      picker.setStartDate(moment(startMoment));
      picker.setEndDate(moment(endMoment));
      gPreviousMinMoment = minMoment;
      gPreviousMaxMoment = maxMoment;
    }

    // If advanced settings are not at their defaults, expand the settings pane on load
    var fullDates = evolution.dates();
    var advancedSettingsModified = gInitialPageState.use_submission_date !== 0 ||
      gInitialPageState.table !== 0 ||
      gInitialPageState.cumulative !== 0 ||
      gInitialPageState.trim !== 1 ||
      startMoment !== moment.utc(fullDates[0]).format("YYYY-MM-DD") ||
      endMoment !== moment.utc(fullDates[fullDates.length - 1]).format("YYYY-MM-DD");
    if (advancedSettingsModified) {
      $("#advanced-settings-toggle").click();
    }
  }

  // If the selected date range is now out of bounds, or the bounds were updated
  // programmatically and changed, select the entire range
  var pickerStartDate = picker.startDate.format("YYYY-MM-DD");
  var pickerEndDate = picker.endDate.format("YYYY-MM-DD");
  var dateRangeInvalid = pickerStartDate > maxMoment ||
    pickerStartDate < minMoment ||
    pickerEndDate > maxMoment ||
    pickerEndDate < minMoment;
  var dateRangeChanged = !updatedByUser &&
    (minMoment !== gPreviousMinMoment || maxMoment !== gPreviousMaxMoment);
  if (dateRangeInvalid || dateRangeChanged) {
    picker.setStartDate(moment(minMoment)); picker.setEndDate(moment(maxMoment));
    pickerStartDate = minMoment; pickerEndDate = maxMoment;
  }
  gPreviousMinMoment = minMoment; gPreviousMaxMoment = maxMoment;

  // Rebuild rangebar if it was changed by something other than the user
  if (shouldUpdateRangebar) {
    var rangeBarControl = RangeBar({
      min: minMoment, max: moment(maxMoment).add(1, "days").format("YYYY-MM-DD"),
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
        picker.setStartDate(moment(moment.utc(range[0]).format("YYYY-MM-DD")))
        picker.setEndDate(moment(moment.utc(range[1]).subtract(1, "days").format("YYYY-MM-DD")));
        updateDateRange(gCurrentDateRangeUpdateCallback, evolution, true, false);
      }, 50);
    });
    $("#range-bar").empty().append(rangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().width() - dateControls.outerWidth() - 10);
    rangeBarControl.val([[
      moment(pickerStartDate).toDate(),
      moment(pickerEndDate).add(1, "days").toDate(),
    ]]);
  }

  var min = moment.utc(pickerStartDate).toDate(), max = moment.utc(pickerEndDate).toDate();
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
    if (histograms.length === 0) {
      // No more evolutions, probably because a filter had no options selected
      return;
    }
    histograms = [].concat.apply([], histograms.map(function(histogram) {
      var actualOptions = options;
      var fullOptions = histogram.filterOptions();
      if (actualOptions === null) { actualOptions = fullOptions; }
      actualOptions = actualOptions.filter(function(option) {
        return fullOptions.indexOf(option) >= 0
      });
      return actualOptions.map(function(option) {
        return histogram.filter(option);
      });
    }));
  });

  // Filter each histogram's dataset and combine them into a single dataset
  var firstFilterId = histogram._dataset[0][histogram._dataset[0].length + Telemetry.DataOffsets.FILTER_ID];
  var dataset = histograms.map(function(hgram) {
    // precomputeAggregateQuantity will perform the actual filtering for us,
    // and then we set the filter ID manually
    var filteredDataset = hgram._dataset[0].map(function(value, i) {
      return hgram.precomputeAggregateQuantity(i);
    });
    filteredDataset[filteredDataset.length + Telemetry.DataOffsets.FILTER_ID] = firstFilterId;
    return filteredDataset;
  });

  return new Telemetry.Histogram(
    measure, histogram._filter_path, histogram._buckets,
    dataset, histogram._filter_tree, histogram._spec
  );
}

function displayHistogram(histogram, dates, useTable, cumulative, trim) {
  cumulative = cumulative === undefined ? false : cumulative;
  trim = trim === undefined ? true : trim;

  $("#distribution").empty(); // Remove tables if they are present

  // Show that the data is missing if there is no histogram,
  // the histogram has an invalid number of buckets,
  // or the histogram exists but has no samples
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

  // Trim buckets on both ends in the histogram if their counts are too low
  if (trim) {
    // Histograms need at least 3 buckets to render properly,
    // so make sure not to trim off too much
    var countCutoff = totalCount * 0.0001; // Set the samples cutoff to 0.01% of the total samples
    while (counts[0] < countCutoff && counts.length > 3) {
      counts.shift(); starts.shift(); ends.shift();
    }
    while (counts[counts.length - 1] < countCutoff && counts.length > 3) {
      counts.pop(); starts.pop(); ends.pop();
    }
  }

  if (useTable) { // Display the histogram as a table rather than a chart
    displayHistogramTable(starts, ends, counts, histogram);
    return;
  }

  var distributionSamples = counts.map(function(count, i) {
    return {value: i, count: (count / totalCount) * 100};
  });

  // Plot the data using MetricsGraphics
  var axes = $("#distribution").get(0);
  MG.data_graphic({
    data: distributionSamples,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 600,
    left: 150, right: $(axes).width() / (distributionSamples.length + 1),
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
        label = "sample value \u2265 " + formatNumber(cumulative ? 0 : starts[d.x]);
      } else {
        label = formatNumber(cumulative ? 0 : starts[d.x]) +
          " \u2264 sample value < " + formatNumber(ends[d.x]);
      }

      var offset = $(axes).find(".mg-bar:nth-child(" + (i + 1) + ")").get(0).getAttribute("transform");
      var barWidth = $(axes).find(".mg-bar:nth-child(" + (i + 1) + ") rect").get(0).getAttribute("width");
      var x = parseFloat(offset.replace(/^translate\(([-\d\.]+).*$/, "$1"));
      offset = "translate(" + x + ",60)";

      var legend = d3.select(axes).select(".mg-active-datapoint").text(label).attr("transform", offset)
        .attr("x", barWidth / 2).attr("y", "0").attr("text-anchor", "middle").style("fill", "white");
      legend.append("tspan").attr({x: barWidth / 2, y: "1.1em"})
        .text(histogram.measure() + ": " + count + " samples (" + percentage + ")")
        .attr("text-anchor", "middle");

      var bbox = legend[0][0].getBBox();
      if (x - bbox.width / 2 < 0) {
        offset = "translate(" + (bbox.width / 2 + 10) + ",60)";
        legend.attr("transform", offset);
      }
      if (x + bbox.width / 2 > $(axes).find("svg").width() - 5) {
        offset = "translate(" + ($(axes).find("svg").width() - 5 - bbox.width / 2 - 10) + ",60)";
        legend.attr("transform", offset);
      }

      // Add background
      var padding = 5;
      d3.select(axes).select(".active-datapoint-background").remove(); // Remove old background
      d3.select(axes).select("svg").insert("rect", ".mg-active-datapoint")
        .classed("active-datapoint-background", true)
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
    // Remove "NaN" labels resulting from interpolation in histogram labels
    if ($(text).text() === "NaN") {
      text.parentNode.removeChild(text);
    }

    // Move the labels to the right side of the ticks to make it clearer which bar they label
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

function displayHistogramTable(starts, ends, counts, histogram) {
  $("#distribution").empty().append(
    $("<div></div>").css("margin", "0 250px 0 130px").append(
      $("<table></table>").addClass("table table-striped table-hover")
        .css("width", "auto").css("margin", "0 auto").append([
          $("<thead></table>").append(
            $("<tr></tr>").append(
              [
                $("<th></th>").text("Start"),
                $("<th></th>").text("End"),
                $("<th></th>").text("Count"),
                $("<th></th>").text("Percentage"),
              ]
            )
          ),
          $("<tbody></tbody>").append(
            counts.map(function(count, i) {
              return $("<tr></tr>").append(
                [
                  $("<td></td>").text(formatNumber(starts[i])),
                  $("<td></td>").text(formatNumber(ends[i])),
                  $("<td></td>").text(formatNumber(counts[i])),
                  $("<td></td>").text(Math.round(10000 * counts[i] / histogram.count()) / 100 + "%"),
                ]
              )
            })
          ),
      ])
    )
  );
}

// Save the current state to the URL and the page cookie
var gPreviousCSVBlobUrl = null, gPreviousJSONBlobUrl = null;
var gPreviousDisqusIdentifier = null;
function saveStateToUrlAndCookie() {
  var picker = $("#date-range").data("daterangepicker");
  var minChannelVersion = gInitialPageState.min_channel_version;
  gInitialPageState = {
    measure: $("#measure").val(),
    max_channel_version: $("#channel-version").val(),
    table: $("input[name=table-toggle]:checked").val() !== "0" ? 1 : 0,
    cumulative: $("input[name=cumulative-toggle]:checked").val() !== "0" ? 1 : 0,
    use_submission_date: $("input[name=build-time-toggle]:checked").val() !== "0" ? 1 : 0,
    trim: $("input[name=trim-toggle]:checked").val() !== "0" ? 1 : 0,
    start_date: moment(picker.startDate).format("YYYY-MM-DD"),
    end_date: moment(picker.endDate).format("YYYY-MM-DD"),

    // Save a few unused properties that are used in the evolution dashboard,
    // since state is shared between the two dashboards
    sanitize: gInitialPageState.sanitize !== undefined ?
      gInitialPageState.sanitize : 1,
  };

  // Save a few unused properties that are used in the evolution dashboard,
  // since state is shared between the two dashboards
  if (minChannelVersion !== undefined) {
    gInitialPageState.min_channel_version = minChannelVersion;
  }

  // Only store these in the state if they are not all selected
  var selected = $("#filter-product").val() || [];
  if (selected.length !== $("#filter-product option").size()) {
    gInitialPageState.product = selected;
  }
  var selected = $("#filter-os").val() || [];
  if (selected.length !== $("#filter-os option").size()) {
    gInitialPageState.os = compressOSs();
  }
  var selected = $("#filter-arch").val() || [];
  if (selected.length !== $("#filter-arch option").size()) {
    gInitialPageState.arch = selected;
  }

  var stateString = Object.keys(gInitialPageState).sort().map(function(key) {
    var value = gInitialPageState[key];
    if ($.isArray(value)) { value = value.join("!"); }
    return encodeURIComponent(key) + "=" + encodeURIComponent(value);
  }).join("&");

  // Save to the URL hash if it changed
  var url = "";
  var index = window.location.href.indexOf("#");
  if (index > -1) { url = decodeURI(window.location.href.substring(index + 1)); }
  if (url[0] == "!") { url = url.slice(1); }
  if (url !== stateString) {
    window.location.replace(
      window.location.origin + window.location.pathname + "#!" + encodeURI(stateString)
    );
    $(".permalink-control input").hide(); // Hide the permalink box again since the URL changed
  }

  // Save the state in a cookie that expires in 3 days
  var expiry = new Date();
  expiry.setTime(expiry.getTime() + (3 * 24 * 60 * 60 * 1000));
  document.cookie = "stateFromUrl=" + stateString + "; expires=" + expiry.toGMTString();

  // Add link to switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin +
    window.location.pathname.replace(/dist\.html$/, "evo.html") +
    window.location.hash;
  $("#switch-views").attr("href", dashboardURL);

  // Update export links with the new histogram
  if (gCurrentHistogram !== null) {
    if (gPreviousCSVBlobUrl !== null) { URL.revokeObjectURL(gPreviousCSVBlobUrl); }
    if (gPreviousJSONBlobUrl !== null) { URL.revokeObjectURL(gPreviousJSONBlobUrl); }
    var jsonHistogram;
    if ($("input[name=cumulative-toggle]:checked").val() !== "0") {
      var total = 0;
      jsonHistogram = gCurrentHistogram.map(function(count, start, end, i) {
        total += count;
        return {start: start, count: total, percentage: 100 * total / gCurrentHistogram.count()};
      });
    } else {
      jsonHistogram = gCurrentHistogram.map(function(count, start, end, i) {
        return {start: start, count: count, percentage: 100 * count / gCurrentHistogram.count()}
      });
    }
    var csvValue = "start,\tcount,\tpercentage\n" + jsonHistogram.map(function (entry) {
      return entry.start + ",\t" + entry.count + ",\t" + entry.percentage;
    }).join("\n");
    var jsonValue = JSON.stringify(jsonHistogram, null, 2);
    gPreviousCSVBlobUrl = URL.createObjectURL(new Blob([csvValue]));
    gPreviousJSONBlobUrl = URL.createObjectURL(new Blob([jsonValue]));
    $("#export-csv").attr("href", gPreviousCSVBlobUrl)
      .attr("download", gCurrentHistogram.measure() + ".csv");
    $("#export-json").attr("href", gPreviousJSONBlobUrl)
      .attr("download", gCurrentHistogram.measure() + ".json");
  }

  // If advanced settings are not at their defaults, display a notice in the panel header
  var start = gInitialPageState.start_date, end = gInitialPageState.end_date;
  if (gCurrentEvolution !== null) {
    var fullDates = gCurrentEvolution.dates();
    var startMoment = moment.utc(fullDates[0]).format("YYYY-MM-DD");
    var endMoment = moment.utc(fullDates[fullDates.length - 1]).format("YYYY-MM-DD");
  } else {
    var startMoment = start, endMoment = end;
  }

  var advancedSettingsModified = gInitialPageState.use_submission_date !== 0 ||
    gInitialPageState.table !== 0 ||
    gInitialPageState.cumulative !== 0 ||
    gInitialPageState.trim !== 1 ||
    start !== startMoment || end !== endMoment;
  if (advancedSettingsModified) {
    $("#advanced-settings-toggle").find("span").text(" (modified)");
  } else {
    $("#advanced-settings-toggle").find("span").text("");
  }

  // Reload Disqus comments for the new page state
  var identifier = "dist@" + gInitialPageState.measure;
  if (identifier !== gPreviousDisqusIdentifier) {
    gPreviousDisqusIdentifier = identifier;
    DISQUS.reset({
      reload: true,
      config: function () {
        this.page.identifier = identifier;
        this.page.url = window.location.href;
        console.log("reloading comments for page ID ", this.page.identifier)
      }
    });
  }
}

})();
