$(document)
  .ready(function () {
    // Multiselect boxes
    $('.multiselect')
      .each(function (i, select) {
        var $this = $(this);
        var options = {
          enableFiltering: true,
          enableCaseInsensitiveFiltering: true,
          filterBehavior: "both", // Filter by both the value and the text of the option
          allSelectedText: $this.data("all-selected") !== undefined ?
            $this.data("all-selected") : "Any",
          enableClickableOptGroups: true,
          maxHeight: 500,
          disableIfEmpty: true,
          nSelectedText: $this.data("n-selected") !== undefined ? $this.data(
            "n-selected") : "selected",
          onDropdownShow: function (event) { // Focus and clear the search box whenever the dropdown is opened
            setTimeout(function () {
              var container = $(event.currentTarget).find(".multiselect-container");
              var selectedItem = container.find(".active");

              // Clear the search box and focus it
              container.find(".filter input").val("").trigger("input").focus();

              // Scroll the previously selected item into view
              setTimeout(function() {
                var position = selectedItem.position().top + container.scrollTop();
                container.scrollTop(Math.max(position - 100, 0));
              }, 350); // The multiselect filter timeout is 300, so make sure to scroll only after the filter is applied
            }, 0);
          },
        };

        // Horrible hacks to make some very specific functionality work
        if (["aggregates", "filter-os"].indexOf($this.attr("id")) >= 0) {
          // Add the Select All option to some of the selectors
          options.includeSelectAllOption = true;
        }
        if ($this.attr("id") === "measure") { // Measure should search as if spaces were underscores
          options.filterBehavior = "custom";
          options.filterCallback = function (element, query) {
            var currentOption = $(element)
              .find("label")
              .text()
              .toLowerCase(); // Get the value of the current option being filtered
            query = query.toLowerCase()
              .trim();
            return currentOption.indexOf(query) >= 0 || currentOption.replace(
                /_/g, " ")
              .indexOf(query) >= 0 || currentOption.indexOf(query.replace(
                /[ _]/g, "")) >= 0;
          };
        }
        if ($this.attr("id") === "filter-os") { // OS filter should show custom text for selections
          options.buttonText = function (options, select) {
            if (options.length === 0) { // None selected
              return this.nonSelectedText;
            } else if (this.allSelectedText && options.length === $(
                'option', $(select))
              .length && $('option', $(select))
              .length !== 1 && this.multiple) { // All selected
              return this.allSelectedText + ' (' + options.length + ')';
            } else {
              var systems = compressOSs();
              if (systems.length > this.numberDisplayed) { // Some selected, more than list-all threshold
                return options.length + ' ' + this.nSelectedText;
              } else { // Some selected, under or at list-all threshold
                var selected = '';
                var delimiter = this.delimiterText;
                var listing = options.parent()
                  .parent();
                systems.forEach(function (os) {
                  if (os.indexOf(",") >= 0) {
                    var option = listing.find('option[value="' + os +
                      '"]');
                    selected += (option.attr('label') !== undefined ?
                        option.attr('label') : option.text()) +
                      delimiter;
                  } else {
                    var label = getHumanReadableOptions("os", [os])[0]
                      [1];
                    selected += label + delimiter;
                  }
                });
                return selected.substr(0, selected.length - 2);
              }
            }
          }
          options.buttonTitle = function (options, select) {
            return getHumanReadableOptions("os", compressOSs())
              .map(function (option) {
                return option[1];
              })
              .join(", ");
          }
        }

        if ($this.attr("title") !== undefined) {
          options.nonSelectedText = $this.attr("title");
        }
        $this.multiselect(options);
        $this.next()
          .find("input[type=radio]")
          .attr("checked", false); // Workaround for bug where the first radio button is always checked
        $this.next()
          .css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
      });

    // Date range pickers
    $(".date-range")
      .daterangepicker();
    $(
        ".daterangepicker input[name=daterangepicker_start], .daterangepicker input[name=daterangepicker_end]"
      )
      .keydown(function (event) {
        // Cause Enter to apply the settings
        if (event.keyCode == 13) {
          var $this = $(this)
            .parents(".daterangepicker");
          $this.find(".applyBtn")
            .focus()
            .click();
          event.preventDefault();
          return false;
        }
      });

    // Permalink control
    $(".permalink-control")
      .append(
        '<div class="input-group">' +
        '    <span class="input-group-btn"><button type="button" class="btn btn-default" title="Get Permalink"><span class="glyphicon glyphicon-link"></span></button></span>' +
        '    <input type="text" class="form-control">' +
        '</div>'
      );
    $(".permalink-control input")
      .hide()
      .focus(function () {
        // Workaround for broken selection: http://stackoverflow.com/questions/5797539
        var $this = $(this);
        $this.select()
          .mouseup(function () {
            $this.unbind("mouseup");
            return false;
          });
      });
    $(".permalink-control button")
      .click(function () {
        var $this = $(this);
        $.ajax({
          url: "https://api-ssl.bitly.com/shorten",
          dataType: "jsonp",
          data: {
            longUrl: window.location.href,
            access_token: "48ecf90304d70f30729abe82dfea1dd8a11c4584",
            format: "json"
          },
          success: function (response) {
            var longUrl = Object.keys(response.results)[0];
            var shortUrl = response.results[longUrl].shortUrl;
            $this.parents(".permalink-control")
              .find("input")
              .show()
              .val(shortUrl)
              .focus();
          }
        });
      });
  });

