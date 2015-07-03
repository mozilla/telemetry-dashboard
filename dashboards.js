$(document).ready(function() {
  // Multiselect boxes
  $('.multiselect').each(function(i, select) {
    var $this = $(this);
    var options = {
      enableFiltering: true,
      enableCaseInsensitiveFiltering: true,
      filterBehavior: "text",
      enableHTML: true, // Allow HTML in the selects, used by the measure selector - be careful to avoid XSS from this
      includeSelectAllOption: true,
      allSelectedText: $this.data("all-selected") !== undefined ? $this.data("all-selected") : "Any",
      enableClickableOptGroups: true,
      maxHeight: 500,
      disableIfEmpty: true,
      nSelectedText: $this.data("n-selected") !== undefined ? $this.data("n-selected") : "selected",
    };
    if ($this.attr("id") === "measure") {
      options.filterBehavior = "custom";
      options.filterCallback = function(element, query) {
        var value = $(element).find("label").text().toLowerCase();
        return value.indexOf(query) >= 0 || value.replace(/_/g, " ").indexOf(query) >= 0;
      };
    }
    if ($this.attr("title") !== undefined) {
      options.nonSelectedText = $this.attr("title");
    }
    $this.multiselect(options);
    $this.next().css("margin-top", "-0.25em"); // Align the control so that the baseline matches surrounding text
  });
  $(".multiselect-container").scroll(function() { // Make the filter box fixed to the top of the select control
    var $this = $(this);
    $this.find(".multiselect-item.filter").css("position", "relative").css("top", $this.scrollTop()).css("z-index", 1);
  });
  
  // Date range pickers
  $(".date-range").daterangepicker();
  
  // Permalink control
  $(".permalink-control").append(
    '<div class="input-group">' +
    '    <span class="input-group-btn"><button type="button" class="btn btn-default" title="Get Permalink"><span class="glyphicon glyphicon-link"></span></button></span>' +
    '    <input type="text" class="form-control">' +
    '</div>'
  );
  $(".permalink-control input").hide().focus(function() {
    // Workaround for broken selection: http://stackoverflow.com/questions/5797539
    var $this = $(this);
    $this.select().mouseup(function() { $this.unbind("mouseup"); return false; });
  });
  $(".permalink-control button").click(function() {
    var $this = $(this);
    $.ajax({
      url: "https://api-ssl.bitly.com/shorten", dataType: "jsonp",
      data: {longUrl: window.location.href, access_token: "48ecf90304d70f30729abe82dfea1dd8a11c4584", format: "json"},
      success: function(response) {
        var longUrl = Object.keys(response.results)[0];
        var shortUrl = response.results[longUrl].shortUrl;
        $this.parents(".permalink-control").find("input").show().val(shortUrl).focus();
      }
    });
  });
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
  
  pageState.use_submission_date = pageState.use_submission_date !== undefined ?
    parseInt(pageState.use_submission_date) : 0;
  pageState.sanitize = pageState.sanitize !== undefined ? parseInt(pageState.sanitize) : 1;
  pageState.cumulative = pageState.cumulative !== undefined ? parseInt(pageState.cumulative) : 0;
  pageState.start_date = pageState.start_date !== undefined ? pageState.start_date : null;
  pageState.end_date = pageState.end_date !== undefined ? pageState.end_date : null;
  return pageState;
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
  if (filterName === "osVersion") {
    var osName = os === null ? "" : (systemNames.hasOwnProperty(os) ? systemNames[os] : os);
    if (ignoredOSs[os] !== undefined) { return []; } // No versions for ignored OSs
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
        return [os + "," + option, osName + " " + (windowsVersionNames.hasOwnProperty(option) ? windowsVersionNames[option] : option), osName];
      });
    } else if (os === "Darwin") {
      return options.map(function(option) {
        for (var prefix in darwinVersionPrefixes) {
          if (option.startsWith(prefix)) {
            return [os + "," + option, osName + " " + option + " (" + darwinVersionPrefixes[prefix] + ")", osName];
          }
        }
        return [os + "," + option, osName + " " + option, osName];
      });
    }
    return options.map(function(option) { return [os + "," + option, osName + " " + option, osName]; });
  } else if (filterName === "arch") {
    return options.map(function(option) {
      return [option, archNames.hasOwnProperty(option) ? archNames[option] : option];
    });
  } else if (filterName === "measure") {
    return options.map(function(option) { return [option, option] });
  } else if (filterName === "channelVersion") {
    var pattern = /^\w+\/\d+$/;
    return options.filter(function(option) { return pattern.test(option); }).map(function(option) { return [option, option.replace("/", " ")] });
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
  function getOptionsList(filterTree, optionsList, currentPath, depth) {
    var options = Object.keys(filterTree).sort();
    var filterOptions = Object.keys(filterTree).filter(function(option) { return option != "_name"; });
    if (filterOptions.length === 0) { return optionsList; }
    
    // Add the current options into the option map
    if (optionsList[depth] === undefined) { optionsList[depth] = []; }
    var os = null;
    if (filterTree._name === "osVersion") { os = currentPath[currentPath.length - 1]; }
    var currentOptions = getHumanReadableOptions(filterTree._name, filterOptions, os);
    optionsList[depth] = optionsList[depth].concat(currentOptions);
    
    filterOptions.forEach(function(option) {
      getOptionsList(filterTree[option], optionsList, currentPath.concat([option]), depth + 1);
    });
    return optionsList;
  }

  var filterTree = getCombinedFilterTree(histogramEvolution);
  var optionsList = getOptionsList(filterTree, [], [], 0);
  
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

function multiselectSetSelected(element, options) {
  element.multiselect("deselectAll", false).multiselect("select", options).multiselect("updateButtonText");
}

// Sets the options of a multiselect to a list of pairs where the first element is the value, and the second is the text
function multiselectSetOptions(element, options, defaultSelected) {
  defaultSelected = defaultSelected || null;
  
  if (options.length === 0) { element.empty().multiselect("rebuild"); return; }
  var selected = element.val() || defaultSelected;
  if (!$.isArray(selected) && selected !== null) { selected = [selected]; }
  
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

var indicate = (function() {
  var indicatorTimeout = null;
  return function indicate(message) {
    message = message || null;
    
    if (indicatorTimeout !== null) { clearTimeout(indicatorTimeout); }
    if (message !== null) {
      indicatorTimeout = setTimeout(function() {
        $(".busy-indicator").show().find(".busy-indicator-message").text(message);
      }, 200);
    } else {
      $(".busy-indicator").hide();
    }
  }
})();