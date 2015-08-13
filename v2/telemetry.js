(function(exports) {
"use strict";

function assert(condition, message) {
  if (!condition) { throw message === undefined ? "Assertion failed" : message; }
  return condition;
}

var Telemetry = {
  BASE_URL: 'http://aggregates.telemetry.mozilla.org/',
  CHANNEL_VERSION_DATES: null,
  CHANNEL_VERSION_BUILDIDS: null,
  CACHE: {}, CACHE_LAST_UPDATED: {}, CACHE_TIMEOUT: 4 * 60 * 60 * 1000,
};

var urlCallbacks = {}

Telemetry.Histogram = (function() {
  function Histogram(buckets, values, kind, submissions, sum, description, measure) {
    assert(typeof buckets[0] === "number", "`buckets` must be an array");
    assert(typeof values[0] === "number", "`values` must be an array");
    assert(["flag", "boolean", "count", "enumerated", "linear", "exponential"].indexOf(kind) >= 0, "`kind` must be a valid histogram kind");
    assert(typeof submissions === "number", "`submissions` must be a number");
    assert(typeof sum === "number", "`sum` must be a number");
    assert(typeof description === "string", "`description` must be a string");
    assert(typeof measure === "string", "`measure` must be a string");
    this.buckets = buckets;
    this.values = values;

    this.count = this.values.reduce(function(previous, count) { return previous + count; }, 0);
    this.kind = kind;
    this.submissions = submissions;
    this.sum = sum;
    this.description = description;
    this.measure = measure;
  }

  Histogram.prototype.lastBucketUpper = function() {
    assert(this.buckets.length > 0, "Histogram buckets cannot be empty");
    if (this.buckets.length == 1) return this.buckets[0] + 1;
    if (this.kind === "linear" || this.kind === "flag" || this.kind === "boolean" || this.kind === "enumerated") { // linear buckets
      return this.buckets[this.buckets.length - 1] + this.buckets[this.buckets.length - 1] - this.buckets[this.buckets.length - 2];
    } else { // exponential buckets
      return this.buckets[this.buckets.length - 1] * this.buckets[this.buckets.length - 1] / this.buckets[this.buckets.length - 2];
    }
  };

  Histogram.prototype.mean = function() {
    var buckets = this.buckets.concat([this.lastBucketUpper(this.buckets, this.kind)]);
    var totalHits = 0, bucketHits = 0;
    var linearTerm = (buckets[buckets.length - 1] - buckets[buckets.length - 2]) / 2;
    var exponentialFactor = Math.sqrt(buckets[buckets.length - 1] / buckets[buckets.length - 2]);
    var useLinearBuckets = this.kind === "linear" || this.kind === "flag" || this.kind === "boolean" || this.kind === "enumerated";
    this.values.forEach(function(count, i) {
      totalHits += count;
      var centralX = useLinearBuckets ? buckets[i] + linearTerm : buckets[i] * exponentialFactor; // find the center of the current bucket
      bucketHits += count * centralX;
    });
    return bucketHits / totalHits;
  }

  Histogram.prototype.percentile = function(percentile) {
    assert(typeof percentile === "number", "`percentile` must be a number");
    assert(0 <= percentile && percentile <= 100, "`percentile` must be between 0 and 100 inclusive");
    var buckets = this.buckets.concat([this.lastBucketUpper()]);
    var linearTerm = buckets[buckets.length - 1] - buckets[buckets.length - 2];
    var exponentialFactor = buckets[buckets.length - 1] / buckets[buckets.length - 2];

    var hitsAtPercentileInBar = this.values.reduce(function(previous, count) { return previous + count; }, 0) * (percentile / 100);
    var percentileBucketIndex = 0;
    while (hitsAtPercentileInBar >= 0) { hitsAtPercentileInBar -= this.values[percentileBucketIndex]; percentileBucketIndex ++; }
    percentileBucketIndex --; hitsAtPercentileInBar += this.values[percentileBucketIndex]; // decrement to get to the bar containing the percentile
    var ratioInBar = hitsAtPercentileInBar / this.values[percentileBucketIndex]; // the ratio of the hits in the percentile to the hits in the bar containing it - how far we are inside the bar
    if (this.kind === "linear" || this.kind === "flag" || this.kind === "boolean" || this.kind === "enumerated") { // linear buckets
      return buckets[percentileBucketIndex] + linearTerm * ratioInBar; // linear interpolation within bar
    } else { // exponential buckets
      return buckets[percentileBucketIndex] * Math.pow(exponentialFactor, ratioInBar); // geometric interpolation within bar
    }
  };

  Histogram.prototype.map = function(callback) {
    var buckets = this.buckets.concat([this.lastBucketUpper()]);
    var histogram = this;
    return this.values.map(function(count, i) {
      return callback.call(histogram, count, buckets[i], buckets[i + 1], i);
    });
  }

  return Histogram;
})();

Telemetry.Evolution = (function() {
  function Evolution(buckets, data, kind, description, measure) {
    assert(typeof buckets[0] === "number", "`buckets` must be an array");
    assert(typeof data[0].histogram[0] === "number", "`data` must be an array");
    assert(typeof kind === "string", "`kind` must be a string");
    assert(typeof description === "string", "`description` must be a string");
    assert(typeof measure === "string", "`measure` must be a string");
    this.buckets = buckets;
    this.data = data;
    this.kind = kind;
    this.description = description;
    this.measure = measure;
  }

  Evolution.prototype.dates = function() {
    return this.data.map(function(entry) {
      assert(entry.date.length === 8, "Invalid date string");
      var YYYY = entry.date.substring(0, 4), MM = entry.date.substring(4, 6), DD = entry.date.substring(6, 8);
      return new Date(YYYY + "-" + MM + "-" + DD);
    }).sort(function(a, b) { return a - b; });
  };

  Evolution.prototype.combine = function(otherEvolution) {
    assert(otherEvolution.buckets.length > 0, "`otherEvolution` must be a histograms collection");
    assert(this.kind === otherEvolution.kind, "`this` and `otherEvolution` must be of the same kind");
    assert(this.buckets.length === otherEvolution.buckets.length, "`this` and `otherEvolution` must have the same buckets");
    var dateMap = {}; // Collate the histogram entries by date
    this.data.forEach(function(histogramEntry) {
      if (!dateMap.hasOwnProperty(histogramEntry.date)) { dateMap[histogramEntry.date] = []; }
      dateMap[histogramEntry.date].push(histogramEntry);
    });
    otherEvolution.data.forEach(function(histogramEntry) {
      if (!dateMap.hasOwnProperty(histogramEntry.date)) { dateMap[histogramEntry.date] = []; }
      dateMap[histogramEntry.date].push(histogramEntry);
    });
    var data = Object.keys(dateMap).sort().map(function(date) {
      var entries = dateMap[date];
      var histogram = entries[0].histogram.map(function(count) { return 0; });
      entries.forEach(function(entry) { // go through each histogram entry and combine histograms
        entry.histogram.forEach(function(count, i) { histogram[i] += count; });
      });
      return {
        date: date,
        count: entries.reduce(function(previous, entry) { return previous + entry.count }, 0),
        sum: entries.reduce(function(previous, entry) { return previous + entry.sum }, 0),
        label: entries[0].label,
        histogram: histogram,
      };
    });
    return new Telemetry.Evolution(this.buckets, data, this.kind, this.description, this.measure);
  };

  Evolution.prototype.sanitized = function() {
    var maxSubmissions = 0;
    this.data.forEach(function(entry) {
      if (entry.count > maxSubmissions) { maxSubmissions = entry.count; }
    });
    var submissionsCutoff = Math.max(maxSubmissions / 100, 100);
    var timeCutoff = new Date;
    timeCutoff.setDate(timeCutoff.getDate() + 100); // Set time cutoff to 100 days in the future
    var data = this.data.filter(function(entry) {
      assert(entry.date.length === 8, "Invalid date string");
      var YYYY = entry.date.substring(0, 4), MM = entry.date.substring(4, 6), DD = entry.date.substring(6, 8);
      var date = new Date(YYYY + "-" + MM + "-" + DD);
      return entry.count >= submissionsCutoff && date <= timeCutoff;
    });
    if (data.length === 0) { return null; }
    return new Telemetry.Evolution(this.buckets, data, this.kind, this.description, this.measure);
  }

  Evolution.prototype.dateRange = function(startDate, endDate) {
    assert(startDate.getTime, "`startDate` must be a date");
    assert(endDate.getTime, "`endDate` must be a date");
    var data = this.data.filter(function(entry) {
      assert(entry.date.length === 8, "Invalid date string");
      var YYYY = entry.date.substring(0, 4), MM = entry.date.substring(4, 6), DD = entry.date.substring(6, 8);
      var date = new Date(YYYY + "-" + MM + "-" + DD);
      return startDate <= date && date <= endDate;
    });
    if (data.length === 0) { return null; }
    return new Telemetry.Evolution(this.buckets, data, this.kind, this.description, this.measure);
  };

  Evolution.prototype.histogram = function() {
    var submissions = this.data.reduce(function(submissions, entry) { return submissions + entry.count; }, 0);
    var sum = this.data.reduce(function(sum, entry) { return sum + entry.sum; }, 0);
    var values = this.data.reduce(function(values, entry) {
      entry.histogram.forEach(function(count, i) { values[i] = (values[i] || 0) + count; });
      return values;
    }, []);

    return new Telemetry.Histogram(this.buckets, values, this.kind, submissions, sum, this.description, this.measure);
  };

  Evolution.prototype.map = function(callback) {
    var evolution = this;
    return this.data.sort(function(a, b) { return parseInt(a.date) - parseInt(b.date); })
      .map(function(entry, i) {
      var histogram = new Telemetry.Histogram(evolution.buckets, entry.histogram, evolution.kind, entry.count, entry.sum, evolution.description, evolution.measure);

      assert(entry.date.length === 8, "Invalid date string");
      var YYYY = entry.date.substring(0, 4), MM = entry.date.substring(4, 6), DD = entry.date.substring(6, 8);
      var date = new Date(YYYY + "-" + MM + "-" + DD);

      return callback.call(evolution, histogram, i, date);
    });
  };

  Evolution.prototype.means = function() {
    return this.map(function(histogram, i) { return histogram.mean(); });
  };

  Evolution.prototype.percentiles = function(percentile) {
    return this.map(function(histogram, i) { return histogram.percentile(percentile); });
  };

  Evolution.prototype.submissions = function() {
    return this.map(function(histogram, i) { return histogram.submissions; });
  };

  return Evolution;
})();

Telemetry.getJSON = function(url, callback) {
  assert(typeof url === "string", "`url` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  if (Telemetry.CACHE[url] !== undefined) {
    if (Telemetry.CACHE[url] !== null && Telemetry.CACHE[url]._loading) { // Requested but not yet loaded
      var xhr = Telemetry.CACHE[url];
      var originalLoadCallback = xhr.onload, originalErrorCallback = xhr.onerror;
      xhr.onload = function() {
        if (this.status !== 200) { callback(null, this.status); }
        else { callback(JSON.parse(this.responseText), null); }
        originalLoadCallback.call(this);
      };
      xhr.onerror = function() {
        callback(null, this.status);
        originalErrorCallback.call(this);
      };
      return;
    } else if ((new Date).getTime() - Telemetry.CACHE_LAST_UPDATED[url] < Telemetry.CACHE_TIMEOUT) { // In cache and hasn't expired
      setTimeout(function() { callback(Telemetry.CACHE[url], Telemetry.CACHE[url] === null ? 404 : null); }, 1);
      return;
    }
  }

  var xhr = new XMLHttpRequest();
  xhr._loading = true;
  Telemetry.CACHE[url] = xhr; // Mark the URL as being requested but not yet loaded
  xhr.onload = function() {
    if (this.status !== 200) {
      if (this.status === 404) { // Cache the null result if the URL resolves to a resource or missing resource
        Telemetry.CACHE[url] = null; Telemetry.CACHE_LAST_UPDATED[url] = (new Date).getTime();
      } else { // Result was invalid, remove the current request from the cache
        delete Telemetry.CACHE[url];
      }
      callback(null, this.status);
    } else { // Request was successful
      var result = JSON.parse(this.responseText);
      Telemetry.CACHE[url] = result; Telemetry.CACHE_LAST_UPDATED[url] = (new Date).getTime();
      callback(result, this.status);
    }
  };
  xhr.onerror = function() { // Network-level error, notify the callback
    delete Telemetry.CACHE[url];
    callback(null, this.status);
  };
  xhr.open("get", url, true);
  xhr.send();
}

Telemetry.init = function Telemetry_init(callback) {
  assert(typeof callback === "function", "`callback` must be a function");
  Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/", function(channels) {
    var loadedChannels = 0, expectedChannels = channels.length * 2;
    Telemetry.CHANNEL_VERSION_BUILDIDS = {};
    Telemetry.CHANNEL_VERSION_DATES = {};
    channels.forEach(function(channel, i) {
      var versionBuildIds = Telemetry.CHANNEL_VERSION_BUILDIDS[channel] = {};
      Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/build_id/channels/" + channel + "/dates/", function(buildIdEntries) {
        buildIdEntries.forEach(function(entry) {
          if (!versionBuildIds.hasOwnProperty(entry.version)) { versionBuildIds[entry.version] = []; }
          versionBuildIds[entry.version].push(entry.date);
        })
        loadedChannels ++; // Loaded another channel's dates
        if (loadedChannels == expectedChannels) { callback(); } // This is the last channel that needs to be loaded
      });

      var versionDates = Telemetry.CHANNEL_VERSION_DATES[channel] = {};
      Telemetry.getJSON(Telemetry.BASE_URL + "aggregates_by/submission_date/channels/" + channel + "/dates/", function(dateEntries) {
        dateEntries.forEach(function(entry) {
          if (!versionDates.hasOwnProperty(entry.version)) { versionDates[entry.version] = []; }
          versionDates[entry.version].push(entry.date);
        })
        loadedChannels ++; // Loaded another channel's dates
        if (loadedChannels == expectedChannels) { callback(); } // This is the last channel that needs to be loaded
      });
    });
  });
}