// Load the current state from the URL, or the cookie if the URL is not specified
function loadStateFromUrlAndCookie() {
  var url = "";
  var index = window.location.href.indexOf("#");
  if (index > -1) {
    url = decodeURI(window.location.href.substring(index + 1));
  }
  if (url[0] == "!") {
    url = url.slice(1);
  }
  var pageState = {};

  // Load from cookie if URL does not have state
  if (url.indexOf("max_channel_version=") < 0) {
    var name = "stateFromUrl=";
    document.cookie.split(";")
      .forEach(function (entry) {
        entry = entry.trim();
        if (entry.indexOf(name) == 0) {
          url = entry.substring(name.length, entry.length);
        }
      });
  }
  if (url.indexOf("max_channel_version=") < 0) { // No state or invalid/corrupted state, restore to default settings
    pageState.aggregates = ["median"];
    pageState.measure = ["GC_MS"];
    pageState.min_channel_version = null;
    pageState.max_channel_version = null;
    pageState.product = ["Firefox"];
    pageState.os = pageState.arch = pageState.e10s = pageState.processType =
      null;
    pageState.use_submission_date = 0;
    pageState.sanitize = 1;
    pageState.table = 0;
    pageState.cumulative = 0;
    pageState.start_date = pageState.end_date = null;
    return pageState;
  }

  // Load the options
  url.split("&")
    .forEach(function (fragment, i) {
      var parts = fragment.split("=");
      if (parts.length != 2) return;
      pageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
    });

  // Process the saved state value
  if (typeof pageState.aggregates === "string") {
    var aggregates = pageState.aggregates.split("!")
      .filter(function (v) {
        return ["5th-percentile", "25th-percentile", "median",
          "75th-percentile", "95th-percentile", "mean"].indexOf(v) >= 0;
      });
    if (aggregates.length > 0) {
      pageState.aggregates = aggregates;
    } else {
      pageState.aggregates = ["median"];
    }
  } else {
    pageState.aggregates = ["median"];
  }
  pageState.measure = typeof pageState.measure === "string" && pageState.measure !==
    "" && pageState.measure !== "null" ? pageState.measure : "GC_MS";
  pageState.min_channel_version = typeof pageState.min_channel_version ===
    "string" && pageState.min_channel_version.indexOf("/") >= 0 ?
    pageState.min_channel_version : null;
  pageState.max_channel_version = typeof pageState.max_channel_version ===
    "string" && pageState.max_channel_version.indexOf("/") >= 0 ?
    pageState.max_channel_version : null;
  pageState.product = typeof pageState.product === "string" && pageState.product !==
    "" && pageState.product !== "null" ?
    pageState.product.split("!")
    .filter(function (v) {
      return v !== "";
    }) : ["Firefox"];
  pageState.os = typeof pageState.os === "string" && pageState.os !== "" &&
    pageState.os !== "null" ?
    pageState.os.split("!")
    .filter(function (v) {
      return v !== "";
    }) : null;
  pageState.arch = typeof pageState.arch === "string" && pageState.arch !== "" &&
    pageState.arch !== "null" ?
    pageState.arch.split("!")
    .filter(function (v) {
      return v !== "";
    }) : null;
  pageState.e10s = typeof pageState.e10s === "string" && pageState.e10s !== "" &&
    pageState.e10s !== "null" ?
    pageState.e10s.split("!")
    .filter(function (v) {
      return v !== "";
    }) : null;
  pageState.processType = typeof pageState.processType === "string" &&
    pageState.processType !== "" && pageState.processType !== "null" ?
    pageState.processType.split("!")
    .filter(function (v) {
      return v !== "";
    }) : null;

  pageState.use_submission_date = pageState.use_submission_date === "0" ||
    pageState.use_submission_date === "1" ? parseInt(pageState.use_submission_date) :
    0;
  pageState.sanitize = pageState.sanitize === "0" || pageState.sanitize === "1" ?
    parseInt(pageState.sanitize) : 1;
  pageState.table = pageState.table === "0" || pageState.table === "1" ?
    parseInt(pageState.table) : 0;
  pageState.cumulative = pageState.cumulative === "0" || pageState.cumulative ===
    "1" ? parseInt(pageState.cumulative) : 0;
  pageState.trim = pageState.trim === "0" || pageState.trim === "1" ? parseInt(
    pageState.trim) : 1;
  pageState.start_date = typeof pageState.start_date === "string" &&
    /\d{4}-\d{2}-\d{2}/.test(pageState.start_date) ? pageState.start_date :
    null;
  pageState.end_date = typeof pageState.end_date === "string" &&
    /\d{4}-\d{2}-\d{2}/.test(pageState.end_date) ? pageState.end_date : null;
  return pageState;
}

