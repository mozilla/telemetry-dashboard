var gInitialPageState = null;
var gFilterChangeTimeout = null;
var gFilters = null,
  gPreviousFilterAllSelected = {};
var gCurrentLinesMap; // mapping from keyed histogram keys to arrays of aggregate lines (non-keyed histograms have lines stored in the key "")
var gCurrentKind; // the kind of the current measure, or null if this can't be determined

var gDefaultAggregates = [
  ["median", "Median", function (evolution) {
    return evolution.percentiles(50);
  }],
  ["mean", "Mean", function (evolution) {
    return evolution.means();
  }],
  ["5th-percentile", "5th percentile", function (evolution) {
    return evolution.percentiles(5);
  }],
  ["25th-percentile", "25th percentile", function (evolution) {
    return evolution.percentiles(25);
  }],
  ["75th-percentile", "75th percentile", function (evolution) {
    return evolution.percentiles(75);
  }],
  ["95th-percentile", "95th percentile", function (evolution) {
    return evolution.percentiles(95);
  }],
];
// these will be generated, but won't appear in the multiselect
// note: some code using gMetaAggregates assumes for convenience that 
// meta aggregate names are special and hopefully won't ever collide with
// (dynamically generated) names of other aggregates.
var gMetaAggregates = [
  ["submissions", "Submissions", function (evolution) {
    return evolution.submissions();
  }, "#submissions"],
  ["sample-count", "Sample count", function (evolution) {
    return evolution.sampleCounts();
  }, "#sample-counts"],
];
var gAvailablaAggregates = gDefaultAggregates.concat(gMetaAggregates);

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
    gInitialPageState = loadStateFromUrlAndCookie();

    multiselectSetOptions($(
        "#min-channel-version, #max-channel-version"),
      getHumanReadableOptions("channelVersion", Telemetry.getVersions())
    );

    // Select previously selected channel versions, or the latest nightlies if not possible
    var nightlyVersions = Telemetry.getVersions()
      .filter(function (channelVersion) {
        return channelVersion.startsWith("nightly/");
      })
      .sort();
    if (gInitialPageState.min_channel_version !== undefined) {
      if (gInitialPageState.min_channel_version === null) {
        gInitialPageState.min_channel_version = nightlyVersions[Math.max(
          nightlyVersions.length - 4, 0)];
      }
      $("#min-channel-version")
        .next()
        .find("input[type=radio]")
        .attr("checked", false);
      $("#min-channel-version")
        .multiselect("select", gInitialPageState.min_channel_version);
    }
    if (gInitialPageState.max_channel_version !== undefined) {
      if (gInitialPageState.max_channel_version === null) {
        gInitialPageState.max_channel_version = nightlyVersions[
          nightlyVersions.length - 1];
      }
      $("#max-channel-version")
        .next()
        .find("input[type=radio]")
        .attr("checked", false);
      $("#max-channel-version")
        .multiselect("select", gInitialPageState.max_channel_version);
    }

    var fromVersion = $("#min-channel-version")
      .val(),
      toVersion = $("#max-channel-version")
      .val();
    var versions = Telemetry.getVersions(fromVersion, toVersion);
    if (versions.length === 0) {
      $("#min-channel-version")
        .multiselect("select", toVersion);
    } // Invalid range selected, move min version selector

    $("input[name=build-time-toggle][value=" + (gInitialPageState.use_submission_date !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");
    $("input[name=sanitize-toggle][value=" + (gInitialPageState.sanitize !==
        0 ? 1 : 0) + "]")
      .prop("checked", true)
      .trigger("change");

    // If advanced settings are not at their defaults, expand the settings pane on load
    if (gInitialPageState.use_submission_date !== 0 ||
      gInitialPageState.sanitize !== 1) {
      $("#advanced-settings-toggle")
        .click();
    }

    indicate("Updating filters...");
    updateOptions(function (filterOptions) {
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

      $("#min-channel-version, #max-channel-version")
        .change(function (e) {
          var fromVersion = $("#min-channel-version")
            .val(),
            toVersion = $("#max-channel-version")
            .val();
          var versions = Telemetry.getVersions(fromVersion,
            toVersion);
          if (versions.length === 0) { // Invalid range selected, move other version selector
            if (e.target.id === "min-channel-version") {
              $("#max-channel-version")
                .multiselect("select", fromVersion);
            } else {
              $("#min-channel-version")
                .multiselect("select", toVersion);
            }
          }
          if (fromVersion.split("/")[0] !== toVersion.split("/")[
              0]) { // Two versions are on different channels, move the other one into the right channel
            if (e.target.id === "min-channel-version") { // min version changed, change max version to be the largest version in the current channel
              var channel = fromVersion.split("/")[0];

              // Dirty hack to get the valid channel versions (by excluding those versions that are too high)
              var latestNightlyVersion = 0;
              var channelVersions = Telemetry.getVersions();
              channelVersions.forEach(function (option) {
                var parts = option.split("/");
                if (parts[0] === "nightly" && parseInt(parts[
                    1]) > latestNightlyVersion) {
                  latestNightlyVersion = parseInt(parts[1]);
                }
              });
              var latestChannelVersion = Infinity;
              if (channel === "nightly") {
                latestChannelVersion = latestNightlyVersion;
              } else if (channel === "aurora") {
                latestChannelVersion = latestNightlyVersion - 1;
              } else if (channel === "beta") {
                latestChannelVersion = latestNightlyVersion - 2;
              } else if (channel === "release") {
                latestChannelVersion = latestNightlyVersion - 3;
              }
              if (!isFinite(latestChannelVersion)) {
                latestChannelVersion = Infinity;
              }
              var oldestChannelVersion = parseInt(fromVersion.split(
                "/")[1]);
              channelVersions = channelVersions.filter(function (
                version) {
                var parts = version.split("/");
                var versionNumber = parseInt(parts[1]);
                return parts[0] === channel &&
                  oldestChannelVersion <= versionNumber &&
                  versionNumber <= latestChannelVersion;
              });
              var maxChannelVersion = channelVersions[Math.min(
                channelVersions.length - 1, 3)];
              $("#max-channel-version")
                .multiselect("select", maxChannelVersion);
            } else { // max version changed, change the min version to be the smallest version in the current channel
              var channel = toVersion.split("/")[0];
              var channelVersions = Telemetry.getVersions()
                .filter(function (version) {
                  return version.startsWith(channel + "/") &&
                    version <= toVersion;
                });
              var minChannelVersion = channelVersions[Math.max(0,
                channelVersions.length - 4)];
              $("#min-channel-version")
                .multiselect("select", minChannelVersion);
            }
          }

          indicate("Updating versions...");
          updateOptions(function () {
            indicate();
            $("#aggregates")
              .trigger("change");
          });
        });
      $("#measure")
        .change(function (e) {
          indicate("Updating aggregates...");
          updateAggregates(function () {
            indicate();
            $("#aggregates")
              .trigger("change");
          });
        });
      $(
          "input[name=build-time-toggle], input[name=sanitize-toggle], #aggregates, #filter-product, #filter-os, #filter-arch, #filter-e10s, #filter-process-type"
        )
        .change(function (e) {
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
                $this.multiselect("deselectAll", true)
                  .multiselect("updateButtonText")
                  .multiselect("select", nonSelectedOptions);
              }
              gPreviousFilterAllSelected[$this.attr("id")] =
                selected.length === options.length; // Store state
            }
            updateOSs();

            calculateEvolutions(function (linesMap, evolutionDescription) {
              var keys = Object.keys(linesMap)
                .sort();
              var options = getHumanReadableOptions("key",
                keys);
              multiselectSetOptions($("#selected-key"),
                options);
              if (gInitialPageState.keys &&
                gInitialPageState.keys.length > 0) { // Reselect previously selected key            
                // Check to make sure the key can actually still be selected
                var key = gInitialPageState.keys[0];
                if ($("#selected-key")
                  .find("option")
                  .filter(function (i, option) {
                    return $(option)
                      .val() === key;
                  })
                  .length > 0) {
                  $("#selected-key")
                    .next()
                    .find("input[type=radio]")
                    .attr("checked", false);
                  $("#selected-key")
                    .multiselect("select", key);
                }
              }

              gCurrentLinesMap = linesMap;

              // Show the key selector only if it's required
              if (Object.keys(linesMap)
                .length < 2) {
                $("#selected-key")
                  .parent()
                  .hide();
              } else {
                $("#selected-key")
                  .parent()
                  .show();
              }

              $("#submissions-title").text($("#measure").val() + " submissions");
              $("#sample-counts-title").text($("#measure").val() + " sample counts");
              $("#measure-description")
                .text(evolutionDescription === null ? $(
                    "#measure")
                  .val() : evolutionDescription);
              $("#selected-key")
                .trigger("change");
            });
          });
        });

      $("#selected-key")
        .change(function (e) {
          var key = $("#selected-key")
            .val();
          var lines;
          if (key === null) {
            lines = [];
          } else {
            lines = gCurrentLinesMap[key];
          }
          displayEvolutions(lines,
            $("input[name=build-time-toggle]:checked").val() !== "0",
            gCurrentKind === "enumerated" || gCurrentKind === "boolean" || gCurrentKind == "categorical");
          saveStateToUrlAndCookie();
        });

      // Perform a full display refresh
      $("#measure")
        .trigger("change");
    });

    var resizeUpdateTimeout = null;
    $(window)
      .resize(function () {
        // Resize the main plot (MetricsGraphics has a full_width option, but that breaks zooming for plots)
        if (resizeUpdateTimeout !== null) {
          clearTimeout(resizeUpdateTimeout);
        }
        resizeUpdateTimeout = setTimeout(function () {
          $("#selected-key")
            .trigger("change");
        }, 50);
      });
    $("#advanced-settings")
      .on("shown.bs.collapse", function () {
        $(this)
          .get(0)
          .scrollIntoView({
            behavior: "smooth"
          }); // Scroll the advanced settings into view when opened
      });
  });
});

