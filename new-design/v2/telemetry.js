var Telemetry = (function() {
"use strict";

function assert(condition, message) {
  if (!condition) { throw message || "Assertion failed"; }
  return condition;
}

var Telemetry = {
  BASE_URL: 'http://ec2-54-185-7-17.us-west-2.compute.amazonaws.com:5000/',
  CHANNEL_VERSION_DATES: null,
};

Telemetry.getJSON = function(url, callback) { // WIP: need CORS headers in the response to do cross-origin requests - currently have cross-origin security disabled
  assert(typeof url === "string", "`url` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  var xhr = new XMLHttpRequest();
  xhr.onload = function() { callback(JSON.parse(this.responseText)); };
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

Telemetry.getHistogramsOverBuilds = function(channel, version, metric, filters, callback) {
  assert(typeof Telemetry.CHANNEL_VERSION_DATES !== null, "Telemetry.js must be initialized before use");
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof metric === "string", "`metric` must be a string");
  assert(typeof filters === "object", "`filters` must be an object");
  assert(typeof callback === "function", "`callback` must be a function");
  var buildDates = Telemetry.CHANNEL_VERSION_DATES[channel][version].join(",");
  var filterString = "";
  for (var filterName in filters) {
    filterString += "&" + encodeURIComponent(filterName) + "=" + encodeURIComponent(filters[filterName]);
  }
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel +
    "/?version=" + encodeURIComponent(version) + "&dates=" + encodeURIComponent(buildDates) +
    "&metric=" + encodeURIComponent(metric) + filterString, function(histograms) {
    callback(histograms);
  });
}

Telemetry.getHistogramLastBucketUpper = function(buckets, type) {
  assert(type === "linear" || type === "exponential", "Histogram buckets must be linear or exponential");
  assert(buckets.length > 0, "Histogram buckets cannot be empty");
  if (buckets.length == 1) return buckets[0] + 1;
  if (type === "linear") {
    return buckets[buckets.length - 1] + buckets[buckets.length - 1] - buckets[buckets.length - 2];
  } else { // exponential
    return buckets[buckets.length - 1] * buckets[buckets.length - 1] / buckets[buckets.length - 2];
  }
}

Telemetry.getHistogramMeans = function(histograms) {
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

Telemetry.getHistogramPercentiles = function(histograms, percentile) { // see http://math.stackexchange.com/a/894986 for algorithm
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

Telemetry.getOverallHistogram = function(histograms, cumulative) { //wip: add date range
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

Telemetry.getVersions = function() { // shim function
  assert(typeof Telemetry.CHANNEL_VERSION_DATES !== null, "Telemetry.js must be initialized before use");
  var versions = [];
  for (var channel in Telemetry.CHANNEL_VERSION_DATES) {
    Object.keys(Telemetry.CHANNEL_VERSION_DATES[channel]).forEach(function(version) {
      versions.push(channel + " " + version);
    });
  }
  return versions;
}

Telemetry.getMeasures = function(channel, version, callback) {
  assert(typeof callback === "function", "`callback` must be a function");
  //wip: there is currently no way to get the measures using the current API, so we're just faking it
  setTimeout(function() {
    callback({"DECODER_INSTANTIATED_MACARABIC": {"expires_in_version": "never", "kind": "flag", "description": "Whether the decoder for MACARABIC has been instantiated in this session."}, "GC_MS": {"high": "10000", "expires_in_version": "never", "kind": "exponential", "description": "Time spent running JS GC (ms)", "n_buckets": 50}, "WEBRTC_CALL_DURATION": {"high": "10000", "expires_in_version": "never", "kind": "exponential", "description": "The length of time (in seconds) that a call lasted.", "n_buckets": "1000"}, "PLACES_FAVICON_ICO_SIZES": {"high": 524288, "expires_in_version": "never", "kind": "exponential", "description": "PLACES: Size of the ICO favicon files loaded from the web (Bytes)", "n_buckets": 100}, "SSL_TIME_UNTIL_READY": {"kind": "exponential", "description": "ms of SSL wait time including TCP and proxy tunneling", "high": "60000", "expires_in_version": "never", "extended_statistics_ok": true, "n_buckets": 200}, "HTTP_PAGE_COMPLETE_LOAD_V2": {"kind": "exponential", "description": "HTTP page: Overall load time - all (ms) [cache2]", "high": "30000", "expires_in_version": "never", "extended_statistics_ok": true, "n_buckets": 50}});
  }, 500);
}

return Telemetry;
})();