// A whole bucketful of dirty hacks in this function to clean up options and give them nice names
function getHumanReadableOptions(filterName, options, os) {
  os = os || null;
  var productNames = {
    "Firefox": "Firefox Desktop",
    "Fennec": "Firefox Mobile"
  };
  var productOrder = {
    "Firefox": 0,
    "Fennec": 1,
    "Thunderbird": 2
  };
  var systemNames = {
    "WINNT": "Windows",
    "Darwin": "OS X"
  };
  var channelVersionOrder = {
    "nightly": 0,
    "aurora": 1,
    "beta": 2,
    "release": 3
  };
  var ignoredSystems = {
    "Windows_95": true,
    "Windows_NT": true,
    "Windows_98": true
  };
  var windowsVersionNames = {
    "5.0": "2000",
    "5.1": "XP",
    "5.2": "XP Pro x64",
    "6.0": "Vista",
    "6.1": "7",
    "6.2": "8",
    "6.3": "8.1",
    "6.4": "10 (Tech Preview)",
    "10.0": "10"
  };
  var windowsVersionOrder = {
    "5.0": 0,
    "5.1": 1,
    "5.2": 2,
    "6.0": 3,
    "6.1": 4,
    "6.2": 5,
    "6.3": 6,
    "6.4": 7,
    "10.0": 8
  };
  var darwinVersionPrefixes = {
    "1.2.": "Kodiak",
    "1.3.": "Cheetah",
    "1.4.": "Puma",
    "6.": "Jaguar",
    "7.": "Panther",
    "8.": "Tiger",
    "9.": "Leopard",
    "10.": "Snow Leopard",
    "11.": "Lion",
    "12.": "Mountain Lion",
    "13.": "Mavericks",
    "14.": "Yosemite",
    "15.": "El Capitan",
  };
  var archNames = {
    "x86": "32-bit",
    "x86-64": "64-bit"
  };
  if (filterName === "application") {
    return options.sort(function (a, b) {
        // Sort by explicit product order if available
        if (productOrder.hasOwnProperty(a) && productOrder.hasOwnProperty(b)) {
          return productOrder[a] - productOrder[b];
        } else if (productOrder.hasOwnProperty(a)) {
          return -1;
        } else if (productOrder.hasOwnProperty(b)) {
          return 1;
        }
        return ((a < b) ? -1 : ((a > b) ? 1 : 0));
      })
      .map(function (option) {
        return [option, productNames.hasOwnProperty(option) ? productNames[
          option] : option];
      });
  } else if (filterName === "os") {
    return options.map(function (option) {
      return [option, systemNames.hasOwnProperty(option) ? systemNames[
        option] : option];
    });
  } else if (filterName === "osVersion") {
    var osName = os === null ? "" : (systemNames.hasOwnProperty(os) ?
      systemNames[os] : os);
    if (ignoredSystems[os] !== undefined) {
      return [];
    } // No versions for ignored OSs
    if (os === "WINNT") {
      return options.sort(function (a, b) {
          // Sort by explicit version order if available
          if (windowsVersionOrder.hasOwnProperty(a) && windowsVersionOrder.hasOwnProperty(
              b)) {
            return windowsVersionOrder[a] - windowsVersionOrder[b];
          } else if (windowsVersionOrder.hasOwnProperty(a)) {
            return -1;
          } else if (windowsVersionOrder.hasOwnProperty(b)) {
            return 1;
          }
          return ((a < b) ? -1 : ((a > b) ? 1 : 0));
        })
        .map(function (option) {
          return [os + "," + option, osName + " " + (windowsVersionNames.hasOwnProperty(
              option) ? windowsVersionNames[option] : option), "Any " +
            osName];
        });
    } else if (os === "Darwin") {
      return options.map(function (option) {
        for (var prefix in darwinVersionPrefixes) {
          if (option.startsWith(prefix)) {
            return [os + "," + option, osName + " " + option + " (" +
              darwinVersionPrefixes[prefix] + ")", "Any " + osName];
          }
        }
        return [os + "," + option, osName + " " + option, "Any " + osName];
      });
    }
    return options.map(function (option) {
      return [os + "," + option, osName + " " + option, "Any " + osName];
    });
  } else if (filterName === "arch") {
    return options.map(function (option) {
      return [option, archNames.hasOwnProperty(option) ? archNames[option] :
        option];
    });
  } else if (filterName === "measure") {
    return options.sort()
      .map(function (option) {
        return [option, option]
      });
  } else if (filterName === "channelVersion") {
    // Find the latest nightly version
    var latestNightlyVersion = 0;
    options.forEach(function (option) {
      var parts = option.split("/");
      if (parts[0] === "nightly" && parseInt(parts[1]) >
        latestNightlyVersion) {
        latestNightlyVersion = parseInt(parts[1]);
      }
    });

    // Sort the options in the specified order and set aside the bad ones
    var badOptions = [],
      goodOptions = [];
    options.sort(function (a, b) {
        var parts1 = a.split("/"),
          parts2 = b.split("/");
        if (channelVersionOrder.hasOwnProperty(parts1[0]) &&
          channelVersionOrder.hasOwnProperty(parts2[0])) {
          if (channelVersionOrder[parts1[0]] !== channelVersionOrder[parts2[0]]) {
            return channelVersionOrder[parts1[0]] - channelVersionOrder[
              parts2[0]];
          }
          return parseInt(parts2[1]) - parseInt(parts1[1]);
        }
        if (channelVersionOrder.hasOwnProperty(parts1[0])) {
          return -1;
        }
        if (channelVersionOrder.hasOwnProperty(parts2[0])) {
          return 1;
        }
        if (parts1[0] > parts2[0]) {
          return 1;
        }
        if (parts1[0] < parts2[0]) {
          return -1;
        }
        return parseInt(parts2[1]) - parseInt(parts1[1]);
      })
      .forEach(function (option) {
        var parts = option.split("/");
        var version = parseInt(parts[1]);
        if (parts[0] === "nightly") {
          goodOptions.push(option);
        } else if (parts[0] === "aurora") {
          (version <= latestNightlyVersion - 1 ? goodOptions : badOptions)
          .push(option);
        } else if (parts[0] === "beta") {
          (version <= latestNightlyVersion - 2 ? goodOptions : badOptions)
          .push(option);
        } else if (parts[0] === "release") {
          (version <= latestNightlyVersion - 3 ? goodOptions : badOptions)
          .push(option);
        } else {
          badOptions.push(option);
        }
      });

    // Move the latest version of each channel into their own section
    var latest = {};
    goodOptions.forEach(function (option) {
      var parts = option.split("/");
      if (!latest.hasOwnProperty(parts[0]) || (parseInt(parts[1]) > latest[
          parts[0]] && parseInt(parts[1]) < 70)) {
        latest[parts[0]] = parseInt(parts[1]);
      }
    });
    var latestOptions = [];
    goodOptions = goodOptions.filter(function (option) {
      var parts = option.split("/");
      if (parseInt(parts[1]) === latest[parts[0]]) { // Latest version in the channel
        latestOptions.push(option);
        return false;
      }
      return true;
    });

    options = [];
    var previousChannel = null;
    goodOptions.forEach(function (option, i) {
      var channel = option.split("/")[0];
      if (channel !== previousChannel && i !== 0) {
        options.push(null);
      }
      previousChannel = channel;
      options.push(option);
    });

    options = latestOptions.concat([null])
      .concat(options);

    if (badOptions.length > 0) {
      options = options.concat([null])
        .concat(badOptions);
    }
    return options.map(function (option) {
      return option !== null ? [option, option.replace("/", " ")] : null;
    });
  }
  return options.map(function (option) {
    return [option, option]
  });
}

