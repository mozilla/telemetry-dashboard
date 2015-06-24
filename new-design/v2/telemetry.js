(function(exports) {
"use strict";

function assert(condition, message) {
  if (!condition) { throw message || "Assertion failed"; }
  return condition;
}

var Telemetry = {
  //BASE_URL: 'http://ec2-54-185-7-17.us-west-2.compute.amazonaws.com:5000/',
  BASE_URL: 'http://ec2-52-12-57-130.us-west-2.compute.amazonaws.com:5000/',
  CHANNEL_VERSION_DATES: null,
  CACHE: {}, CACHE_LAST_UPDATED: {}, CACHE_TIMEOUT: 4 * 60 * 60 * 1000,
};

var urlCallbacks = {}

Telemetry.getJSON = function(url, callback) { // WIP: need CORS headers in the response to do cross-origin requests - currently have cross-origin security disabled
  assert(typeof url === "string", "`url` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  if (Telemetry.CACHE[url] !== undefined) {
    if (Telemetry.CACHE[url]._loading) { // Requested but not yet loaded
      var xhr = Telemetry.CACHE[url];
      var originalCallback = xhr.onload;
      xhr.onload = function() {
        callback(JSON.parse(this.responseText), null);
        originalCallback.call(xhr);
      };
    } else if ((new Date).getTime() - Telemetry.CACHE_LAST_UPDATED[url] < Telemetry.CACHE_TIMEOUT) { // In cache and hasn't expired
      setTimeout(function() { callback(Telemetry.CACHE[url]); }, 1);
    }
    return;
  }
  
  var xhr = new XMLHttpRequest();
  xhr._loading = true;
  Telemetry.CACHE[url] = xhr; // Mark the URL as being requested but not yet loaded
  xhr.onload = function() {
    var result = JSON.parse(this.responseText);
    Telemetry.CACHE[url] = result;
    Telemetry.CACHE_LAST_UPDATED[url] = (new Date).getTime();
    callback(result, null);
  };
  xhr.onerror = function() { callback(null, this.status); };
  xhr.open("get", url, true);
  xhr.send();
}

Telemetry.init = function Telemetry_init(callback) {
  assert(typeof callback === "function", "`callback` must be a function");
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/", function(channels) {
    var loadedChannels = 0;
    Telemetry.CHANNEL_VERSION_DATES = {};
    channels.forEach(function(channel, i) {
      var versionDates = Telemetry.CHANNEL_VERSION_DATES[channel] = {};
      Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel + "/dates/", function(dateEntries) {
        dateEntries.forEach(function(entry) {
          if (!versionDates.hasOwnProperty(entry.version)) { versionDates[entry.version] = []; }
          versionDates[entry.version].push(entry.date);
        })
        loadedChannels ++; // Loaded another channel's dates
        if (loadedChannels == channels.length) { // This is the last channel that needs to be loaded
          callback();
        }
      });
    });
  });
},

Telemetry.getHistogramsOverBuilds = function Telemetry_getHistogramsOverBuilds(channel, version, metric, filters, callback) {
  assert(typeof Telemetry.CHANNEL_VERSION_DATES !== null, "Telemetry.js must be initialized before use");
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof metric === "string", "`metric` must be a string");
  assert(typeof filters === "object", "`filters` must be an object");
  assert(typeof callback === "function", "`callback` must be a function");
  var buildDates = Telemetry.CHANNEL_VERSION_DATES[channel][version].join(",");
  var filterString = "";
  Object.keys(filters).sort().forEach(function(filterName) { // we need to sort the keys in order to make sure the same filters result in the same URL each time, for caching
    filterString += "&" + encodeURIComponent(filterName) + "=" + encodeURIComponent(filters[filterName]);
  });
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel +
    "/?version=" + encodeURIComponent(version) + "&dates=" + encodeURIComponent(buildDates) +
    "&metric=" + encodeURIComponent(metric) + filterString, function(histograms) {
    callback(histograms);
  });
}

Telemetry.getFilterOptions = function Telemetry_getOptions(channel, version, callback) {
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel + "/filters", function(filterOptions) {
    callback(filterOptions);
  });
}

Telemetry.getHistogramLastBucketUpper = function Telemetry_getHistogramLastBucketUpper(buckets, type) {
  assert(type === "linear" || type === "exponential", "Histogram buckets must be linear or exponential");
  assert(buckets.length > 0, "Histogram buckets cannot be empty");
  if (buckets.length == 1) return buckets[0] + 1;
  if (type === "linear") {
    return buckets[buckets.length - 1] + buckets[buckets.length - 1] - buckets[buckets.length - 2];
  } else { // exponential
    return buckets[buckets.length - 1] * buckets[buckets.length - 1] / buckets[buckets.length - 2];
  }
}

Telemetry.getHistogramDates = function Telemetry_getHistogramDates(histograms) {
  assert(histograms.buckets.length > 0, "`histograms` must be a histograms collection");
  return histograms.data.map(function(entry) { return entry.date; });
}

Telemetry.getHistogramSubmissions = function Telemetry_getHistogramSubmissions(histograms) {
  assert(histograms.buckets.length > 0, "`histograms` must be a histograms collection");
  return histograms.data.map(function(entry) { return entry.count; });
}