var gLoadedAggregatesFromState = false;

function updateAggregates(callback) {
  var channelVersions = Telemetry.getVersions($("#min-channel-version")
    .val(), $("#max-channel-version")
    .val());
  var realKind = null,
    realBuckets = null;
  var versionCount = 0;

  var operation = asyncOperationCheck("updateAggregates");
  channelVersions.forEach(function (channelVersion) {
    var parts = channelVersion.split("/");
    Telemetry.getHistogramInfo(parts[0], parts[1], $("#measure")
      .val(), null,
      function (kind, description, buckets, dates) {
        if (asyncOperationWasInterrupted("updateAggregates", operation)) { // Don't call callback if this isn't the latest invocation of the function
          return;
        }

        versionCount++;
        realKind = realKind || kind;
        realBuckets = realBuckets || buckets;

        if (versionCount == channelVersions.length) {
          gCurrentKind = realKind;

          // Set up the aggregate list depending on the kind of histogram
          var aggregates = $("#aggregates")
            .val() || [];
          if (realKind === "enumerated") {
            var newAggregates = getHumanReadableBucketOptions(realKind,
              realBuckets);
            multiselectSetOptions($("#aggregates"), newAggregates, [
              newAggregates[0][0]]);
          } else if(realKind == "categorical") {
            var newAggregates = realBuckets.map((r, i) => {return [i.toString(), r]})
            multiselectSetOptions($("#aggregates"), newAggregates, [
              newAggregates[0][0]]);
          }  else if (realKind === "boolean" || realKind === "flag") {
            var newAggregates = getHumanReadableBucketOptions(realKind,
              realBuckets);
            multiselectSetOptions($("#aggregates"), newAggregates, [
              newAggregates[0][0]]);

            // Boolean histograms should always start off with all options selected
            $("#aggregates")
              .multiselect("selectAll", false)
              .multiselect("updateButtonText");
          } else { // realKind is another histogram kind, or null because we didn't have any data
            var newAggregates = gDefaultAggregates.map(function (entry) {
              return [entry[0], entry[1]];
            });


            multiselectSetOptions($("#aggregates"), newAggregates, ["median", "5th-percentile", "95th-percentile"]);
          }

          // Load aggregates from state on first load
          newAggregates = newAggregates.map(function (entry) {
            return entry[0];
          })
          aggregates = gInitialPageState.aggregates.filter(function (
            aggregate) {
            return newAggregates.indexOf(aggregate) >= 0;
          });
          if (!gLoadedAggregatesFromState && aggregates.length > 0) {
            gLoadedAggregatesFromState = true;
            $("#aggregates")
              .multiselect("deselectAll", false)
              .multiselect("select", aggregates);
          }

          callback();
        }
      });
  });
}