function getOptions(filterList, histogramEvolution) {
  function getCombinedFilterTree(histogramEvolution) {
    var fullOptions = histogramEvolution.filterOptions(),
      filterTree = {};
    if (histogramEvolution.filterName() == "os") {
      return filterTree
    }
    fullOptions.forEach(function (option) {
      var filteredEvolution = histogramEvolution.filter(option);
      filterTree[option] = getCombinedFilterTree(filteredEvolution);
    });
    filterTree._name = histogramEvolution.filterName();
    return filterTree
  }

  function getOptionsList(filterTree, optionsList, currentPath, depth) { // Flatten the tree of options horizontally to get the options list at each level
    var options = Object.keys(filterTree)
      .sort();
    var filterOptions = Object.keys(filterTree)
      .filter(function (option) {
        return option != "_name";
      });
    if (filterOptions.length === 0) {
      return optionsList;
    }

    // Add the current options into the option map
    if (optionsList[depth] === undefined) {
      optionsList[depth] = [];
    }
    var os = null;
    if (filterTree._name === "osVersion") {
      os = currentPath[currentPath.length - 1];
    }
    var currentOptions = getHumanReadableOptions(filterTree._name,
      filterOptions, os);
    optionsList[depth] = optionsList[depth].concat(currentOptions);

    filterOptions.forEach(function (option) {
      getOptionsList(filterTree[option], optionsList, currentPath.concat([
        option]), depth + 1);
    });
    return optionsList;
  }

  var filterTree = getCombinedFilterTree(histogramEvolution);
  var optionsList = getOptionsList(filterTree, [], [], 0);

  // Remove duplicate options
  optionsList = optionsList.map(function (options) {
    var result = [],
      seen = {};
    options.forEach(function (option) {
      if (!(option[0] in seen)) {
        result.push(option);
        seen[option[0]] = true;
      }
    })
    return result;
  })
  return optionsList;
}

