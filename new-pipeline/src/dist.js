var gInitialPageState = null;
var gFilterChangeTimeout = null;
var gCurrentHistogramsList = null;
var gCurrentDates = null;
var gCurrentMinDate = null,
  gCurrentMaxDate = null;
var gFilters;
var gPreviousFilterAllSelected = {};
var gAxesList;
var gAxesSelectors;
var gNoneKey = "__none__";

indicate("Initializing Telemetry...");

$(function () {
  Telemetry.init(function () {
    gFilters = {
      "application": $("#filter-product"),
      "os": $("#filter-os"),
      "architecture": $("#filter-arch"),
      "e10sEnabled": $("#filter-e10s"),
      "child": $("#filter-process-type"),
    };
    gAxesList = [
    $("#distribution1")
      .get(0), $("#distribution2")
      .get(0),
    $("#distribution3")
      .get(0), $("#distribution4")
      .get(0),
  ];
    gAxesSelectors = [
    $("#selected-key1"),
    $("#selected-key2"),
    $("#selected-key3"),
    $("#selected-key4"),
  ]
    gInitialPageState = loadStateFromUrlAndCookie();

    // Set up settings selectors
    multiselectSetOptions($("#channel-version"),
      getHumanReadableOptions("channelVersion", Telemetry.getVersions())
    );
    if (gInitialPageState.max_channel_version !== undefined) {
      if (gInitialPageState.max_channel_version === null) { // No version selected, select the latest nightly
        var nightlyVersions = Telemetry.getVersions()
          .filter(function (channelVersion) {
            return channelVersion.startsWith("nightly/");
          })
          .sort();
        gInitialPageState.max_channel_version = nightlyVersions[
          nightlyVersions.length - 1];
      }
      $("#channel-version")
        .next()
        .find("input[type=radio]")
        .attr("checked", false);
      $("#channel-version")
        .multiselect("select", gInitialPageState.max_channel_version);
    }
    if (gInitialPageState.compare !== undefined) {
      $("#compare")
        .multiselect("select", gInitialPageState.compare);
    }

    // Initialize setting values from the page state
    $("#sort-keys")
      .multiselect("select", gInitialPageState.sort_keys);
    $("input[name=table-toggle][value=" + (gInitialPageState.table !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");
    $("input[name=cumulative-toggle][value=" + (gInitialPageState.cumulative !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");
    $("input[name=trim-toggle][value=" + (gInitialPageState.trim !== 0 ?
        1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");
    $("input[name=build-time-toggle][value=" + (gInitialPageState.use_submission_date !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");
    $("input[name=sanitize-toggle][value=" + (gInitialPageState.sanitize !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");

    updateOptions(function () {
      if (gInitialPageState.product !== null) {
        $("#filter-product")
          .multiselect("select", gInitialPageState.product);
      } else {
        $("#filter-product")
          .multiselect("selectAll", false)
          .multiselect("updateButtonText");
      }
      if (gInitialPageState.arch !== null) {
        $("#filter-arch")
          .multiselect("select", gInitialPageState.arch);
      } else {
        $("#filter-arch")
          .multiselect("selectAll", false)
          .multiselect("updateButtonText");
      }
      if (gInitialPageState.e10s !== null) {
        $("#filter-e10s")
          .multiselect("select", gInitialPageState.e10s);
      } else {
        $("#filter-e10s")
          .multiselect("selectAll", false)
          .multiselect("updateButtonText");
      }
      if (gInitialPageState.processType !== null) {
        $("#filter-process-type")
          .multiselect("select", gInitialPageState.processType);
      } else {
        $("#filter-process-type")
          .multiselect("select", "*")
          .multiselect("updateButtonText");
      }

      if (gInitialPageState.os !== null) { // We accept values such as "WINNT", as well as "WINNT,6.1"
        $("#filter-os")
          .multiselect("select", expandOSs(gInitialPageState.os));
      } else {
        $("#filter-os")
          .multiselect("selectAll", false)
          .multiselect("updateButtonText");
      }

      for (var filterName in gFilters) {
        var selector = gFilters[filterName];
        if (["filter-product", "filter-os"].indexOf(selector.attr(
            "id")) >= 0) { // Only apply the select all change to the product and OS selector
          var selected = selector.val() || [],
            options = selector.find("option");
          gPreviousFilterAllSelected[selector.attr("id")] =
            selected.length === options.length;
        }
      }

      $("#channel-version")
        .change(function () {
          updateOptions(function () {
            $("#measure")
              .trigger("change");
          });
        });
      $([
        "input[name=build-time-toggle]",
        "input[name=sanitize-toggle]",
        "#sort-keys",
        "#measure",
        "#filter-product",
        "#filter-os",
        "#filter-arch",
        "#filter-e10s",
        "#filter-process-type",
        "#compare",
      ].join(",")).change(function (e) {
          var $this = $(this);
          if (gFilterChangeTimeout !== null) {
            clearTimeout(gFilterChangeTimeout);
          }
          gFilterChangeTimeout = setTimeout(function () { // Debounce the changes to prevent rapid filter changes from causing too many updates
            if (["filter-product", "filter-os"].indexOf($this
                .attr("id")) >= 0) { // Only apply the select all change to the product and OS selector
              // If options (but not all options) were deselected when previously all options were selected, invert selection to include only those deselected
              var selected = $this.val() || [],
                options = $this.find("option");
              if (selected.length !== options.length &&
                selected.length > 0 &&
                gPreviousFilterAllSelected[$this.attr("id")]) {
                var nonSelectedOptions = options.map(function (
                    i, option) {
                    return option.getAttribute("value");
                  })
                  .toArray()
                  .filter(function (filterOption) {
                    return selected.indexOf(filterOption) <
                      0;
                  });
                $this.multiselect("deselectAll")
                  .multiselect("select", nonSelectedOptions);
              }
              gPreviousFilterAllSelected[$this.attr("id")] =
                selected.length === options.length; // Store state
            }
            updateOSs();

            calculateHistograms(function (histogramsMap,
                evolutionsMap) {
                // histogramsMap is a mapping from keyed histogram keys (or "" if not a keyed histogram) to lists of histograms (one per comparison option, so each histogram in a list has the same buckets)
                // evolutionsMap is a mapping from keyed histogram keys (or "" if not a keyed histogram) to lists of evolutions (one per comparison option, so each evolution in a list has the same dates)

                // Get the set union of all the dates in all the evolutions
                var datesMap = {};
                for (var label in evolutionsMap) {
                  evolutionsMap[label][0].dates()
                    .forEach(function (date) {
                      datesMap[date.getTime()] = true;
                    });
                }
                gCurrentDates = Object.keys(datesMap)
                  .map(function (dateString) {
                    return new Date(parseInt(dateString));
                  })
                  .sort(function (a, b) {
                    return a - b;
                  });

                // Set up key selectors, selecting the previously selected key if it still exists and the first key otherwise
                var getAggregate = { // Function to get an aggregate for a list of histograms, used for sorting later
                  "submissions": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.count;
                    }, 0);
                  },
                  "mean": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.mean();
                    }, 0) / histograms.length;
                  },
                  "5th-percentile": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.percentile(
                        5);
                    }, 0) / histograms.length;
                  },
                  "25th-percentile": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.percentile(
                        25);
                    }, 0) / histograms.length;
                  },
                  "median": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.percentile(
                        50);
                    }, 0) / histograms.length;
                  },
                  "75th-percentile": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.percentile(
                        75);
                    }, 0) / histograms.length;
                  },
                  "95th-percentile": function (histograms) {
                    return histograms.reduce(function (
                      total, histogram) {
                      return total + histogram.percentile(
                        95);
                    }, 0) / histograms.length;
                  },
                }[$("#sort-keys")
                  .val()];
                if (getAggregate === undefined) {
                  throw "Could not obtain aggregate function"
                };

                gCurrentHistogramsList = Object.keys(
                    histogramsMap)
                  .map(function (label) {
                    return {
                      title: label,
                      histograms: histogramsMap[label]
                    };
                  })
                  .sort(function (entry1, entry2) { // Sort by the desired aggregate
                    return getAggregate(entry2.histograms) -
                      getAggregate(entry1.histograms);
                  });

                var keys = gCurrentHistogramsList.map(
                  function (entry) {
                    return entry.title;
                  });
                var options = getHumanReadableOptions("key",
                  keys);
                gAxesSelectors.forEach(function (selector,
                  i) {
                  multiselectSetOptions(selector,
                    options.concat([[gNoneKey,
                      "(none)"]]));

                  // If the recalculation was done as a result of resorting keys, reset the keys to the top 4
                  if ($this.attr("id") === "sort-keys") {
                    gInitialPageState.keys = options.map(
                        function (option) {
                          return option[0]
                        })
                      .filter(function (value, i) {
                        return i < 4;
                      });
                  }

                  // There is a bug in bootstrap-multiselect where, upon selection when existing items are selected,
                  // the existing item's radio button does not become deselected - we work around this by manually clearing
                  // all the buttons, which works pretty well
                  selector.multiselect("deselectAll",
                      false)
                    .next()
                    .find("input[type=radio]")
                    .attr("checked", false);

                  // Select i-th key if possible, otherwise none
                  if (i < options.length) {
                    selector.multiselect("select",
                      options[i][0]);
                  } else {
                    selector.multiselect("select",
                      gNoneKey);
                  }
                });
                if (gInitialPageState.keys) { // Reselect previously selected keys
                  gInitialPageState.keys.forEach(function (
                    key, i) {
                    if (key !== gNoneKey) {
                      // Check to make sure the key can actually still be selected
                      if (gAxesSelectors[i].find(
                          "option")
                        .filter(function (i, option) {
                          return $(option)
                            .val() === key;
                        })
                        .length > 0) {
                        gAxesSelectors[i].next()
                          .find("input[type=radio]")
                          .attr("checked", false);
                        gAxesSelectors[i].multiselect(
                          "select", key);
                      }
                    }
                  });
                }

                $("#selected-key1")
                  .trigger("change");
              }, $("input[name=sanitize-toggle]:checked")
              .val() !== "0");
          }, 0);
        });

      $(
          "#selected-key1, #selected-key2, #selected-key3, #selected-key4, input[name=table-toggle], input[name=cumulative-toggle], input[name=trim-toggle]"
        )
        .change(function (e) {
          if (gCurrentHistogramsList.length > 1) { // Keyed histogram with multiple keys, find the selected keys
            var histogramsList = [];
            var keys = gAxesSelectors.forEach(function (selector,
              i) {
              var key = $(selector)
                .val();
              if (key === gNoneKey) {
                histogramsList.push({
                  title: "",
                  histograms: []
                });
              } else {
                gCurrentHistogramsList.forEach(function (
                  entry) {
                  if (entry.title === key) {
                    histogramsList.push(entry);
                  }
                });
              }
            });
          } else { // Non-keyed histogram or a keyed histogram with only one key
            var histogramsList = gCurrentHistogramsList;
          }
          displayHistograms(histogramsList, gCurrentDates, $(
              "input[name=table-toggle]:checked")
            .val() !== "0", $(
              "input[name=cumulative-toggle]:checked")
            .val() !== "0", $("input[name=trim-toggle]:checked")
            .val() !== "0");
          saveStateToUrlAndCookie();
        });

      // Perform a full display refresh
      $("#measure")
        .trigger("change");
    });

    var resizeUpdateTimeout = null;
    $(window)
      .resize(function () {
        // Automatically resize range bar
        var dateControls = $("#date-range-controls");
        $("#range-bar")
          .outerWidth(dateControls.parent()
            .width() - dateControls.outerWidth() - 10);

        // Resize the main plot (MetricsGraphics has a full_width option, but that breaks zooming for plots)
        if (resizeUpdateTimeout !== null) {
          clearTimeout(resizeUpdateTimeout);
        }
        resizeUpdateTimeout = setTimeout(function () {
          $("#selected-key1")
            .trigger("change");
        }, 50);
      });
    $("#advanced-settings")
      .on("shown.bs.collapse", function () {
        var dateControls = $("#date-range-controls");
        $("#range-bar")
          .outerWidth(dateControls.parent()
            .width() - dateControls.outerWidth() - 10);
        $(this)
          .get(0)
          .scrollIntoView({
            behavior: "smooth"
          }); // Scroll the advanced settings into view when opened
      });
  });
});

