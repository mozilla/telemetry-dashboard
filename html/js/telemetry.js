(function(exports){

"use strict";

/** Namespace for this module */
var Telemetry = {};

// Data folder from which data will be loaded, initialized by Telemetry.init()
var _data_folder = null;

// List of channel/version, loaded by Telemetry.init()
var _versions = null;

// Dictionary of histogram specifications, loaded by Telemetry.init()
var _specifications = null;

/** Auxiliary function to GET files from _data_folder */
function _get(path, cb) {
  // Check that we've been initialized
  if(_data_folder === null) {
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
  }
  xhr.open("get", _data_folder + "/" + path, true);
  xhr.send();
}

/**
 * Initialize telemetry module by fetching meta-data from data_folder
 * cb() will be invoked when Telemetry module is ready for use.
 */
Telemetry.init = function Telemetry_load(data_folder, cb) {
  if (_data_folder !== null) {
    throw new Error("Telemetry.init: Telemetry module is initialized!");
  }
  _data_folder = data_folder;

  // Number of files to load
  var load_count = 2;

  // Count down files loaded
  function count_down(){
    load_count--;
    if (load_count == 0) {
      cb();
    }
  }

  // Get list of channels/version in data folder from versions.json
  _get("versions.json", function(data) {
    _versions = data;
    count_down();
  });

  // Get list of histogram specifications from histogram_descriptions.json
  _get("Histograms.json", function(data) {
    _specifications = data;
    count_down();
  });
}

/** Get list of channel/version */
Telemetry.versions = function Telemetry_versions() {
  if (_data_folder === null) {
    throw new Error("Telemetry.versions: Telemetry module isn't initialized!");
  }
  return _versions;
}

/**
 * Invoke cb(list) with a list of measures available for the channel/version
 * given. Note, channel/version must be a string from Telemetry.versions()
 */
Telemetry.measures = function Telemetry_measures(channel_version, cb) {
  _get([channel_version, "histograms.json"], function(data) {
    var measures = [];
    for(var key in data) {
      measures.push(key);
    }
    measures.sort();
    cb(measures);
  });
}

/**
 * Invoke cb(histogramEvolution) with an instance of HistogramEvolution for the
 * given measure under channel/version.
 */
Telemetry.loadHistogram =
                function Telemetry_loadHistogram(channel_version, measure, cb) {
  var load_count = 2;
  var data, filter_tree;
  function count_down() {
    load_count--;
    if (load_count == 0) {
      cb(
        new Telemetry.HistogramEvolution(
          [measure],
          data,
          filter_tree,
          _specifications[measure]
        )
      );
    }
  }
  _get([channel_version, measure + ".json"], function(json) {
    data = json;
    count_down();
  });
  _get([channel_version, "filter.json"], function(json) {
    filter_tree = json;
    count_down();
  });
}

/** Auxiliary function to find all filter_ids in a filter_tree */
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

/** Representation of histogram under possible filter application */
Telemetry.Histogram = (function(){

// Offset relative to length for special elements in arrays of raw data
var DataOffsets = {
  SUM_SQ_HI:      -4,
  SUM_SQ_LO:      -3,
  LOG_SUM_SQ:     -4,
  LOG_SUM:        -3,
  SUM:            -2,
  SUBMISSIONS:    -1
};

/**
 * Auxiliary function to aggregate values of index from histogram dataset
 * TODO: Consider taking a look at all applications, maybe cache some of them.
 */
function _aggregate(index, histogram) {
  // Cache the list of filter ids
  if (histogram._filterIds === undefined) {
    histogram._filterIds = _listFilterIds(histogram._filter_tree);
  }
  // Aggregate index as sum over histogram
  var sum = 0;
  var n = histogram._filterIds.length;
  for(var i = 0; i < n; i++) {
    var filter_id   = histogram._filterIds[i];
    var data_array  = histogram._dataset[filter_id];
    if (data_array) {
      sum += data_array[index >= 0 ? index : data_array.length + index];
    }
  }
  return sum;
}

/**
 * Create a new histogram, where
 *  - filter_path   is a list of [name, date-range, filter1, filter2...]
 *  - buckets       is a list of bucket start values,
 *  - dataset       is a mapping from filter ids to arrays of raw data
 *  - filter_tree   is a node in filter tree structure, and
 *  - spec          is the histogram specification.
 */
function Histogram(filter_path, buckets, dataset, filter_tree, spec) {
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
    this._filter_path.concat(option),
    this._buckets,
    this._dataset,
    this._filter_tree[option],
    this._spec
  );
}

/** Name of filter available, null if none */
Histogram.prototype.filterName = function Histogram_filterName() {
  return this._filter_tree.name || null;
}

/** List of options available for current filter */
Histogram.prototype.filterOptions = function Histogram_filterOptions() {
  var options = [];
  for (var key in this._filter_tree) {
    if (key != "name" && key != "_id") {
      options.push(key);
    }
  }
  return options.sort();
}

/** Get the histogram kind */
Histogram.prototype.kind = function Histogram_kind() {
  return this._spec.kind;
}

/** Get number of data points in this histogram */
Histogram.prototype.count = function Histogram_count() {
  var count = 0;
  var n = this._buckets.length;
  for(var i = 0; i < n; i++) {
    count += _aggregate(i, this);
  }
  return count;
}

/** Number of telemetry pings aggregated in this histogram */
Histogram.prototype.submissions = function Histogram_submissions() {
  return _aggregate(DataOffsets.SUBMISSIONS, this);
}

/** Get the mean of all data points in this histogram, null if N/A */
Histogram.prototype.mean = function Histogram_mean() {
  if (this.kind() != "linear" || this.kind() != "exponential") {
    return null;
  }
  var sum = _aggregate(DataOffsets.SUM, this);
  return sum / this.count();
}

/** Get the geometric mean of all data points in this histogram, null if N/A */
Histogram.prototype.geometricMean = function Histogram_geometricMean() {
  if (this.kind() != "exponential") {
    return null;
  }
  var log_sum = _aggregate(DataOffsets.LOG_SUM, this);
  return log_sum / this.count();
}

/**
 * Get the standard deviation over all data points in this histogram,
 * null if not applicable as this is only available for some histograms.
 */
Histogram.prototype.standardDeviation = function Histogram_standardDeviation() {
  if (this.kind() != "linear") {
    return null;
  }
  var sum       = new Big(_aggregate(DataOffsets.SUM, this));
  var count     = new Big(this.count());
  var sum_sq_hi = new Big(_aggregate(DataOffsets.SUM_SQ_HI, this));
  var sum_sq_lo = new Big(_aggregate(DataOffsets.SUM_SQ_LO, this));
  var sum_sq    = sum_sq_lo.plus(sum_sq_hi.times(new Big(2).pow(32)));
  
  // std. dev. = sqrt(count * sum_squares - sum * sum) / count
  // http://en.wikipedia.org/wiki/Standard_deviation#Rapid_calculation_methods
  return count.times(sum_sq).minus(sum.pow(2)).divide(count).toFixed(3);
}

/**
 * Get the geometric standard deviation over all data points in this histogram,
 * null if not applicable as this is only available for some histograms.
 */
Histogram.prototype.geometricStandardDeviation =
                              function Histogram_geometricStandardDeviation() {
  if (this.kind() != 'exponential') {
    return null;
  }
  var count       = this.count();
  var log_sum     = _aggregate(DataOffsets.LOG_SUM, this);
  var log_sum_sq  = _aggregate(DataOffsets.LOG_SUM_SQ, this);

  // Deduced from http://en.wikipedia.org/wiki/Geometric_standard_deviation
  // using wxmaxima... just make sure to look at 
  /*return Math.exp(
    Math.sqrt(
      (
        count * Math.pow(Math.log(log_sum / count), 2) +
        log_sum_sq -
        2 * log_sum * Math.log(log_sum / count)
      ) / count
    )
  );*/
  // Alternative definition, but this more of guess :)
  return Math.sqrt(count * log_sum_sq - Math.pow(log_sum, 2)) / count;
}

/** Estimate value of a percentile, returns null, if not applicable */
Histogram.prototype.percentile = function Histogram_percentile(percent) {
  if (this.kind() != "linear" && this.kind() != "exponential") {
    return null;
  }

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
  if(i >= n) {
    // If we're at the end bucket, then there's no next bucket, hence, no upper
    // bound and we estimate one. First we estimate the sum of all data-points
    // in buckets below i
    var sum_before_i = 0;
    for (var j = 0; j < i; j++) {
      var nb_points = _aggregate(j, this);
      var bucket_center_value = (this._buckets[j+1] - this._buckets[j]) / 2 +
                                this._buckets[j]; 
      sum_before_i += nb_points * bucket_center_value;
    }
    // We estimate the sum of data-points in i by subtracting the estimate of
    // sum of data-points before i...
    var sum_i = _aggregate(DataOffsets.SUM, this) - sum_before_i;
    // We estimate the mean of bucket i as follows
    var bucket_i_mean = sum_i / _aggregate(i, this);
    // Now estimate bucket i end by 2 * bucket_i_mean
    end = bucket_i_mean * 2;
  }

  // Fraction indicating where in bucket i the percentile is located 
  var bucket_fraction = to_count / (_aggregate(i, this) + 1);

  if (this.kind() == "linear") {
    // Interpolate median assuming a uniform distribution between start and end.
    return start + (end - start) * bucket_fraction;
  
  } else if (this.kind() == "exponential") {
    // Interpolate median assuming an exponential distribution
    return Math.exp(Math.log(start) + Math.log(end - start) * bucket_fraction);
  }
  return null;
}

/** Estimate the median, returns null, if not applicable */
Histogram.prototype.median = function Histogram_median() {
  return this.percentile(50);
}

/**
 * Invoke cb(count, start, end) for every bucket in this histogram, the
 * cb is invoked for each bucket ordered from low to high.
 */
Histogram.prototype.each = function Histogram_each(cb) {
  var n = this._buckets.length;
  for(var i = 0; i < n; i++) {
    var count = _aggregate(i, this._dataset, this._filter_tree),
        start = this._buckets[i];
        end   = this._buckets[i+1];
    //TODO: End for the last bucket should be estimated, not null as is now
    cb(count, start, end);
  }
}

return Histogram;

})(); /* Histogram */

/** Representation of histogram changes over time  */
Telemetry.HistogramEvolution = (function(){

/** Auxiliary function to parse a date string from JSON data format */
function _parseDateString(d) {
  return new Date(d.substr(0,4) + "/" + d.substr(4,2) + "/"+ d.substr(6,2));
}

/**
 * Create a histogram evolution, where
 *  - filter_path   is a list of [name, date-range, filter1, filter2...]
 *  - data          is the JSON data loaded from file,
 *  - filter_tree   is the filter_tree root, and
 *  - spec          is the histogram specification.
 */
function HistogramEvolution(filter_path, data, filter_tree, spec) {
  this._filter_path = filter_path;
  this._data        = data;
  this._filter_tree = filter_tree;
  this._spec        = spec;
}

/** Get the histogram kind */
HistogramEvolution.prototype.kind = function HistogramEvolution_kind() {
  return this._spec.kind;
}

/** Get new HistogramEvolution representation filtered with option */
HistogramEvolution.prototype.filter = function histogramEvolution_filter(opt) {
  if (!(this._filter_tree[opt] instanceof Object)) {
    throw new Error("filter option: \"" + opt +"\" is not available");
  }
  return new HistogramEvolution(
    this._filter_path.concat(opt),
    this._data,
    this._filter_tree[opt],
    this._spec
  );
}

/** Name of filter available, null if none */
HistogramEvolution.prototype.filterName =
                                      function HistogramEvolution_filterName() {
  return this._filter_tree.name || null;
}

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
}

/**
 * Get merged histogram for the interval [start; end], ie. start and end dates
 * are inclusive. Omitting start and/or end will give you the merged histogram
 * for the open-ended interval.
 */
HistogramEvolution.prototype.range =
                                function HistogramEvolution_range(start, end) {
  // Construct a dataset by merging all datasets/histograms in the range
  var merged_dataset = {}

  // List of filter_ids we care about, instead of just merging all filters
  var filter_ids = _listFilterIds(this._filter_tree);

  // For each date we have to merge the filter_ids into merged_dataset
  for (var datekey in this._data.values) {

    // Check that date is between start and end (if start and end is defined)
    var date = _parseDateString(datekey);
    if((!start || start <= date) && (!end || date <= end)) {
    
      // Find dataset of this datekey, merge filter_ids for this dataset into
      // merged_dataset.
      var dataset = this._data.values[datekey];
      var n = filter_ids.length;
      for(var i = 0; i < n; i++) {
        var filter_id = filter_ids[i];
        var data_array = dataset[filter_id];

        // Skip if current datekey doesn't have information about this filter_id
        if (!data_array) {
          continue;
        }

        // if no data for given filter_id exists, just clone this array
        if (merged_dataset[filter_id] === undefined) {
          merged_dataset[filter_id] = data_array.slice();
        } else {
          // if merged array already exists for this filter_id we have to merge
          // with it, by adding each entry.
          var merged_array = merged_dataset[filter_id];
          if (merged_array.length != data_array.length) {
            console.log("For \"" + this._name + "\" merged_array and " + 
                        "data_array have different lengths!");
          }
          var m = Math.min(merged_array.length, data_array.length);
          for(var j = 0; j < m; j++) {
            merged_array[j] += data_array[j];
          }
        }
      }
    }
  }

  // Create merged histogram
  return new Telemetry.Histogram(
    this._filter_path,
    this._data.buckets,
    merged_dataset,
    this._filter_tree,
    this._spec
  );
}

/** Get the list of dates in the evolution sorted by date */
HistogramEvolution.prototype.dates = function HistogramEvolution_dates() {
  var dates = [];
  for(var date in this._data.values) {
    dates.push(_parseDateString(date));
  }
  return dates.sort();
}

/** Invoke cb(date, histogram) with each date, histogram pair ordered by date */
HistogramEvolution.prototype.each = function HistogramEvolution_each(cb) {
  // Find and sort all date strings
  var dates = [];
  for(var date in this._data.values) {
    dates.push(date);
  }
  dates.sort();
  // Now invoke cb with each histogram
  var n = dates.length;
  for(var i = 0; i < n; i++) {
    cb(
      _parseDateString(dates[i]),
      new Telemetry.Histogram(
        this._filter_path,
        this._data.buckets,
        this._data.values[dates[i]],
        this._filter_tree,
        this._spec
      )
    )
  }
}

return HistogramEvolution;

})(); /* HistogramEvolution */

return exports.Telemetry = Telemetry;

})(this);