function updateOptions(callback) {
  var fromVersion = $("#min-channel-version")
    .val(),
    toVersion = $("#max-channel-version")
    .val();
  var versions = Telemetry.getVersions(fromVersion, toVersion);
  var versionCount = 0;
  var optionsMap = {};

  var operation = asyncOperationCheck("updateOptions");
  versions.forEach(function (channelVersion) { // Load combined measures for all the versions
    var parts = channelVersion.split("/"); //wip: clean this up
    Telemetry.getFilterOptions(parts[0], parts[1], function (filterOptions) {
      if (asyncOperationWasInterrupted("updateOptions", operation)) { // Don't call callback if this isn't the latest invocation of the function
        return;
      }

      // Combine options
      for (var filterName in filterOptions) {
        if (!optionsMap.hasOwnProperty(filterName)) {
          optionsMap[filterName] = [];
        }
        optionsMap[filterName] = optionsMap[filterName].concat(
          filterOptions[filterName]);
      }

      versionCount++;
      if (versionCount === versions.length) { // All versions are loaded
        multiselectSetOptions($("#measure"), getHumanReadableOptions(
          "measure", deduplicate(optionsMap.metric)));
        $("#measure")
          .multiselect("select", gInitialPageState.measure);

        multiselectSetOptions($("#filter-product"),
          getHumanReadableOptions("application", deduplicate(
            optionsMap.application)));
        multiselectSetOptions($("#filter-arch"),
          getHumanReadableOptions("architecture", deduplicate(
            optionsMap.architecture)));
        multiselectSetOptions($("#filter-e10s"),
          getHumanReadableOptions("e10sEnabled", deduplicate(
            optionsMap.e10sEnabled)));
        multiselectSetOptions($("#filter-process-type"),
          getHumanReadableOptions("child", deduplicate(optionsMap.child))
        );

        // Compressing and expanding the OSs also has the effect of making OSs where all the versions were selected also all selected in the new one, regardless of whether those versions were actually in common or not
        var selectedOSs = compressOSs();
        multiselectSetOptions($("#filter-os"), getHumanReadableOptions(
          "os", deduplicate(optionsMap.os)));
        $("#filter-os")
          .multiselect("select", expandOSs(selectedOSs));

        if (callback !== undefined) {
          callback();
        }
      }
    });
  });
  if (versions.length == 0) { // All versions are loaded
    mutliselectSetOptions($("#measure"), []);
    if (callback !== undefined) {
      callback();
    }
    return;
  }
}