Telemetry.getHistogramInfo = function Telemetry_getHistogramInfo(channel, version, metric, useSubmissionDate, callback) {
  assert(Telemetry.CHANNEL_VERSION_DATES !== null && Telemetry.CHANNEL_VERSION_BUILDIDS !== null, "Telemetry.js must be initialized before use");
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof metric === "string", "`metric` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  var dates = (useSubmissionDate ? Telemetry.CHANNEL_VERSION_DATES : Telemetry.CHANNEL_VERSION_BUILDIDS)[channel][version];
  var buildDate = dates[0];
  var url = Telemetry.BASE_URL + "aggregates_by/" + (useSubmissionDate ? "submission_date" : "build_id") +
    "/channels/" + encodeURIComponent(channel) + "/?version=" + encodeURIComponent(version) + "&dates=" + buildDate +
    "&metric=" + encodeURIComponent(metric);
  Telemetry.getJSON(url, function(histograms, status) {
    if (histograms === null) {
      callback(null, null, null, dates);
    } else {
      callback(histograms.kind, histograms.description, histograms.buckets, dates);
    }
  });
}

Telemetry.getEvolution = function Telemetry_getEvolution(channel, version, metric, filters, useSubmissionDate, callback) {
  assert(Telemetry.CHANNEL_VERSION_DATES !== null && Telemetry.CHANNEL_VERSION_BUILDIDS !== null, "Telemetry.js must be initialized before use");
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof metric === "string", "`metric` must be a string");
  assert(typeof filters === "object", "`filters` must be an object");
  assert(typeof callback === "function", "`callback` must be a function");
  var dates = (useSubmissionDate ? Telemetry.CHANNEL_VERSION_DATES : Telemetry.CHANNEL_VERSION_BUILDIDS)[channel][version].join(",");
  var filterString = "";
  Object.keys(filters).sort().forEach(function(filterName) { // we need to sort the keys in order to make sure the same filters result in the same URL each time, for caching
    filterString += "&" + encodeURIComponent(filterName) + "=" + encodeURIComponent(filters[filterName]);
  });
  var url = Telemetry.BASE_URL + "aggregates_by/" + (useSubmissionDate ? "submission_date" : "build_id") +
    "/channels/" + encodeURIComponent(channel) + "/?version=" + encodeURIComponent(version) + "&dates=" +
    encodeURIComponent(dates) + "&metric=" + encodeURIComponent(metric) + filterString;
  Telemetry.getJSON(url, function(histograms, status) {
    if (histograms === null) {
      assert(status === 404, "Could not obtain evolution: status " + status + " (" + url + ")"); // Only allow null evolution if it is 404 - if there is no evolution for the given filters
      callback({});
    } else {
      var entriesMap = {}; // Mapping from entry labels to a list of entries having that label
      histograms.data.forEach(function(entry) {
        if (!entriesMap.hasOwnProperty(entry.label)) { entriesMap[entry.label] = []; }
        entriesMap[entry.label].push(entry);
      });
      var evolutionMap = {}; // Mapping from labels to evolutions for those labels
      for (var label in entriesMap) {
        evolutionMap[label] = new Telemetry.Evolution(histograms.buckets, entriesMap[label], histograms.kind, histograms.description, metric);
      };
      callback(evolutionMap);
    }
  });
}

