(function(exports){

"use strict";

/** Namespace for this module, this will be exported into the global scope. */
var Telemetry = {};

// Data folder from which data will be loaded, another level indicating current
// folder will be initialized by Telemetry.init()
var _data_folder = 'https://s3-us-west-2.amazonaws.com/telemetry-dashboard/v3';

// Map from channel/version to data prefix, loaded by Telemetry.init()
var _dataFolderMap = null;

// List of versions present in _dataFolderMap
var _versions = null;

/*! Auxiliary function to GET files from _data_folder */
function _get(path, cb) {
  // Check that we've been initialized
  if(!_versions && path != "versions.json") {
    throw new Error("Telemetry._get: Telemetry module haven't been " +
                    "initialized, please call Telemetry.init()");
  }

  // Create path from array, if that's what we're giving
  if (path instanceof Array) {
    path = path.join("/");
  }

  // Create HTTP request
  var xhr = new XMLHttpRequest();
  xhr.onload = function (e) {
    if (e.target.status == 200) {
      cb.apply(this, [JSON.parse(this.responseText)]);
    } else {
      console.log("Telemetry._get: Failed loading " + path + " with " +
                  e.target.status);
    }
  };
  xhr.open("get", _data_folder + "/" + path, true);
  xhr.send();
}

/**
 * Initialize telemetry module by fetching meta-data from server, `cb()` will be
 * invoked when Telemetry module is ready for use.
 *
 * You cannot use any of the methods in the `Telemetry` module before you have
 * initialized the module with this function.
 *
 * @param {Function}  cb      Callback to be invoked after loading
 */
Telemetry.init = function Telemetry_load(cb) {
  // Get map from channels/version to data folders from versions.json
  _get("versions.json", function(data) {
    _dataFolderMap = data;
    _versions = Object.keys(data).sort();
    cb();
  });
};

/**
 * Get list of channel, version combinations available. This function returns
 * a list of strings on the form `'<channel>/<version>'`.
 *
 * **Example:**
 *
 *         ['release/24', 'release/25', 'release/26', ..., 'nightly/28']
 *
 * The strings returned here can be passed to `Telemetry.measures()` in order
 * to get a list of measures available for the specific channel and version.
 */
Telemetry.versions = function Telemetry_versions() {
  if (_versions === null) {
    throw new Error("Telemetry.versions: Telemetry module isn't initialized!");
  }
  return _versions;
};

/**
 * Request measures available for a given `'<channel>/<version>'` string. The
 * `'<channel>/<version>'` must originate from the list returned by
 * `Telemetry.versions()`. Once the measures have been loaded the callback `cb`
 * will be invoked as `cb(measures)` where `measures` a dictionary on the
 * following form:
 *
 *         {
 *            "A_TELEMETRY_MEASURE_ID": {
 *              kind:         "linear|exponential|flag|enumerated|boolean",
 *              description:  "A human readable description"
 *            },
 *            ...
 *          }
 * 
 * @param {String}    channel_version   Channel/version string
 * @param {Function}  cb                Callback to be invoked with result
 */
Telemetry.measures = function Telemetry_measures(channel_version, cb) {
  var data_folder = _dataFolderMap[channel_version];
  _get([data_folder, "histograms.json"], function(data) {
    var measures = {};

    // For each measure fetched
    for(var measure in data) {
      // Add measure id
      measures[measure] = {
        kind:         data[measure].kind,
        description:  data[measure].description
      }
    }

    // Return measures by callback
    cb(measures);
  });
};

/**
 * Request HistogramEvolution instance over builds for a given channel/version
 * and measure, once fetched cb(histogramEvolution) will be invoked with the 
 * HistogramEvolution instance. The dates in the HistogramEvolution instance
 * fetched will be build dates, not telemetry ping submission dates.
 * Note, measure must be a valid measure identifier from Telemetry.measures()
 */
Telemetry.loadEvolutionOverBuilds =
      function Telemetry_loadEvolutionOverBuilds(channel_version, measure, cb) {
  // Number of files to load, and what to do when done
  var load_count = 3;
  var data, filter_tree, specifications;
  function count_down() {
    load_count--;
    if (load_count === 0) {
      cb(
        new Telemetry.HistogramEvolution(
          measure,
          [measure],
          data,
          filter_tree,
          specifications[measure]
        )
      );
    }
  }
  // Find data folder for given channel/version
  var data_folder = _dataFolderMap[channel_version];
  // Load data for measure
  _get([data_folder, measure + "-by-build-date.json"], function(json) {
    data = json;
    count_down();
  });
  // Load filter data
  _get([data_folder, "filter-tree.json"], function(json) {
    filter_tree = json;
    count_down();
  });
  // Load histogram specifications
  _get([data_folder, "histograms.json"], function(json) {
    specifications = json;
    count_down();
  });
};

/**
 * Request HistogramEvolution instance over time for a given channel/version
 * and measure, once fetched cb(histogramEvolution) will be invoked with the
 * HistogramEvolution instance. The dates in the HistogramEvolution instance
 * fetched will be telemetry ping submission dates.
 * Note, measure must be a valid measure identifier from Telemetry.measures()
 */
 Telemetry.loadEvolutionOverTime =
        function Telemetry_loadEvolutionOverTime(channel_version, measure, cb) {
  // Number of files to load, and what to do when done
  var load_count = 3;
  var data, filter_tree, specifications;
  function count_down() {
    load_count--;
    if (load_count === 0) {
      cb(
        new Telemetry.HistogramEvolution(
          measure,
          [measure],
          data,
          filter_tree,
          specifications[measure]
        )
      );
    }
  }
  // Find data folder for given channel/version
  var data_folder = _dataFolderMap[channel_version];
  // Load data for measure
  _get([data_folder, measure + "-by-submission-date.json"], function(json) {
    data = json;
    count_down();
  });
  // Load filter data
  _get([data_folder, "filter-tree.json"], function(json) {
    filter_tree = json;
    count_down();
  });
  // Load histogram specifications
  _get([data_folder, "histograms.json"], function(json) {
    specifications = json;
    count_down();
  });
};

/*! Auxiliary function to find all filter_ids in a filter_tree */
function _listFilterIds(filter_tree){
  var ids = [];
  function visitFilterNode(filter_node){
    ids.push(filter_node._id);
    for (var key in filter_node) {
      if (key != "name" && key != "_id") {
        visitFilterNode(filter_node[key]);
      }
    }
  }
  visitFilterNode(filter_tree);
  return ids;
}

// Offset relative to length for special elements in arrays of raw data
var DataOffsets = {
  SUM:            -7,   // The following keys are documented in StorageFormat.md
  LOG_SUM:        -6,   // See the docs/ folder of the telemetry-server
  LOG_SUM_SQ:     -5,   // Repository. They are essentially part of the
  SUM_SQ_LO:      -4,   // validated telemetry histogram format
  SUM_SQ_HI:      -3,
  SUBMISSIONS:    -2,   // Added in deashboard.py
  FILTER_ID:      -1    // Added in results2disk.py
};

/** Representation of histogram under possible filter application */
Telemetry.Histogram = (function(){

/*!
 * Auxiliary function to aggregate values of index from histogram dataset
 */
function _aggregate(index, histogram) {
  if (histogram._aggregated === undefined) {
    histogram._aggregated = [];
  }
  var sum = histogram._aggregated[index];
  if (sum === undefined) {
    // Cache the list of filter ids
    if (histogram._filterIds === undefined) {
      histogram._filterIds = _listFilterIds(histogram._filter_tree);
    }
    // Aggregate index as sum over histogram
    sum = 0;
    var n = histogram._dataset.length;
    for(var i = 0; i < n; i++) {
      var data_array = histogram._dataset[i];

      // Check if filter_id is filtered
      var filter_id_offset = data_array.length + DataOffsets.FILTER_ID;
      if (histogram._filterIds.indexOf(data_array[filter_id_offset]) != -1) {
        sum += data_array[index >= 0 ? index : data_array.length + index];
      }
    }
    histogram._aggregated[index] = sum;
  }
  return sum;
}

/*! Auxiliary function for estimating the end of the last bucket */
function _estimateLastBucketEnd(histogram) {
  // As there is no next bucket for the last bucket, we sometimes need to
  // estimate one. First we estimate the sum of all data-points in buckets
  // below the last bucket
  var sum_before_last = 0;
  var n = histogram._buckets.length;
  for (var i = 0; i < n - 1; i++) {
    var bucket_center = (histogram._buckets[i+1] - histogram._buckets[i]) / 2 +
                         histogram._buckets[i];
    sum_before_last += _aggregate(i, histogram) * bucket_center;
  }
  // We estimate the sum of data-points in the last bucket by subtracting the
  // estimate of sum of data-points before the last bucket...
  var sum_last = _aggregate(DataOffsets.SUM, histogram) - sum_before_last;
  // We estimate the mean of the last bucket as follows
  var last_bucket_mean = sum_last / _aggregate(n - 1, histogram);
  // We find the start of the last bucket
  var last_bucket_start = histogram._buckets[n - 1];
  // Now estimate the last bucket end
  return last_bucket_start + (last_bucket_mean - last_bucket_start) * 2;
}

/*!
 * Create a new histogram, where
 *  - measure       is the name of the histogram,
 *  - filter_path   is a list of [name, date-range, filter1, filter2...]
 *  - buckets       is a list of bucket start values,
 *  - dataset       is a mapping from filter ids to arrays of raw data
 *  - filter_tree   is a node in filter tree structure, and
 *  - spec          is the histogram specification.
 */
function Histogram(measure, filter_path, buckets, dataset, filter_tree, spec) {
  this._measure     = measure;
  this._filter_path = filter_path;
  this._buckets     = buckets;
  this._dataset     = dataset;
  this._filter_tree = filter_tree;
  this._spec        = spec;
}

/** Get new histogram representation of this histogram filter for option */
Histogram.prototype.filter = function Histogram_filter(option) {
  if (!(this._filter_tree[option] instanceof Object)) {
    throw new Error("filter option: \"" + option +"\" is not available");
  }
  return new Histogram(
    this._measure,
    this._filter_path.concat(option),
    this._buckets,
    this._dataset,
    this._filter_tree[option],
    this._spec
  );
};

/** Name of filter available, null if none */
Histogram.prototype.filterName = function Histogram_filterName() {
  return this._filter_tree.name || null;
};

/** List of options available for current filter */
Histogram.prototype.filterOptions = function Histogram_filterOptions() {
  var options = [];
  for (var key in this._filter_tree) {
    if (key != "name" && key != "_id") {
      options.push(key);
    }
  }
  return options.sort();
};

/** Get the histogram measure */
Histogram.prototype.measure = function Histogram_measure() {
  return this._measure;
};

/** Get the histogram kind */
Histogram.prototype.kind = function Histogram_kind() {
  return this._spec.kind;
};

/** Get a description of the measure in this histogram */
Histogram.prototype.description = function Histogram_description() {
  return this._spec.description;
};

/** Get number of data points in this histogram */
Histogram.prototype.count = function Histogram_count() {
  var count = 0;
  var n = this._buckets.length;
  for(var i = 0; i < n; i++) {
    count += _aggregate(i, this);
  }
  return count;
};

/** Number of telemetry pings aggregated in this histogram */
Histogram.prototype.submissions = function Histogram_submissions() {
  return _aggregate(DataOffsets.SUBMISSIONS, this);
};

/** Get the mean of all data points in this histogram, null if N/A */
Histogram.prototype.mean = function Histogram_mean() {
  // if (this.kind() != "linear" && this.kind() != "exponential") {
  //   throw new Error("Histogram.geometricMean() is only available for " +
  //                   "linear and exponential histograms");
  // }
  var sum = _aggregate(DataOffsets.SUM, this);
  return sum / this.count();
};

/** Get the geometric mean of all data points in this histogram, null if N/A */
Histogram.prototype.geometricMean = function Histogram_geometricMean() {
  if (this.kind() != "exponential") {
    throw new Error("Histogram.geometricMean() is only available for " +
                    "exponential histograms");
  }
  var log_sum = _aggregate(DataOffsets.LOG_SUM, this);
  return log_sum / this.count();
};

/**
 * Get the standard deviation over all data points in this histogram,
 * null if not applicable as this is only available for some histograms.
 */
Histogram.prototype.standardDeviation = function Histogram_standardDeviation() {
  if (this.kind() != "linear") {
    throw new Error("Histogram.standardDeviation() is only available for " +
                    "linear histograms");
  }
  var sum       = new Big(_aggregate(DataOffsets.SUM, this));
  var count     = new Big(this.count());
  var sum_sq_hi = new Big(_aggregate(DataOffsets.SUM_SQ_HI, this));
  var sum_sq_lo = new Big(_aggregate(DataOffsets.SUM_SQ_LO, this));
  var sum_sq    = sum_sq_lo.plus(sum_sq_hi.times(new Big(2).pow(32)));

  // std. dev. = sqrt(count * sum_squares - sum * sum) / count
  // http://en.wikipedia.org/wiki/Standard_deviation#Rapid_calculation_methods
  return count.times(sum_sq).minus(sum.pow(2)).divide(count).toFixed(3);
};

/**
 * Get the geometric standard deviation over all data points in this histogram,
 * null if not applicable as this is only available for some histograms.
 */
Histogram.prototype.geometricStandardDeviation =
                              function Histogram_geometricStandardDeviation() {
  if (this.kind() != 'exponential') {
    throw new Error(
      "Histogram.geometricStandardDeviation() is only " +
      "available for exponential histograms"
    );
  }
  var count       = this.count();
  var log_sum     = _aggregate(DataOffsets.LOG_SUM, this);
  var log_sum_sq  = _aggregate(DataOffsets.LOG_SUM_SQ, this);

  // Deduced from http://en.wikipedia.org/wiki/Geometric_standard_deviation
  // using wxmaxima... who knows maybe it's correct...
  return Math.exp(
    Math.sqrt(
      (
        count * Math.pow(Math.log(log_sum / count), 2) +
        log_sum_sq -
        2 * log_sum * Math.log(log_sum / count)
      ) / count
    )
  );
};

/** Estimate value of a percentile */
Histogram.prototype.percentile = function Histogram_percentile(percent) {
  // if (this.kind() != "linear" && this.kind() != "exponential") {
  //   throw new Error("Histogram.percentile() is only available for linear " +
  //                   "and exponential histograms");
  // }

  var frac  = percent / 100;
  var count = this.count();

  // Count until we have the bucket containing the percentile
  var to_count = count * frac;
  var i, n = this._buckets.length;
  for (i = 0; i < n; i++) {
    var nb_points = _aggregate(i, this);
    if (to_count - nb_points <= 0) {
      break;
    }
    to_count -= nb_points;
  }

  // Bucket start and end
  var start = this._buckets[i];
  var end   = this._buckets[i+1];
  if(i >= n - 1) {
    // If we're at the end bucket, then there's no next bucket, hence, no upper
    // bound, so we estimate one.
    end = _estimateLastBucketEnd(this);
  }

  // Fraction indicating where in bucket i the percentile is located
  var bucket_fraction = to_count / (_aggregate(i, this) + 1);

  if (this.kind() == "exponential") {
    // Interpolate median assuming an exponential distribution
    return start + Math.exp(Math.log(end - start) * bucket_fraction);
  }

  // Interpolate median assuming a uniform distribution between start and end.
  return start + (end - start) * bucket_fraction;
};

/** Estimate the median, returns null, if not applicable */
Histogram.prototype.median = function Histogram_median() {
  return this.percentile(50);
};

/**
 * Invoke cb(count, start, end, index) for every bucket in this histogram, the
 * cb is invoked for each bucket ordered from low to high.
 * Note, if context is provided it will be given as this parameter to cb().
 */
Histogram.prototype.each = function Histogram_each(cb, context) {
  // Set context if none is provided
  if (context === undefined) {
    context = this;
  }

  // For each bucket
  var n = this._buckets.length;
  for(var i = 0; i < n; i++) {

    // Find count, start and end of bucket
    var count = _aggregate(i, this),
        start = this._buckets[i],
        end   = this._buckets[i+1];

    // If we're at the last bucket, then there's no next upper bound so we
    // estimate one
    if (i >= n - 1) {
      end = _estimateLastBucketEnd(this);
    }

    // Invoke callback as promised
    cb.call(context, count, start, end, i);
  }
};

/**
 * Returns a bucket ordered array of results from invocation of 
 * cb(count, start, end, index) for each bucket, ordered low to high.
 * Note, if context is provided it will be given as this parameter to cb().
 */
Histogram.prototype.map = function Histogram_map(cb, context) {
  // Set context if none is provided
  if (context === undefined) {
    context = this;
  }

  // Array of return values
  var results = [];

  // For each, invoke cb and push the result
  this.each(function(count, start, end, index) {
    results.push(cb.call(context, count, start, end, index));
  });

  // Return values from cb
  return results;
};

return Histogram;

})();

/** Representation of histogram changes over time  */
Telemetry.HistogramEvolution = (function(){

/*! Auxiliary function to parse a date string from JSON data format */
function _parseDateString(d) {
  return new Date(d.substr(0,4) + "/" + d.substr(4,2) + "/"+ d.substr(6,2));
}

/*!
 * Auxiliary function to compute all bucket ends from a specification
 * This returns a list [b0, b1, ..., bn] where b0 is the separator value between
 * entries in bucket index 0 and bucket index 1. Such that all values less than
 * b0 was counted in bucket 0, values greater than counted in bucket 1.
 */
function _computeBuckets(spec){
  // Find bounds from specification
  var low = 1, high, nbuckets;
  if(spec.kind == 'boolean' || spec.kind == 'flag') {
    // This is how boolean bucket indexes are generated in mozilla-central we
    // might look into whether or not there is a bug, as it seems rather weird
    // that boolean histograms have 3 buckets.
    high      = 2;
    nbuckets  = 3;
  } else if (spec.kind == 'enumerated') {
    high      = eval(spec.n_values);
    nbuckets  = eval(spec.n_values) + 1;
  } else if (spec.kind == 'linear' || spec.kind == 'exponential') {
    low       = eval(spec.low) || 1;
    high      = eval(spec.high);
    nbuckets  = eval(spec.n_buckets)
  }
  // Compute buckets
  var buckets = null;
  if(spec.kind == 'exponential') {
    // Exponential buckets is a special case
    var log_max = Math.log(high);
    buckets = [0, low];
    var current = low;
    for(var i = 2; i < nbuckets; i++) {
      var log_current = Math.log(current);
      var log_ratio   = (log_max - log_current) / (nbuckets - i);
      var log_next    = log_current + log_ratio;
      var next_value  = Math.floor(Math.exp(log_next) + 0.5);
      if (next_value > current) {
        current = next_value;
      } else {
        current = current + 1;
      }
      buckets.push(current);
    }
  } else {
    // Linear buckets are computed as follows
    buckets = [0];
    for(var i = 1; i < nbuckets; i++) {
      var range = (low * (nbuckets - 1 - i) + high * (i - 1));
      buckets[i] = (Math.floor(range / (nbuckets - 2) + 0.5));
    }
  }
  return buckets;
}

/*!
 * Create a histogram evolution, where
 *  - measure       is the name of this histogram,
 *  - filter_path   is a list of [name, date-range, filter1, filter2...]
 *  - data          is the JSON data loaded from file,
 *  - filter_tree   is the filter_tree root, and
 *  - spec          is the histogram specification.
 */
function HistogramEvolution(measure, filter_path, data, filter_tree, spec) {
  this._measure     = measure
  this._filter_path = filter_path;
  this._data        = data;
  this._filter_tree = filter_tree;
  this._spec        = spec;
  this._buckets     = _computeBuckets(spec);
}

/** Get the histogram measure */
HistogramEvolution.prototype.measure = function HistogramEvolution_measure() {
  return this._measure;
};

/** Get the histogram kind */
HistogramEvolution.prototype.kind = function HistogramEvolution_kind() {
  return this._spec.kind;
};

/** Get a description of the measure in this histogram */
HistogramEvolution.prototype.description =
                                    function HistogramEvolution_description() {
  return this._spec.description;
};

/** Get new HistogramEvolution representation filtered with option */
HistogramEvolution.prototype.filter = function histogramEvolution_filter(opt) {
  if (!(this._filter_tree[opt] instanceof Object)) {
    throw new Error("filter option: \"" + opt +"\" is not available");
  }
  return new HistogramEvolution(
    this._measure,
    this._filter_path.concat(opt),
    this._data,
    this._filter_tree[opt],
    this._spec
  );
};

/** Name of filter available, null if none */
HistogramEvolution.prototype.filterName =
                                      function HistogramEvolution_filterName() {
  return this._filter_tree.name || null;
};

/** List of options available for current filter */
HistogramEvolution.prototype.filterOptions =
                                  function HistogramEvolution_filterOptions() {
  var options = [];
  for (var key in this._filter_tree) {
    if (key != "name" && key != "_id") {
      options.push(key);
    }
  }
  return options.sort();
};

/**
 * Get merged histogram for the interval [start; end], ie. start and end dates
 * are inclusive. Omitting start and/or end will give you the merged histogram
 * for the open-ended interval.
 */
HistogramEvolution.prototype.range =
                                function HistogramEvolution_range(start, end) {
  // Construct a dataset by merging all datasets/histograms in the range
  var merged_dataset = [];

  // List of filter_ids we care about, instead of just merging all filters
  var filter_ids = _listFilterIds(this._filter_tree);

  // For each date we have to merge the filter_ids into merged_dataset
  for (var datekey in this._data) {

    // Check that date is between start and end (if start and end is defined)
    var date = _parseDateString(datekey);
    if((!start || start <= date) && (!end || date <= end)) {

      // Find dataset of this datekey, merge filter_ids for this dataset into
      // merged_dataset.
      var dataset = this._data[datekey];

      // Copy all data arrays over... we'll filter and aggregate later
      merged_dataset = merged_dataset.concat(dataset);
    }
  }

  // Create merged histogram
  return new Telemetry.Histogram(
    this._measure,
    this._filter_path,
    this._buckets,
    merged_dataset,
    this._filter_tree,
    this._spec
  );
};

/** Get the list of dates in the evolution sorted by date */
HistogramEvolution.prototype.dates = function HistogramEvolution_dates() {
  var dates = [];
  for(var date in this._data) {
    dates.push(_parseDateString(date));
  }
  return dates.sort();
};

/**
 * Invoke cb(date, histogram, index) with each date, histogram pair, ordered by
 * date. Note, if provided cb() will be invoked with ctx as this argument.
 */
HistogramEvolution.prototype.each = function HistogramEvolution_each(cb, ctx) {
  // Set this as context if none is provided
  if (ctx === undefined) {
    ctx = this;
  }

  // Find and sort all date strings
  var dates = [];
  for(var date in this._data) {
    dates.push(date);
  }
  dates.sort();

  // Find filter ids
  var filterIds = _listFilterIds(this._filter_tree);

  // Auxiliary function to filter data arrays by filter_id
  function filterByFilterId(data_array) {
      var filterId = data_array[data_array.length + DataOffsets.FILTER_ID];
      return filterIds.indexOf(filterId) != -1;
  }

  // Pair index, this is not equal to i as we may have filtered something out
  var index = 0;

  // Now invoke cb with each histogram
  var n = dates.length;
  for(var i = 0; i < n; i++) {
    // Get dataset for date
    var dataset = this._data[dates[i]];

    // Filter for data_arrays with relevant filterId
    dataset = dataset.filter(filterByFilterId);

    // Skip this date if there was not data_array after filtering as applied
    if (dataset.length === 0) {
      continue;
    }

    // Invoke callback with date and histogram
    cb.call(
      ctx,
      _parseDateString(dates[i]),
      new Telemetry.Histogram(
        this._measure,
        this._filter_path,
        this._buckets,
        dataset,
        this._filter_tree,
        this._spec
      ),
      index++
    );
  }
};

/**
 * Returns a date ordered array of results from invocation of 
 * cb(date, histogram, index) for each date, histogram pair.
 * Note, if provided cb() will be invoked with ctx as this argument.
 */
HistogramEvolution.prototype.map = function HistogramEvolution_map(cb, ctx) {
  // Set this as context if none is provided
  if (ctx === undefined) {
    ctx = this;
  }

  // Return value array
  var results = [];

  // For each date, histogram pair invoke cb() and add result to results
  this.each(function(date, histogram, index) {
    results.push(cb.call(ctx, date, histogram, index));
  });

  // Return array of computed values
  return results;
};

return HistogramEvolution;

})();

exports.Telemetry = Telemetry;
return exports.Telemetry;

})(this);