function calculateEvolutions(callback) {
  // Get selected version, measure, and aggregate options
  var channelVersions = Telemetry.getVersions($("#min-channel-version")
    .val(), $("#max-channel-version")
    .val());
  var measure = $("#measure")
    .val();
  var aggregates = $("#aggregates")
    .val() || [];

  // always load these for extra plots on the bottom
  for (let metaAggregate of gMetaAggregates)
    aggregates.push(metaAggregate[0]);

  // Obtain a mapping from filter names to filter options
  var filterSets = getFilterSetsMapping(gFilters)["*"];

  var linesMap = {};
  var versionCount = 0;
  var evolutionDescription = null;

  var operation = asyncOperationCheck("calculateEvolutions");
  channelVersions.forEach(function (channelVersion) {
    var parts = channelVersion.split("/"); //wip: fix this
    getHistogramEvolutionLines(parts[0], parts[1], measure, aggregates,
      filterSets, $("input[name=sanitize-toggle]:checked")
      .val() !== "0", $("input[name=build-time-toggle]:checked")
      .val() !== "0",
      function (newLinesMap, newDescription) {
        if (asyncOperationWasInterrupted("calculateEvolutions", operation)) { // Don't call callback if this isn't the latest invocation of the function
          return;
        }

        for (var key in newLinesMap) {
          linesMap[key] = linesMap.hasOwnProperty(key) ? linesMap[key].concat(
            newLinesMap[key]) : newLinesMap[key];
        }
        evolutionDescription = evolutionDescription || newDescription;
        versionCount++;
        if (versionCount === channelVersions.length) { // Check if lines were loaded for all the versions
          indicate();
          callback(linesMap, evolutionDescription);
        }
      });
  });
}