Telemetry.getFilterOptions = function Telemetry_getFilterOptions(channel, version, callback) {
  assert(typeof channel === "string", "`channel` must be a string");
  assert(typeof version === "string", "`version` must be a string");
  assert(typeof callback === "function", "`callback` must be a function");
  var url = Telemetry.BASE_URL + "filters/?channel=" + encodeURIComponent(channel) + "&version=" + encodeURIComponent(version);
  Telemetry.getJSON(url, function(filterOptions, status) {
    if (filterOptions === null) {
      assert(status === 404, "Could not obtain filter options: status " + status + " (" + url + ")"); // Only allow null filter options if it is 404 - if there are no filters
      callback({});
    } else {
      filterOptions["metric"] = filterOptions["metric"].filter(function(measure) {
        return !/^STARTUP_/.test(measure); // Ignore STARTUP_* histograms since nobody ever uses them
      });
      callback(filterOptions);
    }
  });
}

Telemetry.getVersions = function Telemetry_getVersions(fromVersion, toVersion) { // shim function
  assert(Telemetry.CHANNEL_VERSION_DATES !== null && Telemetry.CHANNEL_VERSION_BUILDIDS !== null, "Telemetry.js must be initialized before use");
  assert((fromVersion === undefined && toVersion === undefined) || (typeof fromVersion === "string" && typeof toVersion === "string"), "`fromVersion` and `toVersion` must be strings");
  var versions = [];
  for (var channel in Telemetry.CHANNEL_VERSION_DATES) {
    for (var version in Telemetry.CHANNEL_VERSION_DATES[channel]) {
      // Only output a channel/version if it is in both the buildID versions and the submission date versions (sometimes there is invalid data where a version is in submission date versions but not buildID versions, see https://bugzilla.mozilla.org/show_bug.cgi?id=1189727)
      if (Telemetry.CHANNEL_VERSION_BUILDIDS[channel] && Telemetry.CHANNEL_VERSION_BUILDIDS[channel][version]) {
        versions.push(channel + "/" + version);
      }
    }
  }
  versions.sort();
  return fromVersion !== undefined ? versions.filter(function(version) { return fromVersion <= version && version <= toVersion }) : versions;
}

exports.Telemetry = Telemetry;
return Telemetry;
})(this);