Telemetry.getHistogramMeans = function Telemetry_getHistogramMeans(histograms) {
  assert(histograms.buckets.length > 0, "`histograms` must be a histograms collection");
  assert(histograms.kind === "linear" || histograms.kind === "exponential", "Histogram buckets must be linear or exponential");
  var buckets = histograms.buckets.concat([Telemetry.getHistogramLastBucketUpper(histograms.buckets, histograms.kind)]);
  histograms.data.map(function(entry) {
    var totalHits = 0, bucketHits = 0;
    var linearTerm = (buckets[buckets.length - 1] - buckets[buckets.length - 2]) / 2;
    var exponentialFactor = Math.sqrt(buckets[buckets.length - 1] / buckets[buckets.length - 2]);
    entry.histogram.forEach(function(count, i) {
      totalHits += count;
      var centralX = (histograms.kind === "linear") ? buckets[i] + linearTerm : buckets[i] * exponentialFactor; // find the center of the current bucket
      bucketHits += count * centralX;
    });
    return bucketHits / totalHits;
  });
}

Telemetry.getHistogramPercentiles = function Telemetry_getHistogramPercentiles(histograms, percentile) { // see http://math.stackexchange.com/a/894986 for algorithm
  assert(histograms.buckets.length > 0, "`histograms` must be a histograms collection");
  assert(histograms.kind === "linear" || histograms.kind === "exponential", "Histogram buckets must be linear or exponential");
  assert(typeof percentile === "number", "`percentile` must be a number");
  assert(0 <= percentile && percentile <= 100, "`percentile` must be between 0 and 100 inclusive");
  var buckets = histograms.buckets.concat([Telemetry.getHistogramLastBucketUpper(histograms.buckets, histograms.kind)]);
  var linearTerm = buckets[buckets.length - 1] - buckets[buckets.length - 2];
  var exponentialFactor = buckets[buckets.length - 1] / buckets[buckets.length - 2];
  return histograms.data.map(function(entry) {
    var hitsAtPercentileInBar = entry.histogram.reduce(function(previous, count) { return previous + count; }, 0) * (percentile / 100);
    var percentileBucketIndex = 0;
    while (hitsAtPercentileInBar >= 0) { hitsAtPercentileInBar -= entry.histogram[percentileBucketIndex]; percentileBucketIndex ++; }
    percentileBucketIndex --; hitsAtPercentileInBar += entry.histogram[percentileBucketIndex]; // decrement to get to the bar containing the percentile
    var ratioInBar = hitsAtPercentileInBar / entry.histogram[percentileBucketIndex]; // the ratio of the hits in the percentile to the hits in the bar containing it - how far we are inside the bar
    if (histograms.kind === "linear") {
      return buckets[percentileBucketIndex] + linearTerm * ratioInBar; // linear interpolation within bar
    } else { // exponential
      return buckets[percentileBucketIndex] * Math.pow(exponentialFactor, ratioInBar); // geometric interpolation within bar
    }
  });
}

Telemetry.getHistogram = function Telemetry_getHistogram(histograms, cumulative) { //wip: add date range
  assert(histograms.buckets.length > 0, "`histograms` must be a histograms collection");
  cumulative = cumulative || false;
  var values = histograms.buckets.map(function(lowerBound) { return 0; });
  if (cumulative) {
    return {
      buckets: histograms.buckets,
      values: histograms.data.reduce(function(values, histogramEntry) {
        var accumulator = 0;
        histogramEntry.histogram.forEach(function(count, i) { accumulator += count; values[i] += accumulator; });
        return values;
      }, values),
    };
  }
  return {
    buckets: histograms.buckets,
    values: histograms.data.reduce(function(values, histogramEntry) {
      histogramEntry.histogram.forEach(function(count, i) { values[i] += count; });
      return values;
    }, values),
  };
}

Telemetry.getCombinedHistograms = function Telemetry_getCombinedHistograms(histograms1, histograms2) {
  assert(histograms1.buckets.length > 0, "`histograms1` must be a histograms collection");
  assert(histograms2.buckets.length > 0, "`histograms2` must be a histograms collection");
  assert(histograms1.kind === histograms2.kind, "`histogram1` and `histogram2` must be of the same kind");
  assert(histograms1.buckets.length === histograms2.buckets.length, "`histogram1` and `histogram2` must have the same buckets");
  var dateMap = {};
  histograms1.data.forEach(function(histogramEntry) {
    if (!dateMap.hasOwnProperty(histogramEntry.date)) { dateMap[histogramEntry.date] = []; }
    dateMap[histogramEntry.date].push(histogramEntry);
  });
  var dataset = [];
  Object.keys(dateMap).sort().forEach(function(date) {
    var entries = dateMap[date];
    var histogram = entries[0].histogram.map(function(count) { return 0; });
    entries.forEach(function(entry) { // go through each histogram entry and combine histograms
      entry.histogram.forEach(function(count, i) { histogram[i] += count });
    });
    dataset.push({
      date: entries[0].date,
      count: entries[0].count,
      label: entries[0].label,
      histogram: histogram,
    });
  });
  return {
    buckets: histograms1.buckets,
    kind: histograms1.kind,
    data: dataset,
  };
}

Telemetry.getVersions = function Telemetry_getVersions() { // shim function
  assert(typeof Telemetry.CHANNEL_VERSION_DATES !== null, "Telemetry.js must be initialized before use");
  var versions = [];
  for (var channel in Telemetry.CHANNEL_VERSION_DATES) {
    Object.keys(Telemetry.CHANNEL_VERSION_DATES[channel]).forEach(function(version) {
      versions.push(channel + "/" + version);
    });
  }
  return versions.sort();
}

Telemetry.getMeasures = function Telemetry_getMeasures(channel, version, callback) {
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel +
    "/filters/metric", function(metrics) {
    callback(metrics);
  });
}

exports.Telemetry = Telemetry;
return Telemetry;
})(this);
