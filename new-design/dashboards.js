$(document).ready(function() {
  // Select boxes
  $(".select2").select2({dropdownAutoWidth: true}).each(function(i, select) {
    $(this).next().css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
  });
  
  // Multiselect boxes
  $('.multiselect').each(function(i, select) {
    var $this = $(this);
    var options = {
      enableFiltering: true,
      enableCaseInsensitiveFiltering: true,
      includeSelectAllOption: true,
      allSelectedText: $this.data("all-selected") !== undefined ? $this.data("all-selected") : "Any",
      enableClickableOptGroups: true,
      maxHeight: 500,
    };
    if ($this.attr("title") !== undefined) {
      options.nonSelectedText = $this.attr("title");
    }
    $this.multiselect(options);
    $this.next().css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
  });
  
  // Date range pickers
  $(".date-range").daterangepicker();
});



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
  var pageState = {};
  url.split("&").forEach(function(fragment, i) {
    var parts = fragment.split("=");
    if (parts.length != 2) return;
    pageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });

  // Process the saved state value
  pageState.aggregates = pageState.aggregates !== undefined ?
    pageState.aggregates.split("!").filter(function(v) { return v !== ""; }) : ["median"];
  pageState.measure = pageState.measure !== undefined ?
    pageState.measure : "GC_MS";
  pageState.min_channel_version = pageState.min_channel_version !== undefined ?
    pageState.min_channel_version : "nightly/39";
  pageState.max_channel_version = pageState.max_channel_version !== undefined ?
    pageState.max_channel_version : "nightly/41";
  pageState.product = pageState.product !== undefined ?
    pageState.product.split("!").filter(function(v) { return v !== ""; }) : ["Firefox"];
  pageState.os = pageState.os !== undefined ?
    pageState.os.split("!").filter(function(v) { return v !== ""; }) : null;
  pageState.arch = pageState.arch !== undefined ?
    pageState.arch.split("!").filter(function(v) { return v !== ""; }) : null;
  pageState.e10s = pageState.e10s !== undefined ?
    pageState.e10s.split("!").filter(function(v) { return v !== ""; }) : null;
  pageState.processType = pageState.processType !== undefined ?
    pageState.processType.split("!").filter(function(v) { return v !== ""; }) : null;
  pageState.os_version = pageState.os_version !== undefined ?
    pageState.os_version.split("!").filter(function(v) { return v !== ""; }) : null;
  return pageState;
}

// Generate array of individual filter sets that, when the resulting histograms are added together, results in the same histogram as if all the filter options were selected
function getFilterSets(filters) {
  // Obtain a mapping from filter names to filter options
  var filterMapping = {};
  for (var filterName in filters) {
    var selector = filters[filterName];
    var selected = selector.val() || [];
    if (selected.length !== selector.find("option").length) { // Some options are not selected, so we need to filter
      if (filterName === "os") { // special case filtering for OSs, since there are two separate versions
        var osCounts = {}; // get a mapping of OSs to the number of OS versions it has
        selector.find("option").each(function(i, option) {
          var os = option.getAttribute("value").split(",")[0];
          osCounts[os] = (osCounts[os] || 0) + 1;
        });
        var selectedOptions = {}; // get a mapping of the selected OSs to the number of OS versions selected
        selected.forEach(function(filterOption) {
          var os = filterOption.split(",")[0];
          if (!selectedOptions.hasOwnProperty(os)) { selectedOptions[os] = []; }
          selectedOptions[os].push(filterOption)
        });
        var selectedOSs = [];
        for (var os in selectedOptions) {
          if (selectedOptions[os].length === osCounts[os]) { // all versions of a specific OS are selected
            selectedOSs.push(os);
          } else { // not all versions are selected, add all versions
            selectedOSs = selectedOSs.concat(selectedOptions[os]);
          }
        };
        filterMapping["os"] = selectedOSs;
      } else {
        filterMapping[filterName] = selected;
      }
    }
  }
  
  // Compute filter sets
  function copy(obj) {
    var result = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) { result[key] = obj[key]; }
    }
    return result;
  }
  var filterSets = [{}];
  for (var filterName in filterMapping) {
    filterSets = [].concat.apply([], filterMapping[filterName].map(function(filterValue) {
      return filterSets.map(function(filterSet) {
        var newFilterSet = copy(filterSet);
        if (filterName === "os") {
          if (filterValue.indexOf(",") >= 0) { // we have an OS value like "Windows_NT,6.1", and we want to set the os filter to Windows_NT and the osVersion filter to 6.1
            var parts = filterValue.split(",");
            newFilterSet["os"] = parts[0]; newFilterSet["osVersion"] = parts[1];
          } else { // we have an OS value like "Windows_NT" (all versions of Windows), just set the os filter, not the osVersion filter
            newFilterSet["os"] = filterValue;
          }
        } else {
          newFilterSet[filterName] = filterValue;
        }
        return newFilterSet;
      });
    }));
  }
  return filterSets;
}