function formatNumber(number) {
  if (number == Infinity) return "Infinity";
  if (number == -Infinity) return "-Infinity";
  if (isNaN(number)) return "NaN";
  var mag = Math.abs(number);
  var exponent = Math.log10 !== undefined ? Math.floor(Math.log10(mag)) : Math.floor(
    Math.log(mag) / Math.log(10));
  var interval = Math.pow(10, Math.floor(exponent / 3) * 3);
  var units = {
    1000: "k",
    1000000: "M",
    1000000000: "B",
    1000000000000: "T"
  };
  if (interval in units) {
    return Math.round(number * 100 / interval) / 100 + units[interval];
  }
  return Math.round(number * 100) / 100;
}

function deduplicate(values) {
  var seen = {};
  return values.filter(function (option) {
    if (seen.hasOwnProperty(option)) {
      return false;
    }
    seen[option] = true;
    return true;
  });
}

function multiselectSetSelected(element, options) {
  element.multiselect("deselectAll", false)
    .multiselect("select", options)
    .multiselect("updateButtonText");
}

// Sets the options of a multiselect to a list of pairs where the first element is the value, and the second is the text
// If `defaultSelected` is unspecified or null, then the currently selected values are transferred to the new options
// If `defaultSelected` is an array or an option value, and nothing would otherwise be selected, then the specified values will be selected
function multiselectSetOptions(element, options, defaultSelected) {
  defaultSelected = defaultSelected || null;

  if (options.length === 0) {
    element.empty()
      .multiselect("rebuild");
    return;
  }
  var valuesMap = {};
  options.forEach(function (option) {
    if (option) {
      valuesMap[option[0]] = true;
    }
  });
  var selected = element.val() || [];
  if (!$.isArray(selected)) {
    selected = [selected];
  } // For single selects, the value is not wrapped in an array
  var allSelected = selected.length > 0 && selected.length === element.find(
      "option")
    .length; // Check if all options are selected, in which case all options should be selected afterward as well
  selected = selected.filter(function (value) {
    return valuesMap.hasOwnProperty(value);
  }); // A list of options that are currently selected that will still be available in the new options

  // Check inputs
  if (defaultSelected !== null) {
    defaultSelected.forEach(function (option) {
      if (typeof option !== "string") {
        throw "Bad defaultSelected value: must be array of strings.";
      }
    });
    if (selected.length === 0) {
      selected = $.isArray(defaultSelected) ? defaultSelected : [
        defaultSelected];
    }
  }

  var useGroups = options[0] !== null && options[0].length === 3;
  if (useGroups) { // Build option elements categorized by options group
    options.forEach(function (option) {
      if (!$.isArray(option) || option.length !== 3 || typeof option[0] !==
        "string" || typeof option[1] !== "string" || typeof option[2] !==
        "string") {
        throw "Bad options value: must be array of arrays, either each with two strings or each with three strings.";
      }
    });

    var groups = deduplicate(options.map(function (triple) {
      return triple[2];
    }));
    var groupOptions = {};
    options.forEach(function (triple) {
      if (!groupOptions.hasOwnProperty(triple[2])) {
        groupOptions[triple[2]] = [];
      }
      groupOptions[triple[2]].push(triple);
    });
    element.empty()
      .append(groups.map(function (group) {
          var optionsString = groupOptions[group].map(function (triple) {
              return '<option value="' + triple[0] + '">' + triple[1] +
                '</option>';
            })
            .join();
          return '<optgroup label="' + group + '">' + optionsString +
            '</optgroup>'
        })
        .join())
      .multiselect("rebuild");
  } else { // Build option elements
    options.forEach(function (option) {
      if (option === null) {
        return;
      }
      if ($.isArray(option) && option.length === 2 && typeof option[0] ===
        "string" && typeof option[1] === "string") {
        return;
      }
      throw "Bad options value: must be array of arrays, either each with two strings or each with three strings.";
    });

    element.empty()
      .append(options.map(function (option) {
          if (option === null) {
            return
              '<option disabled>&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;&#9473;</option>';
          }
          return '<option value="' + option[0] + '">' + option[1] +
            '</option>';
        })
        .join())
      .multiselect("rebuild");
  }

  // Select elements in the new multiselect control
  element.multiselect("deselectAll", false)
    .next()
    .find("input[type=radio]")
    .attr("checked", false); // Workaround for bug where the first radio button is always checked
  if (allSelected) { // Previously, everything was selected, so select everything here as well
    element.multiselect("selectAll", false)
      .multiselect("updateButtonText");
  } else { // Some elements were selected before, select them again
    element.multiselect("select", selected); // Select the original options where applicable
  }

  // Make the group labels sticky to the top and bottom of the selector
  if (useGroups) {
    var selector = element.next()
      .find(".multiselect-container");
    var groupHeadings = selector.find(".multiselect-group-clickable")
      .toArray();
    var wasOpen = selector.parent()
      .hasClass("open");
    selector.parent()
      .addClass("open"); // We have to open it temporarily in order to get an accurate outer height
    var topOffset = selector.find(".filter")
      .outerHeight() + 10;
    var bottomOffset = groupHeadings.reduce(function (height, heading) {
      return height + $(heading)
        .outerHeight();
    }, 0);
    groupHeadings.forEach(function (heading, i) {
      bottomOffset -= $(heading)
        .outerHeight();
      $(heading)
        .css("position", "sticky")
        .css("z-index", "1")
        .css("bottom", bottomOffset)
        .css("top", topOffset)
        .css("background", "white");
      topOffset += $(heading)
        .outerHeight();
    });
    if (!wasOpen) {
      selector.parent()
        .removeClass("open");
    }
  }

  // Cause Enter to select the first visible item
  $(".multiselect-container input.multiselect-search")
    .keydown(function (event) {
      if (event.keyCode == 13) {
        $(this)
          .parents("ul")
          .find('li:not(.filter-hidden):not(.filter):first input')
          .focus()
          .click();
        $(this)
          .focus();
        event.preventDefault();
        return false;
      }
    });
}