function getHistogramEvolutionLines(channel, version, measure, aggregates,
  filterSets, sanitize, useSubmissionDate, callback) {
  var filtersCount = 0;
  var lines = [];
  var finalEvolutionMap = {};
  indicate("Updating evolution for " + channel + " " + version + "...");

  filterSets.forEach(function (filterSet) {
    Telemetry.getEvolution(channel, version, measure, filterSet,
      useSubmissionDate,
      function (evolutionMap) {
        filtersCount++;
        indicate("Updating evolution for " + channel + " " + version +
          "... ", 100 * filtersCount / filterSets.length);

        for (var key in evolutionMap) {
          if (finalEvolutionMap[key] === undefined) {
            finalEvolutionMap[key] = evolutionMap[key];
          } else {
            finalEvolutionMap[key] = finalEvolutionMap[key].combine(
              evolutionMap[key]);
          }
        }
        if (filtersCount === filterSets.length) { // Check if we have loaded all the needed filters
          if (sanitize) {
            for (var key in finalEvolutionMap) {
              finalEvolutionMap[key] = finalEvolutionMap[key].sanitized();
            }
          }

          // Get aggregator names and selectors, as well as the measure description
          var aggregateSelector = {},
            aggregateNames = {};
          var description = null,
            kind = null;
          for (var key in finalEvolutionMap) {
            var evolution = finalEvolutionMap[key];
            if (evolution === null) {
              continue;
            }

            gAvailablaAggregates.forEach(function (entry) {
              aggregateSelector[entry[0]] = entry[2];
            });
            var options = getHumanReadableBucketOptions(evolution.kind, evolution.buckets)
            evolution.buckets.forEach(function (start, bucketIndex) {
              var option = options[bucketIndex][0];
              aggregateSelector[option] = function (evolution) {
                return evolution.map(function (histogram) {
                  return 100 * histogram.values[bucketIndex] /
                    histogram.count;
                });
              }
            });
            gAvailablaAggregates.forEach(function (entry) {
              aggregateNames[entry[0]] = entry[1];
            });
            getHumanReadableBucketOptions(evolution.kind, evolution.buckets)
              .forEach(function (entry) {
                aggregateNames[entry[0]] = entry[1];
              });
            description = evolution.description;
            kind = evolution.kind;
            break;
          }

          // Create line objects
          var aggregateLinesMap = {};
          for (var key in finalEvolutionMap) {
            var evolution = finalEvolutionMap[key];
            if (evolution === null) {
              continue;
            }

            // Obtain the X and Y values of points
            var aggregateValues = aggregates.map(function (aggregate) {
              assert(aggregateSelector.hasOwnProperty(aggregate),
                "Aggregate " + aggregate + " is not valid");
              return aggregateSelector[aggregate](evolution);
            });
            var dates = evolution.dates();
            var finalAggregateValues = aggregateValues.map(function(values, j) {
              return dates.map((date, i) => ({
                x: date.getTime(),
                y: values[i]
              }));
            });

            // Create line objects
            aggregateLinesMap[key] = finalAggregateValues.map(function(values, i) {
              return new Line(measure, channel + "/" + version,
                aggregateNames[aggregates[i]], values);
            });
          }

          callback(aggregateLinesMap, description,
            kind);
        }
      });
  });
  if (filterSets.length === 0) {
    callback([], [], measure, null);
  }
}