function getHumanReadableOptions(filterName, options) {
  var systemNames = {"Windows_NT": "Windows", "Darwin": "OS X"};
  var windowsVersionNames = {"5.0": "2000", "5.1": "XP", "5.2": "XP Pro x64", "6.0": "Vista", "6.1": "7", "6.2": "8", "6.3": "8.1", "6.4": "10 (Tech Preview)", "10.0": "10"};
  var windowsVersionOrder = {"5.0": 0, "5.1": 1, "5.2": 2, "6.0": 3, "6.1": 4, "6.2": 5, "6.3": 6, "6.4": 7, "10.0": 8};
  var darwinVersionPrefixes = {
    "1.2.": "Kodiak", "1.3.": "Cheetah", "1.4.": "Puma", "6.": "Jaguar",
    "7.": "Panther", "8.": "Tiger", "9.": "Leopard", "10.": "Snow Leopard",
    "11.": "Lion", "12.": "Mountain Lion", "13.": "Mavericks", "14.": "Yosemite",
  };
  var archNames = {"x86": "32-bit", "x86-64": "64-bit"};
  var e10sNames = {"false": "no e10s", "true": "e10s"};
  var processTypeNames = {"false": "main process", "true": "child process"};
  if (filterName === "os") {
    var entries = options.map(function(option) {
      var parts = option.split(",");
      return {os: parts[0], osName: systemNames.hasOwnProperty(parts[0]) ? systemNames[parts[0]] : parts[0], version: parts[1], value: option};
    });
    
    var osEntryMapping = {}; entries.forEach(function(entry) {
      if (!osEntryMapping.hasOwnProperty(entry.os)) { osEntryMapping[entry.os] = []; }
      osEntryMapping[entry.os].push(entry);
    });
    
    // Apply custom sort order for Windows
    if (osEntryMapping.hasOwnProperty("Windows_NT")) {
      osEntryMapping["Windows_NT"].sort(function(a, b) {
        // Sort by explicit version order if available
        if (windowsVersionOrder.hasOwnProperty(a) && windowsVersionOrder.hasOwnProperty(b)) {
          return windowsVersionOrder[a] < windowsVersionOrder[b] ? -1 : (windowsVersionOrder[a] > windowsVersionOrder[b] ? 1 : 0);
        } else if (windowsVersionOrder.hasOwnProperty(a)) {
          return -1;
        } else if (windowsVersionOrder.hasOwnProperty(b)) {
          return 1;
        }
        return ((a < b) ? -1 : ((a > b) ? 1 : 0));
      });
    }
    
    // Apply custom version names for OS versions, grouped by OS alphabetically
    var result = [];
    return [].concat.apply([], Object.keys(osEntryMapping).sort().map(function(os) {
      var entries = osEntryMapping[os];
      return entries.map(function(entry) {
        var versionName = entry.version;
        if (entry.os === "Windows_NT") {
          versionName = windowsVersionNames.hasOwnProperty(entry.version) ? windowsVersionNames[entry.version] : entry.version;
        } else if (entry.os === "Darwin") {
          for (var prefix in darwinVersionPrefixes) {
            if (entry.version.startsWith(prefix)) {
              versionName = entry.version + " (" + darwinVersionPrefixes[prefix] + ")";
            }
          }
        }
        return [entry.value, entry.osName + " " + versionName, entry.osName];
      });
    }));
  } else if (filterName === "arch") {
    return options.map(function(option) {
      return [option, archNames.hasOwnProperty(option) ? archNames[option] : option];
    });
  } else if (filterName === "e10s") {
    return options.map(function(option) {
      return [option, e10sNames.hasOwnProperty(option) ? e10sNames[option] : option];
    });
  } else if (filterName === "processType") {
    return options.map(function(option) {
      return [option, processTypeNames.hasOwnProperty(option) ? processTypeNames[option] : option];
    });
  }
  return options.map(function(option) { return [option, option] });
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

function deduplicate(values) {
  var seen = {};
  return values.filter(function(option) {
    if (seen.hasOwnProperty(option)) { return false; }
    seen[option] = true;
    return true;
  });
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
  if (typeof selected === "string") { element.each(function() { $(this).select2("val", selected); }); }
  else { element.each(function() { $(this).select2("val", options[0][0]); }); }
}

function selectSetSelected(element, option) {
  var options = element.find("option").map(function() { return $(this).val(); }).toArray();
  if (options.indexOf(option) >= 0) {
    element.select2("val", option);
  } else {
    console.log("BAD OPTION: " + option)
  }
}

// Sets the options of a multiselect to a list of pairs where the first element is the value, and the second is the text
function multiselectSetOptions(element, options, defaultSelected) {
  defaultSelected = defaultSelected || null;
  
  if (options.length === 0) { element.empty().multiselect("rebuild"); return; }
  var selected = element.val() || defaultSelected;
  
  // Check inputs
  if (defaultSelected !== null) {
    defaultSelected.forEach(function(option) {
      if (typeof option !== "string") { throw "Bad defaultSelected value: must be array of strings."; }
    });
  }
  
  var useGroups = options[0].length === 3;
  if (useGroups) {
    options.forEach(function(option) {
      if (!$.isArray(option) || option.length !== 3 || typeof option[0] !== "string" || typeof option[1] !== "string" || typeof option[2] !== "string") {
        throw "Bad options value: must be array of arrays, either each with two strings or each with three strings.";
      }
    });

    var groups = deduplicate(options.map(function(triple) { return triple[2]; }));
    var groupOptions = {}; options.forEach(function(triple) {
      if (!groupOptions.hasOwnProperty(triple[2])) { groupOptions[triple[2]] = []; }
      groupOptions[triple[2]].push(triple);
    });
    element.empty().append(groups.map(function(group) {
      var optionsString = groupOptions[group].map(function(triple) {
        return '<option value="' + triple[0] + '">' + triple[1] + '</option>';
      }).join();
      return '<optgroup label="' + group + '">' + optionsString + '</optgroup>'
    }).join()).multiselect("rebuild");
  } else {
    options.forEach(function(option) {
      if (!$.isArray(option) || option.length !== 2 || typeof option[0] !== "string" || typeof option[1] !== "string") {
        throw "Bad options value: must be array of arrays, either each with two strings or each with three strings.";
      }
    });
    
    element.empty().append(options.map(function(option) {
      return '<option value="' + option[0] + '">' + option[1] + '</option>';
    }).join()).multiselect("rebuild");
  }
  
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
