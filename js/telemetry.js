(function(exports){

"use strict";

/** Namespace for this module, this will be exported into the global scope. */
var Telemetry = {};

// Data folder from which data will be loaded, another level indicating current
// folder will be initialized by Telemetry.init()
var _data_folder = 'https://s3-us-west-2.amazonaws.com/telemetry-dashboard/v4';

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
 *     Telemetry.init(function(){
 *       // You can now use telemetry.js
 *       alert("Versions available: "Telemetry.versions().join(','));
 *     });
 *
 * Once you've initialized `telemetry.js` you'll want to lookup available
 * channel, version combinations using `Telemetry.versions()`.
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
 * Get a list of channel, version combinations available. This function returns
 * a list of strings on the form `'<channel>/<version>'`.
 *
 * **Example:**
 *
 *     Telemetry.versions()
 *     ['release/24', 'release/25', 'release/26', ..., 'nightly/28']
 *
 * The strings returned here can be passed to `Telemetry.measures()` in order
 * to get a list of measures available for the specific channel and version.
 * See, `Telemetry.measures()` for callback details.
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
 *     {
 *       "A_TELEMETRY_MEASURE_ID": {
 *         kind:         "linear|exponential|flag|enumerated|boolean",
 *         description:  "A human readable description"
 *       },
 *       ...
 *     }
 *
 * The following example prints all _exponential_ measures for nightly 25,
 * assuming the string `'nightly/25'` is in the list returned by
 * `Telemetry.versions()`.
 *
 *     Telemetry.measures('nightly/25', function(measures) {
 *       for(var measure in measures) {
 *         if(measures[measure].kind == 'exponential') {
 *           // Log the measure id
 *           console.log(measure);
 *         }
 *       }
 *     });
 *
 * ### Measure Identifiers
 * The measure id's are all in UPPER case like `A_TELEMETRY_MEASURE_ID`, along
 * with the selected `'<channel>/<version>'` string these can be provide to
 * `Telemetry.loadEvolutionOverBuilds` and `Telemetry.loadEvolutionOverTime` to
 * load histogram data sets.
 *
 * The measure ids with some exceptions lives in the tree along with definitions
 * and descriptions, see `toolkit/components/telemetry/Histograms.json`.
 * **Do not** use this `Histograms.json` in consumers of `telemetry.js`, all the
 * is carefully included and merged to account for changing revisions.
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
 * Load a `Telemetry.HistogramEvolution` instance for a given channel, version
 * and measure. The `HistogramEvolution` instance will hold a collection of
 * `Histograms` over **build dates**. Use this function if you're interested in
 * the evolution of a histogram over different build ids, but notice that
 * **build ids are reduced to dates**. Hence, you cannot lookup a specific
 * build id - but for most channels there should only be one per day.
 *
 * If you don't care about evolution of the histogram over builds, but just the
 * aggregated histogram over all time or a histogram for a specific build date.
 * This is also the function you should use to load it, then call
 * `HistogramEvolution.range()` without any parameters to get an aggregated
 * `Histogram` instance over all builds.
 *
 * The `channel_version` parameter must be a string on the form
 * `'<channel>/<version>'` obtained from `Telemetry.versions()`. The `measure`
 * parameter, most be a measure identifier obtained using
 * `Telemetry.measures(channel_version, ...)`. To load the `'CYCLE_COLLECTOR'`
 * measure for nightly 25, proceed as follows:
 *
 *     Telemetry.loadEvolutionOverBuilds('nightly/25', 'CYCLE_COLLECTOR',
 *                                       function(histogramEvolution) {
 *       // See HistogramEvolution for how to read data, for example we can
 *       // the build dates available as follows
 *       console.log(histogramEvolution.dates());
 *     });
 *
 * **Remark** all telemetry pings for the given channel, version and measure are
 * aggregated in the `HistogramEvolution` instance obtained through
 * `loadEvolutionOverBuilds`. This is not the case for `loadEvolutionOverTime`.
 * The six week release cycle ensures that number of build dates is fairly
 * limited. However, this is not the case for submissions dates, as not all
 * Firefox users updates immediately. **Thus** if you just want the histogram
 * **aggregated for all builds**, you should use `loadEvolutionOverBuilds`.
 *
 * @param {String}    channel_version   Channel/version string
 * @param {String}    measure           Measure identifier
 * @param {Function}  cb                Callback to be invoked with result
 */
Telemetry.loadEvolutionOverBuilds = function(channel_version, measure, cb) {
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
 * Load a `Telemetry.HistogramEvolution` instance for a given channel, version
 * and measure. The `HistogramEvolution` instance will hold a collection of
 * `Histograms` over _calendar dates_. **Do only** use this function if you're
 * interested in the **evolution of the internet**! It can ofcourse be useful
 * to see if measures differ because of changes in the platform or changes in
 * the internet.
 *
 * If you don't care about evolution of the histogram over time, but just the
 * aggregated histogram over all time, you should **not use this function**.
 * Use `loadEvolutionOverBuilds` for this purpose!
 *
 * Only the first 60 days following the build date will be aggregated in
 * `HistogramEvolution` instances obtained through `loadEvolutionOverTime`.
 * As noted in "Remark" for `loadEvolutionOverBuilds` this is not the case for
 * that `HistogramEvolution` instances loaded through `loadEvolutionOverBuilds`.
 *
 * See `loadEvolutionOverBuilds` for example usage, the parameters are
 * equivalent. You can use the same parameters for both of them.
 *
 * @param {String}    channel_version   Channel/version string
 * @param {String}    measure           Measure identifier
 * @param {Function}  cb                Callback to be invoked with result
 */
 Telemetry.loadEvolutionOverTime = function(channel_version, measure, cb) {
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

/**
 * A `HistogramEvolution` instance is a collection of histograms over dates.
 * These _dates_ can be either build dates or submission dates, depending on
 * whether `loadEvolutionOverBuilds` or `loadEvolutionOverTime` was used to
 * obtained the `HistogramEvolution` instance. For an example of how to obtain
 * an instance of this type see `loadEvolutionOverBuilds`.
 *
 * When you have a `HistogramEvolution` instance, you can `filter` it by
 * available `filterOptions`. You can iterate over dates and histograms with
 * `each`, or aggregated histograms between dates with `range`. If you don't
 * care about dates and just want an aggregated histogram for all dates, you
 * can call `range()` with no arguments, interpreted as the open ended interval.
 * Which in this example prints the total number of submissions aggregated.
 *
 *     Telemetry.loadEvolutionOverBuilds('nightly/25', 'CYCLE_COLLECTOR',
 *                                       function(histogramEvolution) {
 *       // Get submissions from a histogram aggregated over all dates
 *       // in the HistogramEvolution instance
 *       var histogram = histogramEvolution.range();
 *       console.log(histogram.submissions());
 *     });
 *
 *
 * **Note** that when you have obtained an instance of `HistogramEvolution` all
 * operations on this instance and any objects created by it are synchronous
 * and doesn't require any network communication.
 */
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

/**
 * Get the measure for histograms in this `HistogramEvolution` instance.
 *
 * This is the measure id given when this instance was created by either
 * `loadEvolutionOverBuilds` or `loadEvolutionOverTime`. You'll also find this
 * measure id in the results obtained from `Telemetry.measures`.
 *
 * See `Telemetry.measures` for more information on measure ids.
 */
HistogramEvolution.prototype.measure = function HistogramEvolution_measure() {
  return this._measure;
};

/**
 * Get the histogram kind, possible histogram kinds are:
 *
 *   * `'linear'`
 *   * `'exponential'`
 *   * `'flag'`
 *   * `'enumerated'`
 *   * `'boolean'`
 *
 * **Notice** some methods will throw exceptions if used on a histogram with an
 * unsupported _"kind"_. For example it doesn't make sense to estimate
 * percentiles for boolean histograms, and doing so will throw an exception.
 *
 *     // Create a plot of 25'th percentile, if we have 'linear' histogram.
 *     var data_points = null;
 *     if(histogramEvolution.kind() == 'linear') {
 *       data_points = histogramEvolution.map(function(date, histogram, index) {
 *         return {x: date.getTime(), y: histogram.percentile(25)};
 *       });
 *     }
 *
 */
HistogramEvolution.prototype.kind = function HistogramEvolution_kind() {
  return this._spec.kind;
};

/**
 * Get a human readable description of the measure in this histogram.
 *
 * This is the same description as offered by `Telemetry.measures`, it is
 * defined in `Histograms.json`, see section on measure identifiers in
 * `Telemetry.measures`.
 */
HistogramEvolution.prototype.description = function() {
  return this._spec.description;
};

/**
 * Name of filter available, `null` if no filter is available.
 *
 *     // Check to see if a filter is available, assuming histogramEvolution is
 *     // an instance of HistogramEvolution
 *     var filterName = histogramEvolution.filterName();
 *     if (filterName !== null) {
 *       alert("Current filter available: " + filterName);
 *     } else {
 *       alert("No filter available!");
 *     }
 *
 * The aggregated histograms are stored in a filter tree, you can apply one
 * filter at the time _drilling down_ the aggregated data. Each application of
 * a filter returns a new `HistogramEvolution` instance.
 *
 * You should **always** use `filterName` and `filterOptions` get name of the
 * next filter, if any, and available filter options, if any. But as of writing
 * filters offered are:
 *
 *  1. `'reason'`, reason for telemetry ping submission (e.g. `'session_saved'`)
 *  2. `'appName'`, application name (e.g. `'Firefox'`)
 *  3. `'OS'`, operation system (e.g. `'Linux'`)
 *  4. `'osVersion'`, operation system version (e.g. `'3.2'`)
 *  5. `'arch'`, architecture (e.g. `'x86-64'`)
 *
 * **Warning** filter availability, ordering may change at any time,
 * `telemetry.js` offers a stable API to interface them through `filterName`,
 * `filterOptions` and `filter`, use these instead of hardcoding your filters!
 */
HistogramEvolution.prototype.filterName = function() {
  return this._filter_tree.name || null;
};

/**
 * List of options available for current filter, empty list if none or no filter
 * is available.
 *
 * Each option is a string, for example the `'reason'` filter will as of writing
 * offer options `'idle_daily'` and `'saved_session'`.
 * You may pass an option to `HistogramEvolution.filter` if you want to filter
 * by it or, as in this example, show options to the user.
 *
 *     // Present user with filter options available, if filter is available
 *     if (histogramEvolution.filterName() !== null) {
 *       var options = histogramEvolution.filterOptions();
 *       alert("Available filter options: " + options.join(", "));
 *     }
 *
 * **Warning** filter options names changes based submission, do not hard code
 * these, if you want to _drill down_ to your interesting segment, do create
 * an automatic strategy for doing so based on substrings with fall-back to
 * something sane. When, filtering you should **always** use a value returned
 * by this method. Otherwise, your application may break in the future, filter
 * option names will change over time.
 */
HistogramEvolution.prototype.filterOptions = function() {
  var options = [];
  for (var key in this._filter_tree) {
    if (key != "name" && key != "_id") {
      options.push(key);
    }
  }
  return options.sort();
};

/**
 * Get a `HistogramEvolution` instance filtered by `option`.
 *
 * The `option` parameter **must** be a string returned by the `filterOptions`
 * method on this object. It may be tempting to hard code these options, but
 * this **not** recommended, as available options may change at any time.
 * Instead use `filterOptions` to query for available options, and pick one.
 *
 * If you filter the a `HistogramEvolution` instance by two different options,
 * you should get two disjoint aggregates. The following example demonstrates
 * this feature, as the number of submissions in each filtered result must sum
 * up to the number of submissions in the unfiltered aggregated histogram.
 *
 *     // Loop over all available filter options
 *     histogramEvolution.filterOptions().forEach(function(option) {
 *       // Filter by option, returning a new HistogramEvolution instance
 *       var filteredHistogramEvolution = histogramEvolution.filter(option);
 *
 *       // Get aggregated histogram for all dates in filtered histogram
 *       // evolution as obtained above
 *       var filteredHistogram = filteredHistogramEvolution.range();
 *
 *       // Get submissions from aggregated (and filtered) histogram
 *       var submissions = filterHistogram.submissions();
 *       console.log(option + " has " + submissions + " submissions");
 *     });
 *
 *     // Get aggregated (unfiltered) histogram
 *     var histogram = histogramEvolution.range();
 *     var submissions = histogram.submissions();
 *     console.log("In total: " + submissions + " submissions");
 *
 * **Remark** this method will not modify the existing `HistogramEvolution`
 * instance, but return a new instance of `HistogramEvolution` filtered by the
 * given `option`.
 *
 * @param {String}    option            Option you want result filter by.
 */
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

/**
 * Get the list of dates for which this `HistogramEvolution` instance holds
 * histograms. You can get the histograms with the `each()` method or aggregate
 * them with the `range()` method.
 *
 * Depending on whether this `HistogramEvolution` instance was obtained from
 * `loadEvolutionOverBuilds` or `loadEvolutionOverTime` the dates returned are
 * build dates or submissions dates, respectively.
 *
 * This method **returns** a list of Javascript `Date` objects. So you can
 * format them as you please. This examples prints the dates for which a
 * `HistogramEvolution` instance has histograms.
 *
 *     // Get list of dates available
 *     var dates = histogramEvolution.dates();
 *     dates.forEach(function(date) {
 *       console.log(date.toString());
 *     });
 *
 * **Remark**, when you apply filters to an instance of `HistogramEvolution` the
 * resulting (filtered) `HistogramEvolution` instance, _may_ not hold all the
 * same dates. This usually happens if we have very little data from a  given
 * date. See `HistogramEvolution.filter` for more on filtering.
 */
HistogramEvolution.prototype.dates = function HistogramEvolution_dates() {
  var dates = [];
  for(var date in this._data) {
    dates.push(_parseDateString(date));
  }
  return dates.sort();
};

/**
 * Get a `Histogram` instance with aggregated values over date interval starting
 * from `start` and ending with `end`, both `start` and `end` are inclusive.
 *
 * It is important to understand that `null` is interpreted as parameter
 * omission and used to get an open-ended interval. Hence, calling `range()`
 * without any parameters returns a `Telemetry.Histogram` instance with
 * aggregated values for all dates hold by this instance of
 * `HistogramEvolution`. See, below for other example.
 *
 *     // Alert the user to number of submissions in histogramEvolution
 *     var aggregatedHistogram = histogramEvolution.range();
 *     var total = aggregatedHistogram.submissions();
 *     alert("We have a total of " + total + " submissions")
 *
 *     // Ask the user to pick a date split date
 *     var date = new Date(prompt("Please enter a split date:"));
 *
 *     // Now, alert the user the the number of submissions before and on date
 *     aggregatedHistogram = histogramEvolution.range(null, date);
 *     var before = aggregatedHistogram.submissions();
 *     alert("We have " + before + " on and before the entered date");
 *
 *     // Let's alert the user the the number of submissions after and on date
 *     aggregatedHistogram = histogramEvolution.range(date);
 *     var after = aggregatedHistogram.submissions();
 *     alert("We have " + after + " on and after the entered date");
 *
 *     // How about the number of submission on the date
 *     aggregatedHistogram = histogramEvolution.range(date, date);
 *     var on = aggregatedHistogram.submissions();
 *     alert("We have " + on + " on the entered date");
 *
 * **Notice** that `telemetry.js` only cares about the date, not time of day,
 * and while `Date` objects also stores the time of day, this part of the `Date`
 * object will be ignored.
 *
 * @param {Date}      start             Option you want result filter by.
 * @param {Date}      end               Option you want result filter by.
 */
HistogramEvolution.prototype.range = function (start, end) {
  // If start is given, we reduce it to year, month and day, this prevents
  // ensure that less-then-or-equal operator works as expected, in corner cases
  // where people submit dates that holds a none-zero timestamp
  if(start) {
    start = new Date(start.getYear(), start.getMonth(), start.getDate());
  }

  // Sanitize end too
  if(end) {
    end = new Date(end.getYear(), end.getMonth(), end.getDate());
  }

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

/**
 * Iterate over dates and histograms, ordered by date, by having `cb` invoked as
 * `cb(date, histogram, index)` for each `Date`, `Telemetry.Histogram` pair held
 * by this `HistogramEvolution` instance.
 *
 * Depending on whether `loadEvolutionOverBuilds` or `loadEvolutionOverTime` was
 * used to obtained the `HistogramEvolution` instance, the date will be a build
 * date or submission date, respectively. The `index` is an integer starting
 * from `0` and incremented by one for each invocation of `cb`.
 *
 * The following example demonstrates how to print the evolution in number of
 * submissions over dates for a `HistogramEvolution` instance.
 *
 *     histogramEvolution.each(function(date, histogram, index) {
 *       console.log(histogram.submissions() + " on the " + date.toString());
 *     });
 *
 * **Remark** this optional `ctx` parameter can be used to provide a context
 * `cb` should invoked within. If `ctx` is provided `cb` will invoked with the
 * `HistogramEvolution` instance as context.
 *
 * @param {Function}  cb                Callback to be invoked with histograms
 * @param {Object}    ctx               Optional, context calling the callback
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
 * Map date, histogram pairs held by this `HistogramEvolution` instance to an
 * array (ordered by date). Essentially, `cb` is invoked as
 * `cb(date, histogram, index)` for each `Date`, `Telemetry.Histogram` pair, in
 * ordered of increasing date, and the return value from `cb` is appened to an
 * array, which is then then returned by `map()`.
 *
 * Depending on whether `loadEvolutionOverBuilds` or `loadEvolutionOverTime` was
 * used to obtained the `HistogramEvolution` instance, the date will be a build
 * date or submission date, respectively. The `index` is an integer starting
 * from `0` and incremented by one for each invocation of `cb`.
 *
 * This is quite similar to what `HistogramEvolution.each()` does, except the
 * return values from `cb` are stored in an array, returned by `map()` when it
 * it finished. As the following example shows this is very useful for creating
 * arrays of points to plot.
 *
 *     // Let's create a list of {x: ..., y: ...} data points of submissions and
 *     // timestamps to plot with any common Javascript library.
 *     var data = histogramEvolution.map(function(date, histogram, index) {
 *       return {
 *         x:  date.getTime(), // Use get unix timestamp
 *         y:  histogram.submissions()
 *       };
 *     });
 *     // Use your favorite graph library to plot `data`
 *
 * **Remark** this optional `ctx` parameter can be used to provide a context
 * `cb` should invoked within. If `ctx` is provided `cb` will invoked with the
 * `HistogramEvolution` instance as context.
 *
 * ### Performance Considerations
 * Behind the scenes `Telemetry.Histogram` instances holds a list of histograms
 * for different dates and filters, as you drill-down the number of dates and
 * filters, histograms are excluded from consideration. This makes filtering
 * and instantiation of `Histogram` instances very fast, as a `Histogram` is
 * essentially just a virtual view of existing data.
 *
 * However, whenever you access data on a `Telemetry.Histogram` instance the
 * view will be lazily materialized behind the scenes. This is great for
 * performance, unless, `Histogram` instance is immediately discarded.
 *
 * So while it may be tempting to use `HistogramEvolution.map` once for each
 * series you want to plot. It is often much better to use
 * `HistogramEvolution.each` and reused the materialized view. See the good/bad
 * examples below for illustration.
 *
 * **Bad example**, the example below offers poor performance because the
 * `Histogram` instances are created twice and as we access data on these
 * instances, hence, the underlying view is materialized twice.
 *
 *     // Get a list of means and a list of medians (bad performing example)
 *     var means = histogramEvolution.map(function(date, histogram, index) {
 *       return histogram.mean();
 *     });
 *     var medians = histogramEvolution.map(function(date, histogram, index) {
 *       return histogram.median();
 *     });
 *     // Now, we can plot means and medians
 *
 * **Good example**, the example below offers better performance because only
 * one `Histogram` instance is created per data point, hence, the materialized
 * view lazily created for computation of `mean` can be reused for estimation
 * `median`.
 *
 *     // Create a list of means and a list of medians (good performing example)
 *     var means   = [],
 *         medians = [];
 *     histogramEvolution.each(function(date, histogram, index) {
 *       means[index]    = histogram.mean();
 *       medians[index]  = histogram.medians();
 *     });
 *     // Now, we can plot means and medians
 *
 * The above example is just to illustrate a common performance trap with `map`,
 * there are many legitimate uses for `map`.
 *
 * @param {Function}  cb                Mapping to be invoked with histograms
 * @param {Object}    ctx               Optional, context calling the callback
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

/**
 * Representation of histogram under possible filter application
 *
 * **Remark** both `loadEvolutionOverBuilds` and `loadEvolutionOverTime` will
 * provide a instance of `HistogramEvolution`, but dates in the instances
 * represents build dates and ping submission dates, respectively.
 */
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
  var std_dev = count.times(sum_sq).minus(sum.pow(2)).div(count);
  return parseFloat(std_dev.toFixed(3));
};

/**
 * Get the geometric standard deviation over all data points in this histogram,
 * null if not applicable as this is only available for some histograms.
 */
Histogram.prototype.geometricStandardDeviation = function() {
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

exports.Telemetry = Telemetry;
return exports.Telemetry;

})(this);