function displayEvolution(target, lines, usePercentages, plotOptions) {
  lines = lines.filter(line => line.values.length > 0);

  // Transform the data into a form that is suitable for plotting
  var lineData = lines.map(function (line) {
    var dataset = line.values.map(function (point) {
      return {
        date: moment.utc(point.x).toDate(),
        value: point.y
      };
    });
    dataset.push(dataset[dataset.length - 1]); // duplicate the last point to work around a metricsgraphics bug if there are multiple datasets where one or more datasets only have one point
    return dataset;
  });

  var markers = [],
    usedDates = {};
  lines.forEach(function (line) {
    var minDate = Math.min.apply(Math, line.values.map(function (point) {
      return point.x;
    }));
    usedDates[minDate] = usedDates[minDate] || [];
    if (usedDates[minDate].indexOf(line.getVersionString()) < 0) {
      usedDates[minDate].push(line.getVersionString());
    }
  });
  for (var date in usedDates) {
    markers.push({
      date: moment.utc(parseInt(date) + 1).toDate(),
      label: usedDates[date].join(", ")
    }); // Need to add 1ms because the leftmost marker won't show up otherwise
  }
  if (markers.length > 1) { // If there is a marker on the far right, move it back 2 milliseconds in order to make it visible again
    let lastMarker = markers[markers.length - 1];
    lastMarker.date = moment.utc(lastMarker.date.getTime() - 2).toDate();
  }

  d3.select(`${target} .active-datapoint-background`).remove(); // Remove old background
  MG.data_graphic({
    data: lineData,
    chart_type: lineData.length == 0 || lineData[0].length === 0 ?
      "missing-data" : "line",
    // We can't use the full_width option of MetricsGraphics because that breaks page zooming for graphs
    width: $(target).parent().width(),
    height: 600,
    right: 100,
    bottom: 50, // Extra space on the right and bottom for labels
    target: target,
    x_extended_ticks: true,
    x_label: "",
    y_label: "",
    transition_on_update: false,
    interpolate: "linear",
    yax_format: usePercentages ? (y => y + "%") : null,
    markers: markers,
    aggregate_rollover: true,
    linked: true,
    utc_time: true,
    mouseover: function (d, i) {
      var date, rolloverCircle, lineList, values;
      if (d.values) {
        date = d.values[0].date;
        rolloverCircle = $(`${target} .mg-line-rollover-circle.mg-line` +
            d.values[0].line_id + "-color")
          .get(0);
        var seen = {};
        var entries = d.values.filter(function (entry) {
          if (seen[entry.line_id]) return false;
          seen[entry.line_id] = true;
          return true;
        });
        lineList = entries.map(entry => lines[entry.line_id - 1]);
        values = entries.map(entry => entry.value);
      } else {
        date = d.date;
        rolloverCircle = $(`${target} .mg-line-rollover-circle`).get(0);
        lineList = [lines[d.line_id - 1]];
        values = [d.value];
      }
      var legend = d3.select(`${target} .mg-active-datapoint`)
        .attr('transform', '')
        .text(moment.utc(date)
          .format("dddd MMMM D, YYYY UTC") + " (build " + moment.utc(date)
          .format("YYYYMMDD") + "):")
        .style("fill", "white");
      var lineHeight = 1.1;
      lineList.forEach(function (line, i) {
        var lineIndex = i + 1;
        var label = legend.append("tspan")
          .attr({
            x: 0,
            y: (lineIndex * lineHeight) + "em"
          })
          .text(line.getDescriptionString() + ": " + formatNumber(
            values[i]) + (usePercentages ? "%" : ""));
        legend.append("tspan")
          .attr({
            x: -label.node().getComputedTextLength(),
            y: (lineIndex * lineHeight) + "em"
          })
          .text("\u2014 ")
          .style({
            "font-weight": "bold",
            "stroke": line.color
          });
      });

      // Reposition element
      var x = parseInt(rolloverCircle.getAttribute("cx")) + 20,
        y = 40;
      var bbox = legend[0][0].getBBox();
      if (x + bbox.width + 50 > $(`${target} svg`).width()) {
        x -= bbox.width + 40;
      }
      d3.select(`${target} .mg-active-datapoint-container`)
        .attr("transform", `translate(${x + bbox.width}, ${y + 15})`);

      // Add background
      var padding = 10;
      d3.select(`${target} .active-datapoint-background`)
        .remove(); // Remove old background
      d3.select(`${target} svg`)
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
      d3.select(`${target} .active-datapoint-background`).remove(); // Remove old background
    },
    ...plotOptions
  });

  // Set the line colors
  lines.forEach(function (line, i) {
    var lineIndex = i + 1;
    $(`${target} .mg-main-line.mg-line${lineIndex}-color`)
      .css("stroke", line.color);
    $(`${target} .mg-area${lineIndex}-color, .mg-hover-line${lineIndex}-color`)
      .css("fill", line.color)
      .css("stroke", line.color);
    $(`${target} .mg-line${lineIndex}-legend-color`)
      .css("fill", line.color);
  });

  // Reposition and resize text
  $(`${target} .mg-x-axis .mg-year-marker text`)
    .attr("dy", "5");
  $(`${target} .mg-x-axis .label`)
    .attr("dy", "20");
  $(`${target} .mg-y-axis .label`)
    .attr("y", "10")
    .attr("dy", "0");
  $(`${target} .mg-marker-text`)
    .attr("text-anchor", "start")
    .attr("dy", "18")
    .attr("dx", "5");

  // X axis label should also be build time toggle
  $(`${target} .mg-x-axis .label`)
    .attr("text-decoration", "underline")
    .click(function () {
      var newUseSubmissionDate = $("input[name=build-time-toggle]:checked")
        .val() !== "0" ? 0 : 1;
      $("input[name=build-time-toggle][value=" + newUseSubmissionDate + "]")
        .prop("checked", true)
        .trigger("change");
    });

}

