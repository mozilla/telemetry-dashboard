Telemetry.js (v2)
=================

Telemetry.js is a Javascript library for accessing pipeline data from [Mozilla Telemetry](https://telemetry.mozilla.org/). This library powers the pipeline dashboards on Mozilla Telemetry.

Not familiar with Mozilla Telemetry? Check out this [high-level overview](https://anthony-zhang.me/blog/telemetry-demystified/).

The main purpose of this library is to provide access to the evolution of histograms over time and buildID, for various types of measures and various combinations of filters.

Setup
-----

### In the browser

Simply add this to your HTML:

    <script src="https://telemetry.mozilla.org/v2/telemetry.js"></script>

The global `Telemetry` object will now be available for use in subsequently executed Javascript code. The library also supports the CommonJS module format.

It is recommended that the library be imported directly from the URL above, to ensure that any API changes under the hood do not break the library.

### On the server

Check out [telemetry-next-node](https://www.npmjs.com/package/telemetry-next-node) - a wrapper around Telemetry.js that allows it to be used within the Node.js environment.

This module actually downloads and executes Telemetry.js upon initialization, to ensure that it always has the latest version.

Examples
--------

Getting versions in a range:

```javascript
Telemetry.init(function() {
    var versions = Telemetry.getVersions("nightly/40", "nightly/42");
    console.log("Versions between nightly 40 to nightly 42 (inclusive):\n" + versions.join("\n"));
});
```

Getting a list of measures:

```javascript
Telemetry.init(function() {
    Telemetry.getFilterOptions("nightly", "42", function(filterOptions) {
        console.log("Available measures:\n" + filterOptions.metric.join("\n"));
    });
});
```

Getting the dates for which there are submissions for GC_MS on nightly 42 on Windows:

```javascript
Telemetry.init(function() {
    Telemetry.getEvolution("nightly", "42", "GC_MS", {os: "Windows_NT"}, true, function(evolutionMap) {
        console.log("Available dates:\n" + evolutionMap[""].dates().join("\n"));
    });
});
```

Getting the overall median value of GC_MS on nightly 42 on Windows from July 19, 2015 to August 1, 2015:

```javascript
Telemetry.init(function() {
    Telemetry.getEvolution("nightly", "42", "GC_MS", {os: "Windows_NT"}, true, function(evolutionMap) {
        var evolution = evolutionMap[""].dateRange(new Date("2015-07-19"), new Date("2015-08-01"));
        var histogram = evolution.histogram();
        console.log("Median GC_MS: " + histogram.percentile(50));
    });
});
```

Getting the available keys in the keyed histogram JS_TELEMETRY_ADDON_EXCEPTIONS on nightly 42:

```javascript
Telemetry.init(function() {
    Telemetry.getEvolution("nightly", "42", "JS_TELEMETRY_ADDON_EXCEPTIONS", {}, true, function(evolutionMap) {
        console.log("JS_TELEMETRY_ADDON_EXCEPTIONS keys:\n" + Object.keys(evolutionMap).sort().join("\n"));
    });
});
```

API Reference
-------------

### `Telemetry.init(function callback() { ... })`

Initializes Telemetry.js with various pieces of metadata that are used by a lot of the other functionality in the library. When Telemetry.js is fully initialized, `callback` is called. Does not return anything.

**Note:** This needs to be called before using any functions of Telemetry.js! Code that uses Telemetry.js should either be in the callback, or guaranteed to execute after it completes.

### `Telemetry.getVersions([fromVersion, toVersion])`

Returns a list of channel/version combinations that have aggregates available. The return value is a list of strings of the form `CHANNEL/VERSION` (e.g., `nightly/42`).

If `fromVersion` and `toVersion` are not specified, all channel/version combinations will be returned. If they are specified, the resulting list will only contain versions that fall between `fromVersion` to `toVersion` (inclusive). Channel/version combinations are compared alphabetically.

### `Telemetry.getFilterOptions(channel, version, function callback(filterOptions) { ... })`

Retrieves a mapping `filterOptions` from filter names to arrays of filter options, for channel `channel` and version `version`. Calls `callback` with the mapping as its parameter. Does not return anything.

Each key in the mapping is the name of a filter we can filter by. Each value in the list associated with the key is a valid value that we can use as the filter's value. For example, `filterOptions` might be `{"metric":["GC_MS", "SIMPLE_MEASURES_FIRSTPAINT"],"e10sEnabled":["true","false"],"application":["Firefox","Fennec","Webapp Runtime","Firefox-Trunk"],"architecture":["x86-64","x86","arm"],"child":["false","true"],"os":["Windows_NT,6.3","Darwin,14.3.0","Windows_NT,6.1"]}`.

The `os` filter is a bit of a special case: it is actually the `os` filter and the `osVersion` filter combined. When actually doing filtering, `os` should be set to one of the first parts (e.g., `Windows_NT`), and `osVersion` should be set to one of the second parts (e.g., `6.1`).

An always up-to-date listing of the available filters can be found [here](https://github.com/vitillo/python_mozaggregator#api).

### `Telemetry.getHistogramInfo(channel, version, metric, useSubmissionDate, function callback(kind, description, buckets, dates) { ... })`

Retrieves various properties of histograms, for the measure `metric` in channel `channel` and version `version` with `filters` as the filters. Calls `callback` with the properties as parameters. Does not return anything.

### `Telemetry.getEvolution(channel, version, metric, filters, useSubmissionDate, function callback(evolutionMap) { ... })`

Retrieves a mapping from histogram keys to histogram evolutions for those keys, for the measure `metric` in channel `channel` and version `version` with `filters` as the filters. Calls `callback` with the mapping as its parameter. Does not return anything.

If `useSubmissionDate` is false, the evolutions will be over buildIDs - each date in the evolution will correspond to the date that the submitting products were built. Otherwise, the evolutions will be over submission dates - each date in the evolution will correspond to the date that the submitters actually submitted.

If `metric` is a keyed measure, each key in `evolutionMap` is a key in the keyed measure, and the associated evolution is for that particular key.

If `metric` is not a keyed measure, then the only key will be the empty string `""`, and associated evolution is for the entire measure.

The resulting mapping can be empty if there are no histograms available for the specified parameters.

### `Telemetry.Evolution`

Class used to represent a histogram evolution. Instances of this class can be obtained from `Telemetry.getEvolution(channel, version, metric, filters, useSubmissionDate, function callback(evolutionMap) { ... })`. This class should not be instantiated directly.

In the rest of this document, `someEvolutionInstance` and `someOtherEvolutionInstance` will refer to an arbitrary instances of `Telemetry.Evolution`.

### `someEvolutionInstance.kind`

Represents the type of data stored in `someEvolutionInstance`. Valid values include `boolean`, `linear`, and `exponential`.

### `someEvolutionInstance.description`

String description for `someEvolutionInstance`'s measure. For example, a histogram evolution for GC_MS might have this property set to `Time spent running JS GC (ms)`.

### `someEvolutionInstance.measure`

Name of `someEvolutionInstance`'s measure. For example, a histogram evolution for GC_MS might have this property set to `GC_MS`.

### `someEvolutionInstance.dates()`

Returns a list of dates in `someEvolutionInstance` for which there are submissions in the current histogram evolution. Dates are sorted from oldest to newest.

Dates do not have a timezone offset applied, and the time component is always midnight UTC.

### `someEvolutionInstance.combine(someOtherEvolutionInstance)`

Returns the result of combining `someEvolutionInstance` and `someOtherEvolutionInstance` into a single histogram evolution. None of the original histogram evolutions are modified.

Combining two evolution instances is equivalent to adding their histograms together for each date. Both evolutions must be of the same kind and have the same buckets.

This is useful for combining filteres evolutions - an evolution for nightly 42 GC_MS on Windows and an evolution for nightly 42 GC_MS on OS X can be combined to get an evolution for nightly 42 GC_MS on Windows and OS X.

### `someEvolutionInstance.sanitized()`

Returns `someEvolutionInstance` with cleaned up data. The original histogram evolution is not modified.

Sanitizing removes histograms with dates that are actually in the future (entries from the future are usually invalid data), as well as histograms that don't have a lot of submissions compared to the rest of the histograms.

Sanitizing is recommended whenever it is not strictly necessary to use raw data, since it results in cleaner, more meaningful evolutions.

### `someEvolutionInstance.dateRange(startDate, endDate)`

Returns the result of restricting `someEvolutionInstance` to dates between `Date` instances `startDate` and `endDate` inclusive. The original histogram evolution is not modified.

Retricting the dates of an evolution instance is equivalent to removing histograms in it for dates that fall outside of the specified range.

This is useful when combined with various other methods that work on all dates in an evolution instance. For example, using this with `someEvolutionInstance.histogram()` means that we can get an overall histogram for a particular range of dates.

### `someEvolutionInstance.histogram()`

Returns an overall histogram for `someEvolutionInstance` - a histogram created by adding up all the histograms within the histogram evolution.

This is useful when combined with various methods of the resulting histogram. For example, it is possible to get the overall percentiles for `someEvolutionInstance` by calling the percentile methods on the overall histogram for it.

### `someEvolutionInstance.map(function callback(histogram, i, date) { ... })`

Maps a function onto each histogram in `someEvolutionInstance` by date (oldest to newest), returning the return values of `callback` as a list. The histograms can be mutated within `callback`, but this will not affect `someEvolutionInstance`.

The current histogram (a `Telemetry.Histogram` instance), the index of iteration (0-based), and the date associated with the histogram (a `Date` instance), are passed to `callback` as parameters. Within `callback`, `this` refers to `someEvolutionInstance`.

### `someEvolutionInstance.means()`

Returns a list of mean values for each histogram in `someEvolutionInstance`, sorted by date (oldest to newest). Values are estimated, and are only guaranteed to be accurate to the nearest bucket.

This is provided as a convenience method to make it easy to plot summary statistics for histogram evolutions.

### `someEvolutionInstance.percentiles(percentile)`

Returns a list of `percentile`th percentile values for each histogram in `someEvolutionInstance`, sorted by date (oldest to newest). Values are estimated, and are only guaranteed to be accurate to the nearest bucket.

This is provided as a convenience method to make it easy to plot summary statistics for histogram evolutions.

### `someEvolutionInstance.submissions()`

Returns a list of submission counts for each histogram in `someEvolutionInstance`, sorted by date (oldest to newest).

This is provided as a convenience method to make it easy to plot summary statistics for histogram evolutions.

### `someEvolutionInstance.sampleCounts()`

Returns a list of sample counts for each histogram in `someEvolutionInstance`, sorted by date (oldest to newest).

This is provided as a convenience method to make it easy to plot summary statistics for histogram evolutions.

### `Telemetry.Histogram`

Class used to represent a histogram. Instances of this class can be obtained from `someEvolutionInstance.histogram()`. This class should not be instantiated directly.

In the rest of this document, `someHistogramInstance` will refer to an arbitrary instance of `Telemetry.Histogram`.

### `someHistogramInstance.count`

Total number of samples in `someHistogramInstance`. This value is equivalent to the sum of all the bucket counts.

### `someHistogramInstance.kind`

Represents the type data stored in `someHistogramInstance`. Valid values include `boolean`, `linear`, and `exponential`.

### `someHistogramInstance.submissions`

The number of submissions represented by the data in `someHistogramInstance`. Each submission may have multiple samples, so `someHistogramInstance.submissions` is always less or equal to `someHistogramInstance.count`.

### `someHistogramInstance.sum`

The sum of every sample's value in `someHistogramInstance`. While `someHistogramInstance.count` measures the total number of samples, `someHistogramInstance.sum` measures the total of the values of the samples.

### `someHistogramInstance.description`

String description for `someHistogramInstance`'s measure. For example, a histogram for GC_MS might have this property set to `Time spent running JS GC (ms)`.

### `someHistogramInstance.measure`

Name of `someHistogramInstance`'s measure. For example, a histogram for GC_MS might have this property set to `GC_MS`.

### `someHistogramInstance.mean()`

Returns the mean value of `someHistogramInstance`. This is an estimated value, and is only guaranteed to be accurate to the nearest bucket.

### `someHistogramInstance.percentiles(percentile)`

Returns the `percentile`th percentile for `someHistogramInstance`. This is an estimated value, and is only guaranteed to be accurate to the nearest bucket.

### `someHistogramInstance.map(function callback(count, start, end, i) { ... })`

Maps a function onto each bucket in `someHistogramInstance` from lowest to highest, returning the return values of `callback` as a list.

The current bucket count, the lower bound of the current bucket (inclusive), the upper bound of the current bucket (exclusive), and the index of iteration (0-based), are passed to `callback` as parameters. Within `callback`, `this` refers to `someHistogramInstance`.

The last bucket's upper bound is not explicitly stored, and is estimated based on the other buckets. The last bucket actually stores all values at or above its lower bound - it acts as an overflow bucket.
