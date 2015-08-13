(function(exports) {
"use strict";

/*
Telemetry.js v1 uses v2 telemetry, while Telemetry.js v2 uses unified FHR/telemetry, and both libraries have an incompatible API. This library wraps Telemetry.js v2 to expose the Telemetry.js v1 API, for compatibility purposes.

Note that using this library is recommended only for compatibility reasons. The full Telemetry.js v2 API has many additional features, such as support for keyed histograms and faster operations.

HOW TO USE THIS SHIM
====================

Import the shim and Telemetry.js v2 somewhere, replacing this:

    <script src="../v1/telemetry.js"></script>

With this:

    <script src="../v2/telemetry.js"></script>
    <script src="../v2/v1-shim.js"></script> 
    <script>Telemetry = new TelemetryShim(Telemetry);</script>

Now, all the code on that page will be running on top of Telemetry.js v2.

Possible compatibility issues when using this shim, vs. using Telemetry.js v1:

* Undocumented APIs (however, the `histogramInstance._filter_path` property is also implemented for convenience).
* `Telemetry.measures()`: the keys of its return value are measures as expected, but the values are always null.
* `histogramEvolutionInstance.each`, `histogramEvolutionInstance.map`, `histogramInstance.submissions`, `histogramInstance.count`, `histogramInstance.mean`, `histogramInstance.percentile`, `histogramInstance.median`, `histogramInstance.each`, and `histogramInstance.map` can possibly make synchronous network requests, which can make the browser temporarily unresponsive.
* `histogramInstance.standardDeviation`, `histogramInstance.geometricMean`, and `histogramInstance.geometricStandardDeviation` - all just return 0.
*/

console.log("WARNING: This library is a shim on top of telemetry.js v2. Upgrading to the telemetry.js v2 API is highly recommended.");

var FILTER_ORDER = ["reason", "appName", "OS", "osVersion", "arch"];

function assert(condition, message) {
  if (!condition) { throw message === undefined ? "Assertion failed" : message; }
  return condition;
}

function deduplicate(values) {
  var seen = {};
  return values.filter(function(option) {
    if (seen.hasOwnProperty(option)) { return false; }
    seen[option] = true;
    return true;
  });
}

function TelemetryShim(Telemetry) {
  this._Telemetry = Telemetry;
}

function getEvolutionSync(Telemetry, channel, version, metric, filters, useSubmissionDate, dateList) {
  var newFilters = {};
  if (filters.hasOwnProperty("appName")) { newFilters["application"] = filters["appName"]; }
  if (filters.hasOwnProperty("OS")) { newFilters["os"] = filters["OS"]; }
  if (filters.hasOwnProperty("osVersion")) { newFilters["osVersion"] = filters["osVersion"]; }
  if (filters.hasOwnProperty("arch")) { newFilters["architecture"] = filters["arch"]; }

  function getJSONSync(url, callback) {
    if (Telemetry.CACHE[url] !== undefined) {
      if (Telemetry.CACHE[url] !== null && Telemetry.CACHE[url]._loading) { // Requested but not yet loaded
        // Do nothing, since this XHR is probably not a synchronous one - we must make a new request
      } else if ((new Date).getTime() - Telemetry.CACHE_LAST_UPDATED[url] < Telemetry.CACHE_TIMEOUT) { // In cache and hasn't expired
        callback(Telemetry.CACHE[url], Telemetry.CACHE[url] === null ? 404 : null);
        return;
      }
    }

    var xhr = new XMLHttpRequest();
    xhr.open("get", url, false); // Make a synchronous request
    xhr.send();
    if (xhr.status !== 200) {
      if (xhr.status === 404) { // Cache the null result if the URL resolves to a resource or missing resource
        Telemetry.CACHE[url] = null; Telemetry.CACHE_LAST_UPDATED[url] = (new Date).getTime();
      }
      callback(null, xhr.status);
    } else { // Request was successful
      var result = JSON.parse(xhr.responseText);
      Telemetry.CACHE[url] = result; Telemetry.CACHE_LAST_UPDATED[url] = (new Date).getTime();
      callback(result, xhr.status);
    }
  };
  
  // Get a map where the keys are the requested dates
  var dateMap = {}; dateList.forEach(function(date) { dateMap[date] = true; });
  
  var evolution = null;
  var dates = (useSubmissionDate ? Telemetry.CHANNEL_VERSION_DATES : Telemetry.CHANNEL_VERSION_BUILDIDS)[channel][version].join(","); // Request all the dates in order to take advantage of caching
  var filterString = "";
  Object.keys(newFilters).sort().forEach(function(filterName) { // we need to sort the keys in order to make sure the same filters result in the same URL each time, for caching
    filterString += "&" + encodeURIComponent(filterName) + "=" + encodeURIComponent(newFilters[filterName]);
  });
  var variable = useSubmissionDate ? "submission_date" : "build_id";
  getJSONSync(Telemetry.BASE_URL + "aggregates_by/" + variable + "/channels/" + channel +
    "/?version=" + encodeURIComponent(version) + "&dates=" + encodeURIComponent(dates) +
    "&metric=" + encodeURIComponent(metric) + filterString, function(histograms, status) {
    if (histograms === null) {
      assert(status === 404, "Could not obtain evolution: status " + status); // Only allow null evolution if it is 404 - if there is no evolution for the given filters
      evolution = null;
    } else {
      var entries = []; // Mapping from entry labels to a list of entries having that label
      histograms.data.forEach(function(entry) {
        if (!dateMap.hasOwnProperty(entry.date)) { return; } // Date is outside of the range
        entries.push(entry);
      });
      if (entries.length === 0) { // Weird hack - most v2 dashboards assume that every valid filter configuration has at least one submission, so if there actually aren't any, we put in a fake entry
        entries.push({count: 0, date: "20000101", histogram: histograms.buckets, label: "", sum: 0});
      }
      evolution = new Telemetry.Evolution(histograms.buckets, entries, histograms.kind, histograms.description, metric);
    }
  });
  return evolution;
}

TelemetryShim.prototype.init = function(callback) { this._Telemetry.init(callback); }

TelemetryShim.prototype.doAsync = function(action, thisValue, args, callback) {
  setTimeout(function() {
    switch (action) {
      case "Histogram_count":
        callback(thisValue, thisValue._Histogram.count);
        break;
      case "Histogram_precompute":
        callback(thisValue);
        break;
      default:
        throw new Error("Unknown operation: " + action);
    }
  }, 0);
}

TelemetryShim.prototype.getHistogramInfo = function(channel, version, metric, callback) {
  this._Telemetry.getHistogramInfo(channel, version, metric, callback);
}

TelemetryShim.prototype.versions = function() { return this._Telemetry.getVersions(); }

TelemetryShim.prototype.measures = function(channelVersion, callback) {
  var parts = channelVersion.split("/");
  return this._Telemetry.getFilterOptions(parts[0], parts[1], function(filterOptions) {
    var measures = filterOptions.metric || [];
    var measureMap = {};
    measures.forEach(function(measure) { measureMap[measure] = null; });
    callback(measureMap);
  });
}

TelemetryShim.prototype.loadEvolutionOverBuilds = function(channelVersion, measure, callback) { return this.loadEvolution(channelVersion, measure, false, callback); }
TelemetryShim.prototype.loadEvolutionOverTime = function(channelVersion, measure, callback) { return this.loadEvolution(channelVersion, measure, false, callback); }
TelemetryShim.prototype.loadEvolution = function Telemetry_loadEvolution(channelVersion, measure, useSubmissionDate, callback) {
  var parts = channelVersion.split("/");
  var Telemetry = this._Telemetry;
  Telemetry.getFilterOptions(parts[0], parts[1], function(filterOptions) {
    var filterOptionsList = [
      ["saved_session"],
      filterOptions["application"],
      deduplicate(filterOptions["os"].map(function(option) { return option.split(",")[0]; })),
      deduplicate(filterOptions["os"].map(function(option) { return option.split(",")[1]; })),
      filterOptions["architecture"],
    ];
    Telemetry.getHistogramInfo(parts[0], parts[1], measure, useSubmissionDate, function(kind, description, buckets, dates) {
      var evolution = new TelemetryShim.HistogramEvolutionShim(Telemetry, parts[0], parts[1], measure, useSubmissionDate, kind, description, dates, FILTER_ORDER, filterOptionsList, {});
      callback(evolution);
    });
  });
}

TelemetryShim.HistogramEvolutionShim = (function() {
  function HistogramEvolutionShim(Telemetry, channel, version, measure, useSubmissionDate, kind, description, dates, filterNames, filterOptionsList, filters) {
    this._Telemetry = Telemetry;
    this._channel = channel;
    this._version = version;
    this._measure = measure;
    this._useSubmissionDate = useSubmissionDate;
    this._kind = kind;
    this._description = description;
    this._dates = dates; // List of date strings
    this._filterNames = filterNames; // List of filter names
    this._filterOptionsList = filterOptionsList; // List of lists of filter option values
    this._filters = filters; // Mapping of filter names to filter values
    this._Evolution = null;
    
    // Weird hack: calculate the filter path since we use it in a few places in some dashboards
    this._filter_path = [measure];
    for (var i = 0; i < FILTER_ORDER.length && filters.hasOwnProperty(FILTER_ORDER[i]); i ++) {
      this._filter_path.push(filters[FILTER_ORDER[i]]);
    }
  }
  
  HistogramEvolutionShim.prototype.measure = function() { return this._measure; }
  HistogramEvolutionShim.prototype.kind = function() { return this._kind; }
  HistogramEvolutionShim.prototype.description = function() { return this._description; }
  HistogramEvolutionShim.prototype.filterName = function() { return this._filterNames[0] || null; };
  HistogramEvolutionShim.prototype.filterOptions = function() { return (this._filterOptionsList[0] || []).slice(); };
  
  HistogramEvolutionShim.prototype.filter = function(option) {
    var newFilters = {}; for (var filterName in this._filters) { newFilters[filterName] = this._filters[filterName]; }; // Clone the current filters
    newFilters[this.filterName()] = option; // Add the new filter
    return new HistogramEvolutionShim(this._Telemetry, this._channel, this._version, this.measure(), this._useSubmissionDate, this.kind(), this.description(), this._dates, this._filterNames.slice(1), this._filterOptionsList.slice(1), newFilters);
  };
  
  HistogramEvolutionShim.prototype.dates = function() {
    return this._dates.map(function(date) {
      assert(date.length === 8, "Invalid date string");
      var YYYY = date.substring(0, 4), MM = date.substring(4, 6), DD = date.substring(6, 8);
      return new Date(YYYY + "-" + MM + "-" + DD);
    }).sort(function(a, b) { return a - b; });
  };
  
  HistogramEvolutionShim.prototype.range = function(startDate, endDate) {
    var dates = this.dates();
    startDate = startDate || dates[0];
    endDate = endDate || dates[dates.length - 1];
    var newDates = this._dates.filter(function(date) {
      assert(date.length === 8, "Invalid date string");
      var YYYY = date.substring(0, 4), MM = date.substring(4, 6), DD = date.substring(6, 8);
      var dateValue = new Date(YYYY + "-" + MM + "-" + DD);
      return startDate <= dateValue && dateValue <= endDate;
    });
    return new TelemetryShim.HistogramShim(this._Telemetry, this._channel, this._version, this._measure, this._useSubmissionDate, this._kind, this._description, newDates, this._filterNames, this._filterOptionsList, this._filters);
  };
  
  // The functions below need to make synchronous network requests
  
  HistogramEvolutionShim.prototype.each = function(callback, context) { this.map(callback, context); };
  HistogramEvolutionShim.prototype.map = function(callback, context) {
    this.getEvolutionSync();
    var _this = this;
    context = context === undefined ? this : context;
    return this._Evolution.map(function(histogram, i, date) {
      var dateString = ("000" + date.getUTCFullYear()).substr(-4) + ("0" + (date.getUTCMonth() + 1)).substr(-2) + ("0" + date.getUTCDate()).substr(-2);
      var histogramShim = new TelemetryShim.HistogramShim(_this._Telemetry, _this._channel, _this._version, _this._measure, _this._useSubmissionDate, _this._kind, _this._description, [dateString], _this._filterNames, _this._filterOptionsList, _this._filters);
      return callback.call(context, date, histogramShim, i);
    });
  };
  
  HistogramEvolutionShim.prototype.getEvolutionSync = function() {
    if (this._Evolution !== null) { return; }
    this._Evolution = getEvolutionSync(this._Telemetry, this._channel, this._version, this._measure, this._filters, this._useSubmissionDate, this._dates);
  };
  
  return HistogramEvolutionShim;
})();

TelemetryShim.HistogramShim = (function() {  
  function HistogramShim(Telemetry, channel, version, measure, useSubmissionDate, kind, description, dates, filterNames, filterOptionsList, filters) {
    this._Telemetry = Telemetry;
    this._channel = channel;
    this._version = version;
    this._measure = measure;
    this._useSubmissionDate = useSubmissionDate;
    this._kind = kind;
    this._description = description;
    this._dates = dates; // List of date strings
    this._filterNames = filterNames; // List of filter names
    this._filterOptionsList = filterOptionsList; // List of lists of filter option values
    this._filters = filters; // Mapping of filter names to filter values
    this._Histogram = null;
    
    // Weird hack: calculate the filter path since we use it in a few places in some dashboards
    this._filter_path = [measure];
    for (var i = 0; i < FILTER_ORDER.length && filters.hasOwnProperty(FILTER_ORDER[i]); i ++) {
      this._filter_path.push(filters[FILTER_ORDER[i]]);
    }
  }
  
  HistogramShim.prototype.measure = function() { return this._measure; }
  HistogramShim.prototype.kind = function() { return this._kind; }
  HistogramShim.prototype.description = function() { return this._description; }
  HistogramShim.prototype.filterName = function() { return this._filterNames[0] || null; };
  HistogramShim.prototype.filterOptions = function() { return (this._filterOptionsList[0] || []).slice(); };
  
  HistogramShim.prototype.filter = function(option) {
    var newFilters = {}; for (var filterName in this._filters) { newFilters[filterName] = this._filters[filterName]; }; // Clone the current filters
    newFilters[this.filterName()] = option; // Add the new filter
    return new HistogramShim(this._Telemetry, this._channel, this._version, this.measure(), this._useSubmissionDate, this.kind(), this.description(), this._dates, this._filterNames.slice(1), this._filterOptionsList.slice(1), newFilters);
  };

  // The functions below need to make synchronous network requests
  
  HistogramShim.prototype.submissions = function() { this.getHistogramSync(); return this._Histogram.submissions; };
  HistogramShim.prototype.count = function() { this.getHistogramSync(); return this._Histogram.count; };
  HistogramShim.prototype.mean = function() { this.getHistogramSync(); return this._Histogram.mean(); };
  HistogramShim.prototype.standardDeviation = function() { return 0; };
  HistogramShim.prototype.geometricMean = function() { return 0; };
  HistogramShim.prototype.geometricStandardDeviation = function() { return 0; };
  HistogramShim.prototype.percentile = function(value) { this.getHistogramSync(); return this._Histogram.percentile(value); };
  HistogramShim.prototype.median = function(value) { this.getHistogramSync(); return this._Histogram.percentile(50); };
  HistogramShim.prototype.each = function(callback, context) { this.getHistogramSync(); this._Histogram.map(callback, context); };
  HistogramShim.prototype.map = function(callback, context) { this.getHistogramSync(); return this._Histogram.map(callback, context); };
  
  HistogramShim.prototype.getHistogramSync = function() {
    if (this._Histogram !== null) { return; }
    var evolution = getEvolutionSync(this._Telemetry, this._channel, this._version, this._measure, this._filters, this._useSubmissionDate, this._dates);
    this._Histogram = evolution.histogram();
  };
  
  return HistogramShim;
})();

exports.TelemetryShim = TelemetryShim;
return TelemetryShim;
})(this);