// =========== Histogram/Evolution Dashboard-specific common code

// These are used for functions that only call their callback for their latest invocation
var gLatestAsyncHandlerMap = {};

function asyncOperationCheck(id) {
  gLatestAsyncHandlerMap[id] = (gLatestAsyncHandlerMap[id] || 0) + 1;
  return gLatestAsyncHandlerMap[id];
}

function asyncOperationWasInterrupted(id, index) {
  return gLatestAsyncHandlerMap[id] !== index;
}

function indicate(message, percentage) {
  message = message || null;
  percentage = percentage || 0;
  if (message !== null) {
    $(".busy-indicator")
      .show()
      .find(".busy-indicator-message")
      .text(message);
    $(".busy-indicator .busy-indicator-progress")
      .css("width", percentage + "%");
  } else {
    $(".busy-indicator")
      .hide();
  }
}

function compressOSs() {
  var selected = $("#filter-os")
    .val() || [];
  var options = $("#filter-os option")
    .map(function (i, element) {
      return $(element)
        .attr("value");
    })
    .toArray();
  var optionCounts = {},
    selectedByOS = {};
  options.forEach(function (option) {
    var os = option.split(",")[0];
    optionCounts[os] = optionCounts[os] + 1 || 1;
  });
  selected.forEach(function (option) {
    var os = option.split(",")[0];
    if (!selectedByOS.hasOwnProperty(os)) {
      selectedByOS[os] = [];
    }
    selectedByOS[os].push(option);
  });
  var selectedOSs = [];
  for (os in selectedByOS) {
    if (selectedByOS[os].length === optionCounts[os]) { // All versions of this OS are selected, just add the OS name
      selectedOSs.push(os);
    } else { // Not all versions selected, add each version individually
      selectedOSs = selectedOSs.concat(selectedByOS[os]);
    }
  }
  return selectedOSs;
}