function updateOptions(callback) {
  var channelVersion = $("#channel-version")
    .val();
  var parts = channelVersion.split("/"); //wip: clean this up
  indicate("Updating options...");

  var operation = asyncOperationCheck("updateOptions");
  Telemetry.getFilterOptions(parts[0], parts[1], function (optionsMap) {
    if (asyncOperationWasInterrupted("updateOptions", operation)) { // Don't call callback if this isn't the latest invocation of the function
      return;
    }

    multiselectSetOptions($("#measure"), getHumanReadableOptions("measure",
      deduplicate(optionsMap.metric || [])));
    $("#measure")
      .multiselect("select", gInitialPageState.measure);

    multiselectSetOptions($("#filter-product"), getHumanReadableOptions(
      "application", deduplicate(optionsMap.application || [])));
    multiselectSetOptions($("#filter-arch"), getHumanReadableOptions(
      "architecture", deduplicate(optionsMap.architecture || [])));
    multiselectSetOptions($("#filter-e10s"), getHumanReadableOptions(
      "e10sEnabled", deduplicate(optionsMap.e10sEnabled || [])));
    multiselectSetOptions($("#filter-process-type"),
      getHumanReadableOptions("child", deduplicate(optionsMap.child || []))
    );

    // Compressing and expanding the OSs also has the effect of making OSs where all the versions were selected also all selected in the new one, regardless of whether those versions were actually in common or not
    var selectedOSs = compressOSs();
    multiselectSetOptions($("#filter-os"), getHumanReadableOptions("os",
      deduplicate(optionsMap.os || [])));
    $("#filter-os")
      .multiselect("select", expandOSs(selectedOSs));

    if (callback !== undefined) {
      indicate();
      callback();
    }
  });
}