function displayEvolutions(allLines, useSubmissionDate, usePercentages) {
  indicate("Rendering evolutions...");

  let metaAggregateNames = gMetaAggregates.map(entry => entry[1]);
  lines = allLines.filter(line => !metaAggregateNames.includes(line.aggregate));

  var aggregateLabels = lines.map(line => line.aggregate);
  var aggregateSet = new Set(aggregateLabels);
  var variableLabel = useSubmissionDate ?
    "Submission Date (click to use Build ID)" :
    "Build ID (click to use Submission Date)";
  var valueLabel = [...aggregateSet]
    .sort()
    .join(", ") + " " + (lines.length > 0 ? lines[0].measure : "");

  displayEvolution('#evolutions', lines, usePercentages, {
    height: 600,
    x_label: variableLabel,
    y_label: valueLabel,
    legend: aggregateLabels
  });
  for (let metaAggregate of gMetaAggregates) {
    let metaLines = allLines.filter(line => line.aggregate == metaAggregate[1]);

    displayEvolution(metaAggregate[3], metaLines, false, {
      height: 300,
      x_label: variableLabel,
      y_label: "Daily Count",
    });
  }

  indicate();
}

var Line = (function () {
  var lineColors = {};
  var goodColors = ["aqua", "blue", "green", "magenta", "lawngreen",
    "brown", "cyan", "darkgreen", "darkorange", "darkred", "navy"];
  var goodColorIndex = 0;
  var filterSortOrder = ["product", "OS", "osVersion", "arch"];

  function Line(measure, channelVersion, aggregate, values) {
    if (typeof measure !== "string") {
      throw "Bad measure value: must be string";
    }
    if (typeof channelVersion !== "string") {
      throw "Bad channelVersion value: must be string";
    }
    if (typeof aggregate !== "string") {
      throw "Bad aggregate value: must be string";
    }
    if (!$.isArray(values)) {
      throw "Bad values value: must be array";
    }

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
    if (this.aggregate === "submissions") {
      return this.measure + " submissions for " + this.channelVersion.replace(
        "/", " ");
    }
    return this.aggregate + " " + this.measure + " for " + this.channelVersion
      .replace("/", " ");
  };
  Line.prototype.getStateString = function Line_getTitleString() {
    return this.aggregate + "/" + this.measure + "/" + this.channelVersion;
  };

  return Line;
})();

// Save the current state to the URL and the page cookie
var gPreviousDisqusIdentifier = null;

function saveStateToUrlAndCookie() {
  var startDate = gInitialPageState.start_date,
    endDate = gInitialPageState.end_date,
    cumulative = gInitialPageState.cumulative,
    trim = gInitialPageState.trim,
    sortKeys = gInitialPageState.sort_keys,
    selectedKeys = gInitialPageState.keys;
  gInitialPageState = {
    aggregates: $("#aggregates")
      .val() || [],
    measure: $("#measure")
      .val(),
    min_channel_version: $("#min-channel-version")
      .val(),
    max_channel_version: $("#max-channel-version")
      .val(),
    use_submission_date: $("input[name=build-time-toggle]:checked")
      .val() !== "0" ? 1 : 0,
    sanitize: $("input[name=sanitize-toggle]:checked")
      .val() !== "0" ? 1 : 0,
  };

  // Save a few unused properties that are used in the distribution dashboard, since state is shared between the two dashboards
  if (startDate !== undefined) {
    gInitialPageState.start_date = startDate;
  }
  if (endDate !== undefined) {
    gInitialPageState.end_date = endDate;
  }
  if (cumulative !== undefined) {
    gInitialPageState.cumulative = cumulative;
  }
  if (trim !== undefined) {
    gInitialPageState.trim = trim;
  }
  if (sortKeys !== undefined) {
    gInitialPageState.sort_keys = sortKeys;
  }

  // We are guaranteed that selectedKeys is defined by loadStateFromUrlAndCookie
  selectedKeys[0] = $("#selected-key")
    .val();
  gInitialPageState.keys = selectedKeys;

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
    /evo\.html$/, "dist.html") + window.location.hash;
  $("#switch-views")
    .attr("href", dashboardURL);

  // If advanced settings are not at their defaults, display a notice in the panel header
  if (gInitialPageState.use_submission_date !== 0 || gInitialPageState.sanitize !==
    1) {
    $("#advanced-settings-toggle")
      .find("span")
      .text(" (modified)");
  } else {
    $("#advanced-settings-toggle")
      .find("span")
      .text("");
  }
}