function expandOSs(OSs) {
  var options = $("#filter-os option")
    .map(function (i, element) {
      return $(element)
        .attr("value");
    })
    .toArray();
  var osVersions = [];
  OSs.forEach(function (osVersion) {
    if (osVersion.indexOf(",") < 0) { // OS only - all OS versions of this OS
      var allVersions = options.filter(function (option) {
        return option.startsWith(osVersion + ",")
      });
      osVersions = osVersions.concat(allVersions);
    } else { // Specific OS version
      osVersions.push(osVersion);
    }
  });
  return osVersions;
}

function updateOSs() {
  // Update CSS classes for labels marking whether they are all selected
  var allSelectedOSList = compressOSs()
    .filter(function (os) {
      return os.indexOf(",") < 0;
    }); // List of all OSs that are all selected
  var selector = $("#filter-os")
    .next()
    .find(".multiselect-container");
  selector.find(".multiselect-group-clickable")
    .removeClass("all-selected");
  var optionsMap = {};
  getHumanReadableOptions("os", allSelectedOSList)
    .forEach(function (option) {
      optionsMap[option[0]] = option[1];
    });
  var optionGroupLabels = selector.find(".multiselect-group-clickable");
  allSelectedOSList.forEach(function (os) {
    var optionGroupLabel = optionGroupLabels.filter(function () {
      return $(this)
        .text()
        .endsWith(" " + optionsMap[os]);
    });
    optionGroupLabel.addClass("all-selected");
  });
}