function calculateHistograms(callback, sanitize) {
  // Get selected version, measure, and aggregate options
  var channelVersion = $("#channel-version")
    .val();
  var measure = $("#measure")
    .val();

  var comparisonName = $("#compare")
    .val();
  var filterSetsMapping = getFilterSetsMapping(gFilters, comparisonName !== "" ?
    comparisonName : null); // Mapping from option values to lists of filter sets
  var totalFilters = 0;
  for (var option in filterSetsMapping) {
    totalFilters += filterSetsMapping[option].length;
  }

  if (totalFilters === 0 || measure === null) { // No filters selected, or no measures available, so no histograms could be created
    indicate();
    updateDateRange(function (dates) {
      callback({}, {});
    }, [], false);
    return;
  }

  var useSubmissionDate = $("input[name=build-time-toggle]:checked")
    .val() !== "0";
  var fullEvolutionsMap = {}; // Mapping from labels (the keys in keyed histograms) to lists of combined filtered evolutions (one per comparison option, combined from all filter sets in that option)
  var optionValues = {}; // Map from labels to lists of options in the order that they were done being processed, rather than the order they appeared in
  var filterSetsCount = 0,
    totalFiltersCount = 0;
  var filterSetsMappingOptions = Object.keys(filterSetsMapping);

  var operation = asyncOperationCheck("calculateHistograms");
  filterSetsMappingOptions.forEach(function (filterSetsMappingOption, i) { // For each option being compared by
    var filterSets = filterSetsMapping[filterSetsMappingOption];
    var filtersCount = 0,
      fullEvolutionMap = {};
    indicate("Updating histograms...");
    filterSets.forEach(function (filterSet) {
      var parts = channelVersion.split("/");
      Telemetry.getEvolution(parts[0], parts[1], measure, filterSet,
        useSubmissionDate,
        function (evolutionMap) {
          if (asyncOperationWasInterrupted("calculateHistograms",
              operation)) { // Don't call callback if this isn't the latest invocation of the function
            return;
          }

          totalFiltersCount++;
          filtersCount++;
          indicate("Updating histograms... ", 100 * totalFiltersCount /
            totalFilters);

          for (var label in evolutionMap) {
            if (fullEvolutionMap.hasOwnProperty(label)) {
              fullEvolutionMap[label] = fullEvolutionMap[label].combine(
                evolutionMap[label]);
            } else {
              fullEvolutionMap[label] = evolutionMap[label];
            }
          }

          if (filtersCount === filterSets.length) { // Check if we have loaded all the needed filters in the current filter set
            filterSetsCount++;
            for (var label in fullEvolutionMap) { // Make a list of evolutions and option labels for each label in the evolution
              if (sanitize) {
                fullEvolutionMap[label] = fullEvolutionMap[label].sanitized();
              }
              if (!fullEvolutionMap[label]) {
                continue; // data was sanitized away. Move along.
              }
              if (!fullEvolutionsMap.hasOwnProperty(label)) {
                fullEvolutionsMap[label] = [];
              }
              if (fullEvolutionMap[label] !== null) {
                fullEvolutionsMap[label].push(fullEvolutionMap[label]);
              }
              if (!optionValues.hasOwnProperty(label)) {
                optionValues[label] = [];
              }
              optionValues[label].push(filterSetsMappingOption); // Add the current option value being compared by
            }
            if (filterSetsCount === filterSetsMappingOptions.length) { // Check if we have loaded all the filter set collections
              indicate();

              // Get the set union of all the dates in all the evolutions
              var datesMap = {};
              for (var label in fullEvolutionsMap) {
                if (fullEvolutionsMap[label].length > 0) {
                  fullEvolutionsMap[label][0].dates()
                    .forEach(function (date) {
                      datesMap[date.getTime()] = true;
                    });
                }
              }
              var dates = Object.keys(datesMap)
                .map(function (dateString) {
                  return new Date(parseInt(dateString));
                })
                .sort(function (a, b) {
                  return a - b;
                });

              updateDateRange(function (dates) {
                if (dates == null) { // No dates in the selected range, so no histograms available
                  callback({}, {});
                } else { // Filter the evolution to include only those histograms that are in the selected range
                  var filteredEvolutionsMap = {},
                    filteredHistogramsMap = {};
                  for (var label in fullEvolutionsMap) {
                    var filteredEntries = fullEvolutionsMap[label]
                      .map(function (evolution, i) {
                        return {
                          option: optionValues[label][i],
                          evolution: evolution.dateRange(dates[
                            0], dates[dates.length - 1])
                        }; // We don't need to worry about this returning null since the dates came from the evolution originally
                      })
                      .filter(function (entry) {
                        return entry.evolution !== null;
                      });
                    var filteredEvolutions = filteredEntries.map(
                      function (entry) {
                        return entry.evolution;
                      });
                    var filteredOptionValues = filteredEntries.map(
                      function (entry) {
                        return entry.option;
                      });
                    if (filteredEvolutions.length > 0) { // There are evolutions in this date
                      filteredEvolutionsMap[label] =
                        filteredEvolutions;
                      filteredHistogramsMap[label] =
                        filteredEvolutions.map(function (
                          evolution, i) {
                          var histogram = evolution.histogram();
                          if (comparisonName !== "") { // We are comparing by an option value
                            var humanReadableOption =
                              getHumanReadableOptions(
                                comparisonName, [
                                  filteredOptionValues[i]])[0][
                                1];
                            histogram.measure =
                              humanReadableOption;
                          }
                          return histogram;
                        })
                        .sort(function (histogram1, histogram2) {
                          return histogram1.measure <
                            histogram2.measure ?
                            -1 : (histogram1.measure >
                              histogram2.measure ? 1 : 0);
                        });
                    }
                  }
                  callback(filteredHistogramsMap,
                    filteredEvolutionsMap);
                }
              }, dates, false);
            }
          }
        });
    });
  });
}

var gLastTimeoutID = null;
var gLoadedDateRangeFromState = false;
var gCurrentDateRangeUpdateCallback = null; // This is used by the date range slider so we dispatch the correct callback even if we aren't updating the date range
var gPreviousMinMoment = null,
  gPreviousMaxMoment = null;

function updateDateRange(callback, dates, updatedByUser, shouldUpdateRangebar) { // dates is null for when there are no evolutions
  shouldUpdateRangebar = shouldUpdateRangebar === undefined ? true :
    shouldUpdateRangebar;

  gCurrentDateRangeUpdateCallback = callback || function () {};

  if (dates.length === 0) {
    $("#date-range")
      .prop("disabled", true);
    $("#range-bar")
      .hide();
    gCurrentDateRangeUpdateCallback(null);
    return;
  }
  $("#date-range")
    .prop("disabled", false);
  $("#range-bar")
    .show();

  var timeCutoff = moment.utc()
    .add(1, "years")
    .toDate()
    .getTime();
  if (dates[dates.length - 1] > timeCutoff) {
    dates = dates.filter(function (date) {
      return date < timeCutoff
    });
  }
  var minMoment = moment.utc(dates[0])
    .format("YYYY-MM-DD"),
    maxMoment = moment.utc(dates[dates.length - 1])
    .format("YYYY-MM-DD");
  gCurrentMinDate = minMoment, gCurrentMaxDate = maxMoment;

  // Update the start and end range and update the selection if necessary
  var picker = $("#date-range")
    .data("daterangepicker");
  picker.setOptions({
    format: "YYYY/MM/DD",
    minDate: minMoment,
    maxDate: maxMoment,
    showDropdowns: true,
    drops: "up",
    opens: "center",
    ranges: {
      "All": [minMoment, maxMoment],
      "Last 30 days of data": [moment.utc(maxMoment)
        .subtract(30, "days")
        .format("YYYY-MM-DD"), endMoment],
      "Last 7 days of data": [moment.utc(maxMoment)
        .subtract(6, "days")
        .format("YYYY-MM-DD"), endMoment],
    },
  }, function (chosenStartMoment, chosenEndMoment, label) {
    updateDateRange(gCurrentDateRangeUpdateCallback, dates, true);
  });

  // First load, update the date picker from the page state
  if (!gLoadedDateRangeFromState && gInitialPageState.start_date !== null &&
    gInitialPageState.end_date !== null) {
    gLoadedDateRangeFromState = true;
    var startMoment = gInitialPageState.start_date,
      endMoment = gInitialPageState.end_date;
    if (moment.utc(startMoment)
      .isValid() && moment.utc(endMoment)
      .isValid()) {
      picker.setStartDate(startMoment);
      picker.setEndDate(endMoment);
      gPreviousMinMoment = minMoment;
      gPreviousMaxMoment = maxMoment;
    }

    // If advanced settings are not at their defaults, expand the settings pane on load
    var isKeyedHistogram = $("#sort-keys-option").css("display") !== "none";
    if (gInitialPageState.use_submission_date !== 0 || gInitialPageState.table !==
      0 || gInitialPageState.cumulative !== 0 || gInitialPageState.trim !== 1 ||
      (isKeyedHistogram && gInitialPageState.sort_keys !== "submissions") ||
      startMoment !== minMoment || endMoment !== maxMoment) {
      $("#advanced-settings-toggle")
        .click();
    }
  }

  // If the selected date range is now out of bounds, or the bounds were updated programmatically and changed, select the entire range
  var pickerStartDate = picker.startDate.format("YYYY-MM-DD");
  var pickerEndDate = picker.endDate.format("YYYY-MM-DD");
  if (pickerStartDate > maxMoment || pickerStartDate < minMoment ||
    pickerEndDate > maxMoment || pickerEndDate < minMoment ||
    (!updatedByUser && (minMoment !== gPreviousMinMoment || maxMoment !==
      gPreviousMaxMoment))) {
    picker.setStartDate(minMoment);
    picker.setEndDate(maxMoment);
    pickerStartDate = minMoment;
    pickerEndDate = maxMoment;
  }
  gPreviousMinMoment = minMoment;
  gPreviousMaxMoment = maxMoment;

  // Rebuild rangebar if it was changed by something other than the user
  if (shouldUpdateRangebar) {
    var rangeBarControl = RangeBar({
        min: minMoment,
        max: moment(maxMoment)
          .add(1, "days")
          .format("YYYY-MM-DD"),
        maxRanges: 1,
        valueFormat: function (ts) {
          return ts;
        },
        valueParse: function (date) {
          return moment.utc(date)
            .valueOf();
        },
        label: function (a) {
          var days = (a[1] - a[0]) / 86400000;
          return days < 5 ? days : moment.utc(a[1])
            .from(a[0], true);
        },
        snap: 1000 * 60 * 60 * 24,
        minSize: 1000 * 60 * 60 * 24,
        bgLabels: 0,
      })
      .on("changing", function (e, ranges, changed) {
        var range = ranges[0];
        if (gLastTimeoutID !== null) {
          clearTimeout(gLastTimeoutID);
        }
        gLastTimeoutID = setTimeout(function () { // Debounce slider movement callback
          picker.setStartDate(moment.utc(range[0])
            .format("YYYY-MM-DD"))
          picker.setEndDate(moment.utc(range[1])
            .subtract(1, "days")
            .format("YYYY-MM-DD"));
          updateDateRange(gCurrentDateRangeUpdateCallback, dates, true,
            false);
        }, 50);
      });
    $("#range-bar")
      .empty()
      .append(rangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar")
      .outerWidth(dateControls.parent()
        .width() - dateControls.outerWidth() - 10);
    rangeBarControl.val([[moment(pickerStartDate)
      .toDate(), moment(pickerEndDate)
      .add(1, "days")
      .toDate()]]);
  }

  var min = moment.utc(pickerStartDate)
    .toDate(),
    max = moment.utc(pickerEndDate)
    .toDate();
  var filteredDates = dates.filter(function (date) {
    return min <= date && date <= max;
  });

  if (filteredDates.length == 0) {
    if (dates.length === 0) {
      $("#date-range")
        .prop("disabled", true);
      $("#range-bar")
        .hide();
    }
    gCurrentDateRangeUpdateCallback(null);
  } else {
    gCurrentDateRangeUpdateCallback(filteredDates);
  }
}

function displayHistograms(histogramsList, dates, useTable, cumulative, trim) {
  cumulative = cumulative === undefined ? false : cumulative;
  trim = trim === undefined ? true : trim;

  var minTrimLeft = 0,
    minTrimRight = 0,
    maxPercentage = 0;
  histogramsList.forEach(function (entry) { // Find the largest percentage on the graph to determine the upper bound for all the graphs
    if (cumulative) {
      maxPercentage = 100;
    } // Cumulative histograms always have a max percentage of 100%
    else {
      entry.histograms.forEach(function (histogram) {
        histogram.map(function (count, start, end, i) {
          if (100 * count / histogram.count > maxPercentage) {
            maxPercentage = 100 * count / histogram.count;
          }
        });
      });
    }
  });

  if (trim) { // Figure out how much to trim buckets on both ends in the histogram if their counts are too low
    // Histograms must have at least 3 buckets to render properly, so ensure that we don't trim them too much
    minTrimLeft = Infinity;
    minTrimRight = Infinity;
    histogramsList.forEach(function (entry) {
      if (entry.histograms.length === 0) { // No histograms, don't consider it in the trimming calculation
        return;
      }
      var trimLeft = 0,
        trimRight = 0;
      var countsList = entry.histograms.map(function (histogram) {
        return histogram.map(function (count, start, end, i) {
          return count;
        });
      });
      if (cumulative) { // Show cumulative histogram by adding up all the previous data points
        countsList = countsList.map(function (counts) {
          var total = 0;
          return counts.map(function (count) {
            return total += count;
          });
        });
      }
      var countList = countsList[0].map(function (count) {
        return 0;
      });
      countsList.forEach(function (counts) {
        counts.forEach(function (count, i) {
          countList[i] += count;
        });
      });
      var total = countList.reduce(function (total, count) {
        return total + count;
      }, 0);
      var countCutoff = total * 0.0001; // Set the samples cutoff to 0.01% of the total samples
      while (countList[trimLeft] < countCutoff && countList.length -
        trimLeft - trimRight > 3) {
        trimLeft++;
      }
      while (countList[countList.length - 1 - trimRight] < countCutoff &&
        countList.length - trimLeft - trimRight > 3) {
        trimRight++;
      }
      if (trimLeft < minTrimLeft) {
        minTrimLeft = trimLeft;
      }
      if (trimRight < minTrimRight) {
        minTrimRight = trimRight;
      }
    });
  }

  if (histogramsList.length > 0 && histogramsList[0].histograms.length > 0) {
    // Set the histogram caption to the histogram description
    var description = histogramsList[0].histograms[0].description
    var metric = histogramsList[0].histograms[0].measure
    var channel = $("#channel-version").val().split("/")[0]
    var desc = getDescriptionWithLink(metric, channel, description)

    $('#dist-caption').html(desc);
  } else {
    $('#dist-caption').text(""); // Clear the histogram caption
  }

  if (histogramsList.length <= 1) { // Only one histograms set
    if (histogramsList.length === 1 && histogramsList[0].histograms.length ===
      1) { // Only show one set of axes
      var histogram = histogramsList[0].histograms[0];
      $("#prop-kind")
        .text(histogram.kind);
      $("#prop-dates")
        .text(formatNumber(dates.length));
      $("#prop-date-range")
        .text(moment.utc(dates[0])
          .format("YYYY/MM/DD") + ((dates.length == 1) ? "" : " to " + moment.utc(
              dates[dates.length - 1])
            .format("YYYY/MM/DD")));
      $("#prop-submissions")
        .text(formatNumber(histogram.submissions));
      $("#prop-count")
        .text(formatNumber(histogram.count));
      $("#prop-sum")
        .text(formatNumber(histogram.sum));
      if (histogram.kind == "linear" || histogram.kind == "exponential") {
        $("#prop-p5")
          .text(formatNumber(histogram.percentile(5)));
        $("#prop-p25")
          .text(formatNumber(histogram.percentile(25)));
        $("#prop-p50")
          .text(formatNumber(histogram.percentile(50)));
        $("#prop-p75")
          .text(formatNumber(histogram.percentile(75)));
        $("#prop-p95")
          .text(formatNumber(histogram.percentile(95)));
        $(".scalar-only")
          .show();
      } else {
        $(".scalar-only")
          .hide();
      }
      $("#summary")
        .show();
      $("#stats-comparison")
        .hide();

    } else {
      $("#medians")
        .empty()
        .append(
          histogramsList[0].histograms.map(function(histogram) {
            $measure = $("<dt></dt>").text(histogram.measure + " Median");
            $value = $("<dd></dd>").text(formatNumber(histogram.percentile(50)));
            return $measure.add($value);
          })
        );
      $("#summary")
        .hide();
      $("#stats-comparison")
        .show();
    }

    $("#plots")
      .removeClass("col-md-11")
      .addClass("col-md-9");
    gAxesList.forEach(function (axes) {
      $(axes)
        .parent()
        .parent()
        .hide();
    });
    $(gAxesList[0])
      .show();
    var axesContainer = $(gAxesList[0])
      .parent()
      .parent();
    axesContainer.removeClass("col-md-6")
      .addClass("col-md-12")
      .show();
    if (isHistogramsListKeyed(histogramsList)) {
      axesContainer.find("h3").show();
      $("#sort-keys-option").show();
    } else {
      axesContainer.find("h3").hide(); // Hide the graph title as it doesn't need one
      $("#sort-keys-option").hide();
    }

    if (histogramsList.length > 0) {
      displaySingleHistogramSet($("#distribution1")
        .get(0), useTable, histogramsList[0].histograms, histogramsList[0].title,
        cumulative, minTrimLeft, minTrimRight, maxPercentage);
    } else {
      displaySingleHistogramSet($("#distribution1")
        .get(0), useTable, [], "", cumulative, minTrimLeft, minTrimRight,
        maxPercentage);
    }
  } else { // Show all four axes
    $("#summary")
      .hide();
    $("#stats-comparison")
      .hide();
    $("#plots")
      .removeClass("col-md-9")
      .addClass("col-md-11");
    gAxesList.forEach(function (axes, i) {
      var axesContainer = $(axes)
        .parent()
        .parent()
        .show();
      axesContainer.removeClass("col-md-12")
        .addClass("col-md-6")
        .show();
      axesContainer.find("h3")
        .show(); // Show the graph title to allow key selection
      $("#sort-keys-option")
        .show();

      var entry = histogramsList[i] || null;
      if (entry !== null) { // Histogram for this entry actually exists, so draw it
        displaySingleHistogramSet(axes, useTable, entry.histograms, entry.title,
          cumulative, minTrimLeft, minTrimRight, maxPercentage);
      } else { // No entry, display missing data
        displaySingleHistogramSet(axes, useTable, [], null, cumulative,
          minTrimLeft, minTrimRight, maxPercentage);
      }
    });
  }
}

function displaySingleHistogramSet(axes, useTable, histograms, title,
  cumulative, trimLeft, trimRight, maxPercentage) {
  $(axes)
    .empty(); // Remove tables if they are present


  // No histograms available
  if (histograms.length === 0) {
    MG.data_graphic({
      chart_type: "missing-data",
      width: $(axes)
        .parent()
        .width(), // We can't use the full_width option of MetricsGraphics because that breaks page zooming for graphs
      height: 600,
      target: axes,
    });
    $(axes)
      .find(".mg-missing-pane")
      .remove();
    var y = 180;
    var text = d3.select(axes).select(".mg-missing-text").attr("x", 30).attr("y", y).text("");
    text.append("tspan").attr("y", y).attr("text-anchor", "start").text("No data matches these filters and settings.");
    text.append("tspan").attr("y", y + 50).attr("text-anchor", "start").text("Possible reasons:");
    text.append("tspan").attr("y", y + 80).attr("text-anchor", "start").text("1) The Telemetry submissions haven't been aggregated for the dashboard yet (it takes a couple of days)");
    text.append("tspan").attr("y", y + 110).attr("text-anchor", "start").text("2) Too few submissions were received & are being filtered out in the dash. Turn off \"Sanitize data\" in Advanced Settings panel?");
    text.append("tspan").attr("y", y + 140).attr("text-anchor", "start").text("3) The data was sent to Telemetry before the unified Telemetry pipeline came online (July 2015)");
    $(axes).find("tspan").each(function(i, element) { d3.select(element).attr("x", 0); });
    var width = text[0][0].getBBox().width;
    $(axes).find("tspan").each(function(i, element) {
      d3.select(element).attr("x", ($(axes).width() - width) / 2);
    });
    return;
  }

  // All histograms must have the same buckets and be of the same kind
  var starts = histograms[0].map(function (count, start, end, i) {
    return start;
  });
  var ends = histograms[0].map(function (count, start, end, i) {
    return end;
  });
  ends[ends.length - 1] = Infinity;
  var countsList = histograms.map(function (histogram) {
    return histogram.map(function (count, start, end, i) {
      return count;
    });
  });

  // For single boolean and flag charts, display a pie chart instead of a histogram
  if (histograms.length === 1 && (histograms[0].kind === "boolean" ||
      histograms[0].kind === "flag") && !useTable) {
    new d3pie(axes, {
      size: {
        canvasHeight: 600,
        canvasWidth: $(axes)
          .parent()
          .width()
      },
      data: {
        content: countsList[0].map(function (count, i) {
            var bucketNames = ["False", "True", "Invalid values"];
            return {
              label: bucketNames[i] || starts[i],
              value: count
            };
          })
          .filter(function (entry) {
            return entry.value > 0;
          }),
      },
      labels: {
        mainLabel: {
          color: "black",
          fontSize: 18,
        },
        percentage: {
          color: "white",
          fontSize: 18,
          decimalPlaces: 2,
        },
      },
      effects: {
        load: {
          effect: "none"
        },
        pullOutSegmentOnClick: {
          effect: "none"
        },
      },
      tooltips: {
        enabled: true,
        string: "{value} ({percentage}%)",
        placeholderParser: function (index, data) {
          data.value = formatNumber(data.value) + " samples";
        },
      },
    });
    return;
  }

  if (cumulative) { // Show cumulative histogram by adding up all the previous data points
    countsList = countsList.map(function (counts) {
      var total = 0;
      return counts.map(function (count) {
        return total += count;
      });
    });
  }

  if (useTable) { // Display the histogram as a table rather than a chart
    $("#trim-option")
      .hide(); // Trimming is not available in table view
    displaySingleHistogramTableSet(axes, starts, ends, countsList, histograms);
    return;
  }
  $("#trim-option")
    .show(); // Show trim option for histogram view

  // Apply bucket trimming
  while (trimLeft) {
    starts.shift();
    ends.shift();
    countsList.forEach(function (counts) {
      counts.shift();
    });
    trimLeft--;
  }
  while (trimRight) {
    starts.pop();
    ends.pop();
    countsList.forEach(function (counts) {
      counts.pop();
    });
    trimRight--;
  }

  var distributionSamples = countsList.map(function (counts, i) {
    return counts.map(function (count, j) {
      return {
        value: j,
        count: (count / histograms[i].count) * 100
      };
    });
  });

  function get_label(index) {
    if(histograms[0].kind == 'categorical'){
        return starts[index]
    } else {
        return formatNumber(starts[index])
    }
  }

  var num_labels = 20,
      bottom = 30,
      right = $(axes).width() / (distributionSamples[0].length + 1)
  if(histograms[0].kind == 'categorical'){
    num_labels = starts.length
    bottom = 150
    right *= 1.5
  }

  // Plot the data using MetricsGraphics

  if (histograms.length === 1) { // One histogram available, display as histogram
    var histogram = histograms[0];
    MG.data_graphic({
      data: distributionSamples[0],
      binned: true,
      chart_type: "histogram",
      width: $(axes)
        .parent()
        .width(), // We can't use the full_width option of MetricsGraphics because that breaks page zooming for graphs
      height: 600,
      top: 0,
      bottom: bottom,
      left: 70,
      right: right,
      max_y: maxPercentage + 2, // Add some extra space to account for the top label
      transition_on_update: false,
      target: axes,
      x_label: histogram.description,
      y_label: "Percentage of Samples",
      xax_count: num_labels,
      y_extended_ticks: true,
      x_accessor: "value",
      y_accessor: "count",
      reduceXTicks: false,
      xax_format: get_label,
      yax_format: function (value) {
        return value + "%";
      },
      mouseover: function (d, i) {
        var count = formatNumber(countsList[0][d.x]),
          percentage = Math.round(d.y * 100) / 100 + "%";
        var label;
        if (ends[d.x] === Infinity && histogram.kind != "categorical") {
          label = "sample value \u2265 " + formatNumber(cumulative ? 0 :
            starts[d.x]);
        } else if (histogram.kind === "enumerated") {
          label = "sample value" + (cumulative ? " \u2264 " : " is ") +
            formatNumber(starts[d.x]);
        } else if (histogram.kind == "categorical") {
          label = "sample value" + (cumulative ? " \u2264 " : " is ") +
            get_label(d.x)
        } else {
          label = formatNumber(cumulative ? 0 : starts[d.x]) +
            " \u2264 sample value < " + formatNumber(ends[d.x]);
        }

        var offset = $(axes)
          .find(".mg-bar:nth-child(" + (i + 1) + ")")
          .get(0)
          .getAttribute("transform");
        var barWidth = $(axes)
          .find(".mg-bar:nth-child(" + (i + 1) + ") rect")
          .get(0)
          .getAttribute("width");
        var x = parseFloat(offset.replace(/^translate\(([-\d\.]+).*$/,
          "$1"));
        offset = "translate(" + x + ",30)";

        var legend = d3.select(axes)
          .select(".mg-active-datapoint")
          .text(label)
          .attr("transform", offset)
          .attr("x", barWidth / 2)
          .attr("y", "0")
          .attr("text-anchor", "middle")
          .style("fill", "white");
        legend.append("tspan")
          .attr({
            x: barWidth / 2,
            y: "1.1em"
          })
          .text(histogram.measure + ": " + count + " samples (" +
            percentage + ")")
          .attr("text-anchor", "middle");

        var bbox = legend[0][0].getBBox();
        var barWidth = parseFloat($(axes)
          .find(".mg-rollover-rects:last-child rect")
          .attr("width"))
        if (x - bbox.width / 2 < 0) {
          offset = "translate(" + (bbox.width / 2 - barWidth / 2 + 5) +
            ",30)";
          legend.attr("transform", offset);
        }
        var width = $(axes)
          .find("svg")
          .width();
        if (x + bbox.width / 2 + barWidth > width) {
          offset = "translate(" + (width - bbox.width / 2 - barWidth / 2 -
            5) + ",30)";
          legend.attr("transform", offset);
        }

        // Add background
        var padding = 5;
        d3.select(axes)
          .select(".active-datapoint-background")
          .remove(); // Remove old background
        d3.select(axes)
          .select("svg")
          .insert("rect", ".mg-active-datapoint")
          .classed("active-datapoint-background", true)
          .attr("x", bbox.x - padding)
          .attr("y", bbox.y - padding)
          .attr("transform", offset)
          .attr("width", bbox.width + padding * 2)
          .attr("height", bbox.height + padding * 2)
          .attr("rx", "3")
          .attr("ry", "3")
          .style("fill", "#333");
      },
      mouseout: function (d, i) {
        d3.select(axes)
          .select(".active-datapoint-background")
          .remove(); // Remove old background
      },
    });

    // Extend the Y axis ticks to cover the last bucket
    var barWidth = parseFloat($(axes)
      .find(".mg-rollover-rects:last-child rect")
      .attr("width"))
    $(axes)
      .find(".mg-extended-y-ticks")
      .each(function (i, yTick) {
        var x2 = parseFloat(yTick.attributes.x2.value) + barWidth;
        yTick.setAttribute("x2", x2);
      });
  } else if (histograms[0].kind == 'boolean' || histograms[0].kind == 'flag') {
    // grouped barcharts aren't supported by MG, so let's build our own
    var truths = histograms.map((hist, i) => {
      return {
        xval: i,
        yval: hist.values[1] / hist.count * 100,
        label: hist.measure,
      };
    });

    MG.data_graphic({
      data: truths,
      binned: true,
      chart_type: 'histogram',
      width: $(axes)
        .parent()
        .width(), // We can't use the full_width option of MetricsGraphics because that breaks page zooming for graphs
      height: 600,
      left: 70,
      right: 70,
      bottom: 150,
      transition_on_update: false,
      target: axes,
      //min_x: -0.5,
      max_x: truths.length + 0.5,
      x_label: histograms[0].description,
      y_label: "Percentage True",
      xax_count: truths.length,
      y_extended_ticks: true,
      x_accessor: 'xval',
      y_accessor: 'yval',
      xax_format: index => truths[index] ? truths[index].label : '',
      yax_format: function (value) {
        return value + "%";
      },
      mouseover: (d, i) => {
        if (truths[d.x]) {
          $('.mg-active-datapoint')
            .text(truths[d.x].label + ' ' +  Math.round(d.y * 100) / 100 + '% True');
        }
      },
    });
  } else { // Multiple histograms available, display as overlaid lines
    var goodColors = ["aqua", "blue", "green", "magenta", "lawngreen", "brown",
      "cyan", "darkgreen", "darkorange", "darkred", "navy"];
    var colors = countsList.map(function (counts, i) {
      return goodColors[i % goodColors.length];
    });

    distributionSamples.forEach(function (entries) {
      entries.forEach(function (entry) {
        entry.value += 0.5;
      });
    });

    MG.data_graphic({
      data: distributionSamples,
      chart_type: "line",
      interpolate: "linear",
      width: $(axes)
        .parent()
        .width(), // We can't use the full_width option of MetricsGraphics because that breaks page zooming for graphs
      height: 600,
      left: 70,
      right: right,
      bottom: bottom,
      max_y: maxPercentage + 2, // Add some extra space to account for the bezier curves
      transition_on_update: false,
      target: axes,
      x_label: histograms[0].description,
      y_label: "Percentage of Samples",
      xax_count: num_labels,
      y_extended_ticks: true,
      x_accessor: "value",
      y_accessor: "count",
      xax_format: get_label,
      yax_format: function (value) {
        return value + "%";
      },
      aggregate_rollover: true,
      mouseover: function (d, i) {
        var rolloverCircle, entries;
        var start, end;
        if (d.values) {
          start = starts[d.values[0].value - 0.5];
          end = ends[d.values[0].value - 0.5];
          rolloverCircle = $(axes)
            .find(".mg-line-rollover-circle.mg-area" + d.values[0].line_id +
              "-color")
            .get(0);
          entries = d.values.map(function (datum) {
            return {
              measure: histograms[datum.line_id - 1].measure,
              count: formatNumber(countsList[datum.line_id - 1][datum
                .value - 0.5]),
              percentage: Math.round(datum.count * 100) / 100 + "%",
              color: colors[datum.line_id - 1],
            };
          });
        } else {
          start = starts[d.value - 0.5];
          end = ends[d.value - 0.5];
          rolloverCircle = $(axes)
            .find(".mg-line-rollover-circle.mg-area" + d.line_id +
              "-color")
            .get(0);
          entries = [{
            measure: histograms[d.line_id - 1].measure,
            count: formatNumber(countsList[d.line_id - 1][d.value -
              0.5]),
            percentage: Math.round(d.count * 100) / 100 + "%",
            color: colors[d.line_id - 1],
          }];
        }
        var labelValue;
        if (end === Infinity && histograms[0].kind != "categorical") {
          labelValue = "sample value \u2265 " + formatNumber(cumulative ?
            0 : start) + ":";
        } else if (histograms[0].kind === "enumerated") {
          labelValue = "sample value" + (cumulative ? " \u2264 " : " is ") +
            formatNumber(start) + ":";
        } else if (histograms[0].kind == "categorical") {
          labelValue = "sample value" + (cumulative ? " \u2264 " : " is ") +
            get_label(Math.floor(d.key))
        } else {
          labelValue = formatNumber(cumulative ? 0 : start) +
            " \u2264 sample value < " + formatNumber(end) + ":";
        }
        var legend = d3.select(axes)
          .select(".mg-active-datapoint")
          .attr("transform", "")
          .text(labelValue)
          .style("fill", "white");
        var lineHeight = 1.1;
        entries.forEach(function (entry, i) {
          var lineIndex = i + 1;
          var label = legend.append("tspan")
            .attr({
              x: 0,
              y: (lineIndex * lineHeight) + "em"
            })
            .text(entry.count + " samples (" + entry.percentage +
              " of all " + entry.measure + ")");
          legend.append("tspan")
            .attr({
              x: -label.node()
                .getComputedTextLength(),
              y: (lineIndex * lineHeight) + "em"
            })
            .text("\u2014 ")
            .style({
              "font-weight": "bold",
              "stroke": entry.color
            });
        });

        // Reposition element
        var x = parseInt(rolloverCircle.getAttribute("cx")) + 20,
          y = 40;
        var bbox = legend[0][0].getBBox();
        if (x + bbox.width + 50 > $(axes)
          .find("svg")
          .width()) x -= bbox.width + 40;
        d3.select(axes)
          .select(".mg-active-datapoint-container")
          .attr("transform", "translate(" + (x + bbox.width) + "," + (y +
            15) + ")");

        // Add background
        var padding = 10;
        d3.select(axes)
          .select(".active-datapoint-background")
          .remove(); // Remove old background
        d3.select(axes)
          .select("svg")
          .insert("rect", ".mg-active-datapoint-container")
          .classed("active-datapoint-background", true)
          .attr("x", x - padding)
          .attr("y", y)
          .attr("width", bbox.width + padding * 2)
          .attr("height", bbox.height + 8)
          .attr("rx", "3")
          .attr("ry", "3")
          .style("fill", "#333");
      },
      mouseout: function (d, i) {
        d3.select(axes)
          .select(".active-datapoint-background")
          .remove(); // Remove old background
      },
    });
    countsList.forEach(function (counts, i) { // Recolor lines with the previously calculated colors
      var lineIndex = i + 1;
      $(axes)
        .find(".mg-main-line.mg-line" + lineIndex + "-color")
        .css("stroke", colors[i]);
      $(axes)
        .find(".mg-area" + lineIndex + "-color, .mg-hover-line" + lineIndex +
          "-color")
        .css("fill", colors[i])
        .css("stroke", colors[i]);
      $(axes)
        .find(".mg-line" + lineIndex + "-legend-color")
        .css("fill", colors[i]);
    });
  }

  // Reposition and resize text
  $(axes)
    .find(".mg-x-axis .label")
    .attr("dy", "12");
  $(axes)
    .find(".mg-x-axis text:not(.label)")
    .each(function (i, text) { // Axis tick labels
      if ($(text)
        .text() === "NaN") {
        text.parentNode.removeChild(text);
      } // Remove "NaN" labels resulting from interpolation in histogram labels
      $(text)
        .attr("dx", "0.3em")
        .attr("dy", "0")
        .attr("text-anchor", "start");
      if (histograms[0].kind == 'boolean' || histograms[0].kind == 'flag' || histograms[0].kind == 'categorical') {
        var jText = $(text);
        jText.attr('transform', 'rotate(20 ' + jText.attr('x') + ' ' + jText.attr('y') + ')');
      }
    });
  $(axes)
    .find(".mg-x-axis line")
    .each(function (i, tick) { // Extend axis ticks to 15 pixels
      $(tick)
        .attr("y2", parseInt($(tick)
          .attr("y1")) + 12);
    });
  $(axes)
    .find(".mg-y-axis .label")
    .attr("y", "20");
}

function displaySingleHistogramTableSet(axes, starts, ends, countsList,
  histograms) {

  is_categorical = histograms[0].kind == "categorical"
  start_labs = [$("<th></th>").text("Start"), $("<th></th>").text("End")]
  if (is_categorical) {
    start_labs = [$("<th></th>").text("Category")]
  }

  function get_labels (i) {
    if(is_categorical) {
      return [$("<td></td>").text(starts[i])]
    } else {
      return [$("<td></td>").text(formatNumber(starts[i])),
              $("<td></td>").text(formatNumber(ends[i]))]
    }
  }

  $(axes)
    .empty()
    .append(
      $("<div></div>")
      .css("margin", "0 250px 0 130px")
      .append(
        $("<table></table>")
        .addClass("table table-striped table-hover")
        .css("width", "auto")
        .css("margin", "0 auto")
        .append([
        $("<thead></table>")
          .append(
            $("<tr></tr>")
            .append(
            start_labs.concat(
                histograms.map(function (histogram, i) {
                  return $("<th></th>")
                    .text(histogram.measure + " Count");
                })
              )
            )
        ),
        $("<tbody></tbody>")
          .append(
            countsList[0].map(function (count, i) {
              return $("<tr></tr>")
                .append(
                  get_labels(i).concat(
                    countsList.map(function (counts, j) {
                      var percentage = Math.round(10000 * counts[i] /
                        histograms[j].count) / 100;
                      return $("<td></td>")
                        .text(formatNumber(counts[i]) + " (" + percentage +
                          "%)");
                    })
                  )
                )
            })
        ),
      ])
      )
    );
}

// Save the current state to the URL and the page cookie
var gPreviousCSVBlobUrl = null,
  gPreviousJSONBlobUrl = null;
var gPreviousDisqusIdentifier = null;

function saveStateToUrlAndCookie() {
  var picker = $("#date-range")
    .data("daterangepicker");
  var minChannelVersion = gInitialPageState.min_channel_version;
  gInitialPageState = {
    measure: $("#measure")
      .val(),
    max_channel_version: $("#channel-version")
      .val(),
    sort_keys: $("#sort-keys")
      .val(),
    table: $("input[name=table-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    cumulative: $("input[name=cumulative-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    use_submission_date: $("input[name=build-time-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    sanitize: $("input[name=sanitize-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    trim: $("input[name=trim-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    start_date: moment(picker.startDate)
      .format("YYYY-MM-DD"),
    end_date: moment(picker.endDate)
      .format("YYYY-MM-DD"),
  };

  // Save a few unused properties that are used in the evolution dashboard, since state is shared between the two dashboards
  if (minChannelVersion !== undefined) {
    gInitialPageState.min_channel_version = minChannelVersion;
  }

  var selected = $("#compare")
    .val();
  if (selected !== "") {
    gInitialPageState.compare = selected;
  }
  var selected = [$("#selected-key1")
    .val(), $("#selected-key2")
    .val(), $("#selected-key3")
    .val(), $("#selected-key4")
    .val()].filter(function (value) {
    return value !== "";
  });
  if (selected.length > 0) {
    gInitialPageState.keys = selected;
  }

  // Only store these in the state if they are not all selected
  var selected = $("#filter-product")
    .val() || [];
  if (selected.length !== $("#filter-product option")
    .size()) {
    gInitialPageState.product = selected;
  }
  var selected = $("#filter-os")
    .val() || [];
  if (selected.length !== $("#filter-os option")
    .size()) {
    gInitialPageState.os = compressOSs();
  }
  var selected = $("#filter-arch")
    .val() || [];
  if (selected.length !== $("#filter-arch option")
    .size()) {
    gInitialPageState.arch = selected;
  }
  var selected = $("#filter-e10s")
    .val() || [];
  if (selected.length !== $("#filter-e10s option")
    .size()) {
    gInitialPageState.e10s = selected;
  }
  var selected = $("#filter-process-type")
    .val() || [];
  if (selected.length !== $("#filter-process-type option")
    .size()) {
    gInitialPageState.processType = selected;
  }

  var stateString = Object.keys(gInitialPageState)
    .sort()
    .map(function (key) {
      var value = gInitialPageState[key];
      if ($.isArray(value)) {
        value = value.join("!");
      }
      return encodeURIComponent(key) + "=" + encodeURIComponent(value);
    })
    .join("&");

  // Save to the URL hash if it changed
  var url = "";
  var index = window.location.href.indexOf("#");
  if (index > -1) {
    url = decodeURI(window.location.href.substring(index + 1));
  }
  if (url[0] == "!") {
    url = url.slice(1);
  }
  if (url !== stateString) {
    window.location.replace(window.location.origin + window.location.pathname +
      "#!" + encodeURI(stateString));
    $(".permalink-control input")
      .hide(); // Hide the permalink box again since the URL changed
  }

  // Save the state in a cookie that expires in 3 days
  var expiry = new Date();
  expiry.setTime(expiry.getTime() + (3 * 24 * 60 * 60 * 1000));
  document.cookie = "stateFromUrl=" + stateString + "; expires=" + expiry.toGMTString();

  // Add link to switch to the evolution dashboard with the same settings
  var dashboardURL = window.location.origin + window.location.pathname.replace(
    /dist\.html$/, "evo.html") + window.location.hash;
  $("#switch-views")
    .attr("href", dashboardURL);

  // Update export links with the new histogram
  if (gCurrentHistogramsList.length > 0 && gCurrentHistogramsList[0].histograms
    .length > 0) {
    if (gPreviousCSVBlobUrl !== null) {
      URL.revokeObjectURL(gPreviousCSVBlobUrl);
    }
    if (gPreviousJSONBlobUrl !== null) {
      URL.revokeObjectURL(gPreviousJSONBlobUrl);
    }
    var histograms = gCurrentHistogramsList[0].histograms;
    var countsList = histograms.map(function (histogram) {
      return histogram.map(function (count, start, end, i) {
        return count;
      });
    });
    if ($("input[name=cumulative-toggle]:checked")
      .val() !== "0") {
      // Apply cumulative option
      countsList = countsList.map(function (counts) {
        var total = 0;
        return counts.map(function (count) {
          return total += count;
        });
      });
    }
    var jsonValue;
    var csvValue;
    if (!isHistogramsListKeyed(gCurrentHistogramsList)) {
      jsonValue = JSON.stringify(histograms[0].map(function (count, start,
        end, i) {
        var entry = {
          start: start
        };
        histograms.forEach(function (histogram, j) {
          entry[histogram.measure] = countsList[j][i];
        });
        return entry;
      }), null, 2);
      csvValue = "start,\t" +
        histograms.map(function (histogram) {
          return histogram.measure;
        })
        .join(",\t") + "\n" +
        histograms[0].map(
          function (count, start, end, i) {
            return start + ",\t" + countsList.map(function (counts) {
                return counts[i];
              })
              .join(",\t");
          }
        )
        .join("\n");
    } else {
      // keyed histogram: need to output keyed on key
      var shownKeys = gAxesSelectors.map(jqMulti => jqMulti.val());
      // JSON
      var outputObj = {};
      gCurrentHistogramsList
        .filter(titleHistogramsPair =>
          shownKeys.indexOf(titleHistogramsPair.title) != -1)
        .sort((a, b) => shownKeys.indexOf(a.title) - shownKeys.indexOf(b.title))
        .forEach(titleHistogramsPair => {
          outputObj[titleHistogramsPair.title] = [];
          titleHistogramsPair.histograms[0].buckets.forEach((bucket, i) => {
            var record = {
              start: bucket,
            };
            titleHistogramsPair.histograms.forEach(hist =>
              record[hist.measure] = hist.values[i]);
            outputObj[titleHistogramsPair.title].push(record);
          })
        });
      jsonValue = JSON.stringify(outputObj, ' ', 2);

      // CSV
      var outputArr = [];
      var titles = [
        'key',
        'start',
        ];
      histograms.forEach(hist => titles.push(hist.measure));
      outputArr.push(titles);
      gCurrentHistogramsList
        .filter(titleHistogramsPair =>
          shownKeys.indexOf(titleHistogramsPair.title) != -1)
        .sort((a, b) => shownKeys.indexOf(a.title) - shownKeys.indexOf(b.title))
        .forEach(titleHistogramsPair => {
          var record;
          for (var i = 0; i < histograms[0].buckets.length; i++) {
            record = [
              titleHistogramsPair.title,
              titleHistogramsPair.histograms[0].buckets[i],
            ];
            titleHistogramsPair.histograms.forEach(hist =>
              record.push(hist.values[i]));
            outputArr.push(record);
          }
        });
      csvValue = outputArr.map(record => record.join(',\t')).join('\n');
    }
    gPreviousCSVBlobUrl = URL.createObjectURL(new Blob([csvValue]));
    gPreviousJSONBlobUrl = URL.createObjectURL(new Blob([jsonValue]));
    var name = histograms.map(function (histogram) {
        return histogram.measure;
      })
      .join(", ");
    $("#export-csv")
      .attr("href", gPreviousCSVBlobUrl)
      .attr("download", name + ".csv")
      .show();
    $("#export-json")
      .attr("href", gPreviousJSONBlobUrl)
      .attr("download", name + ".json")
      .show();
  } else {
    $("#export-csv, #export-json")
      .hide();
  }

  // If advanced settings are not at their defaults, display a notice in the panel header
  var start = gInitialPageState.start_date,
    end = gInitialPageState.end_date;
  if (gCurrentMinDate !== null) {
    var minMoment = gCurrentMinDate,
      maxMoment = gCurrentMaxDate;
  } else {
    var minMoment = start,
      maxMoment = end;
  }

  var isKeyedHistogram = $("#sort-keys-option").css("display") !== "none";
  if (gInitialPageState.use_submission_date !== 0 || gInitialPageState.table !==
    0 || gInitialPageState.cumulative !== 0 || gInitialPageState.trim !== 1 ||
    (isKeyedHistogram && gInitialPageState.sort_keys !== "submissions") ||
    start !== minMoment || end !== maxMoment) {
    $("#advanced-settings-toggle")
      .find("span")
      .text(" (modified)");
  } else {
    $("#advanced-settings-toggle")
      .find("span")
      .text("");
  }
}

function isHistogramsListKeyed(histogramsList) {
  return histogramsList.some(entry => entry.title !== "");
}
