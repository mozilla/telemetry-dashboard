(function(exports){
"use strict";

/**
 * `telemetry.js` is the API for interfacing data aggregated for telemetry
 * dashboard. As of writing it mainly offers access to:
 *
 *  * Evolution of histograms over builds and time, and
 *  * Evolution of simple measures over build and time (as histograms)
 *
 * The goal for `telemetry.js` is to offer a stable, well documented, easy to
 * use, interface for aggregated telemetry data. So that anybody can access the
 * raw aggregates with the aim of developing and deploying custom dashboards.
 *
 *
 * ### Quick Start `telemetry.js`
 * _For a really quick start there is a demo on
 * [jsfiddle](http://jsfiddle.net/eGvw5/)._
 *
 *  1. Include `http://telemetry.mozilla.org/v1/telemetry.js`, you **must**
 *     include from here, **don't host it yourself**.
 *  2. Optionally, include `http://telemetry.mozilla.org/v1/big.js`,
 *     [big.js](https://github.com/MikeMcl/big.js/) is only needed for some
 *     features.
 *  3. Initialize `telemetry.js` with `Telemetry.init(callback)`
 *  4. Choose `'<channel>/<version>'` string from `Telemetry.versions()`
 *  5. Load measures for version with `Telemetry.measures(version, callback)`
 *  6. Load evolution of histogram for choice of version and measure with
 *     `Telemetry.loadEvolutionOverBuilds(version, measure, callback)`
 *  7. Iterate over histograms and dates, filter histograms, display results.
 *
 * **Step 3 through 7** are illustrated below
 *
 *     // First initialize telemetry.js (this loads some meta-data from server)
 *     Telemetry.init(function() {
 *       // Telemetry is now loaded an ready for use, we now get a list of
 *       // '<channel>/<version>' strings
 *       var versions = Telemetry.versions();
 *
 *       // We then pick a version, in this the first
 *       var version = versions[0];
 *
 *       // Then we load measures available for the given version
 *       Telemetry.measures(version, function(measures) {
 *         // In this callback `measures` is now a JSON object on the form:
 *         // {MEASURE_ID: {kind: "linear", description: "..."}, ...}
 *         // Let's choose a measure id, say 'CYCLE_COLLECTOR' if available
 *         var measure = 'CYCLE_COLLECTOR';
 *         if (measures['CYCLE_COLLECTOR'] === undefined) {
 *           // If 'CYCLE_COLLECTOR' isn't available we just pick any other
 *           // measure, say the first in the list of keys on the JSON object
 *           measure = Object.keys(measures)[0];
 *         }
 *
 *         // We then load evolution of this measure over build dates
 *         Telemetry.loadEvolutionOverBuilds(version, measure,
 *                                           function(histogramEvolution) {
 *           // The HistogramEvolution instance holds a set of dates and
 *           // histograms, we can iterate over them as follows
 *           histogramEvolution.each(function(date, histogram) {
 *             // First let's log the date of the histogram, in this case we
 *             // have a build date and number of submissions
 *             console.log("For builds on " + date.toString() + " we have");
 *             console.log(histogram.submissions() + "submissions and");
 *
 *             // We can also iterate over buckets in the histogram, map is
 *             // just a convenient adaption of Javascripts `Array.map`
 *             console.log(histogram.map(function(count, start, end, index) {
 *               return count + " hits between " + start + " and " + end;
 *             }).join('\n'));
 *           });
 *         });
 *       });
 *     });
 *
 * ### Deployment and API Stability
 * It is the **intend** that the APIs documented here should remain stable.
 * And going forward consumers of telemetry dashboard data should be comfortable
 * including `telemetry.js` from:
 *
 *   * `http://telemetry.mozilla.org/v1/telemetry.js`
 *
 * As `telemetry.js` separates data access from data storage layout, this will
 * enable telemetry-dashboard developers to change data storage layout as well
 * as adding features to `telemetry.js` without breaking custom dashboards
 * deployed in the wild.
 *
 * Again, there is no guarantee that all functions in `telemetry.js` will
 * continue to work exactly like they do now, this isn't a Mars rover project,
 * this is a promised of best efforts. If it should ever become desired to
 * refactor `telemetry.js` there will probably be implemented a shim that
 * exposes the old API and host at `telemetry.mozilla.org/v1/telemetry.js`.
 *
 * **Warning** `telemetry.js` does include URLs point to data on the server,
 * these URLs will be subject to change **without warning**. So you should
 * never included `telemetry.js` form any where other than the official URL
 * noted below.
 *
 *   * `http://telemetry.mozilla.org/v1/telemetry.js`
 *
 * If you distribute your own version of `telemetry.js` or access the raw data
 * around `telemetry.js` you should expect your code to break at anytime.
 * The only supported way to consume telemetry dashboard data is through
 * `telemetry.js` included from the source directed above.
 *
 * ### Auxiliary Libraries
 * The drop-down selectors used on the [dashboard](telemetry.mozilla.org) are
 * fairly non-trivial to implement. Luckily, they are provided as an individual
 * component in `jquery.telemetry.js`, this requires the jQuery UI widget
 * factory, which can be found in `jquery.ui.widget.js`. You may also optionally
 * use `custom-selector.js` with
 * [bootstrap-select](http://silviomoreto.github.io/bootstrap-select/) to get
 * pretty [twitter-bootstrap](http://getbootstrap.com/) selectors.
 *
 * Take a look at the sources for telemetry-dashboard to see how
 * `jquery.telemetry.js` works, it's also fairly well documented in source. To
 * use these files hot-linking is, however, not recommended. Distribute them on
 * your own and update them as the dashboard gets updated. It's only
 * `telemetry.js` that should be included from `telemetry.mozilla.org`.
 */
var Telemetry = {};

// Release url from which people should include telemetry.js
var releaseURL = "http://telemetry.mozilla.org/v1/telemetry.js";

// Check if the current browser includes telemetry.js from the release url.
// ignore browsers that don't support `document.currentScript`, there is
// probably not a lot of developers who use IE for development anyway.
if (typeof document !== 'undefined' && document.currentScript && document.currentScript.src != releaseURL) {
  // Let's print a long grim warning message, hopefully people will pay
  // attention, the issue is fairly well explained here.
  console.log([
    "WARNING: telemetry.js is loaded in development mode, this should only be",
    "use for telemetry.js development, not dashboard development, and never",
    "in deployment! In order for telemetry.js to be automatically updated",
    "whenever the server-side storage layout changes you must include ",
    "telemetry.js from:",
    releaseURL,
    "in exchange, we will aim for API compatibility whenever telemetry.js",
    "is updated. This small change could keep your dashboard relevant for",
    "years to come. Notice that telemetry.js does embed URLs pointing to",
    "data folders on the server, and these URLs will be changed without",
    "warning. The only supported way to include telemetry.js is from the",
    "official source noted above. See documentation for further details."
  ].join('\n         '));
}

// Data folder from which data will be loaded, another level indicating current
// folder will be initialized by Telemetry.init()
var _data_folder = 'https://s3-us-west-2.amazonaws.com/telemetry-dashboard/v7';

// Map from channel/version to data prefix, loaded by Telemetry.init()
var _dataFolderMap = null;

// List of versions present in _dataFolderMap
var _versions = null;

var _telemetryAjaxCache = {};
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

  Telemetry.getUrl(_data_folder + "/" + path, function(err, data) {
    if (err) {
      console.log("Telemetry._get: Failed loading " + path + " with " + err);
      return;
    }
    cb.call(null, data);
  });
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
 * Get remote URL. `cb()` will be invoked when resource is acquired.
 * Overwrite this function when using something without XMLHttpRequest()
 *
 *     Telemetry.getUrl('example.com', function(){
 *       alert('found!');
 *     });
 *
 *
 * @param {String}    url     URL to be retreived
 * @param {Function}  cb      Callback to be invoked
 */
Telemetry.getUrl = function(url, cb) {
  // Create HTTP request
  var xhr = new XMLHttpRequest();
  xhr.onload = function (e) {
    if (e.target.status == 200) {
      cb(null, JSON.parse(e.target.responseText));
    } else {
      console.log("Telemetry._get: Failed loading " + url + " with " +
                  e.target.status);
    }
  };
  xhr.open("get", url, true);
  xhr.send();
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
 * Notice, that when you have obtained an instance of `HistogramEvolution` all
 * operations on this instance and any objects created by it are synchronous
 * and doesn't require any network communication.
 *
 * **Remark** you should never instantiate `Telemetry.Histogram` instances on
 * your own. The constructor is exposed to facilitate use with `instanceof`,
 * parameters taken by the constructor is not part of the public stable
 * `telemetry.js` API.
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
 * @param {String}    option            Option you want result filter by
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
  return dates.sort(function(a, b){return a - b;});
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
 * @param {Date}      start             Optional, date to aggregate from
 * @param {Date}      end               Optinoal, date to aggregate to
 */
HistogramEvolution.prototype.range = function (start, end) {
  // If start is given, we reduce it to year, month and day, this prevents
  // ensure that less-then-or-equal operator works as expected, in corner cases
  // where people submit dates that holds a none-zero timestamp
  if(start) {
    start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  }

  // Sanitize end too½
  if(end) {
    end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
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
 * @param {Object}    ctx               Optional, context for the callback
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
  dates.sort(function(a, b) {return a - b;});

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
 * @param {Object}    ctx               Optional, context for the callback
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
 * Representation of a histogram is a set of buckets with intervals a count for
 * number of hits in each bucket.
 *
 * Consider a measure measure the amount of time a given operation takes, for
 * such a measure the first bucket may start at zero and end at 1 ms, then
 * _count_ of the first bucket is the number of times the operation finished
 * between 0 and 1ms. See [histogram](http://en.wikipedia.org/wiki/Histogram)
 * for deeper explanation of histograms.
 *
 * A `Telemetry.Histogram` instance can be obtained from an instance of
 * `Telemetry.HistogramEvolution`, see `loadEvolutionOverBuilds` or
 * `loadEvolutionOverTime` for how to obtain one of those.
 *
 * When you have a `Histogram` instance, you can `filter` it by available
 * `filterOptions`. You can iterate over buckets and counts with
 * `each`, compute statistics such as `mean`, standardDeviation` or estimate
 * more complicated statistics like `median` and `percentile`'s.
 *
 * The following example demonstrates how to obtain a `Histogram` instance and
 * print the number of telemetry submissions aggregated in the histogram.
 *
 *     Telemetry.loadEvolutionOverBuilds('nightly/25', 'CYCLE_COLLECTOR',
 *                                       function(histogramEvolution) {
 *       // Get submissions from a histogram aggregated over all dates
 *       // in the HistogramEvolution instance
 *       var histogram = histogramEvolution.range();
 *
 *       // Now log the number of submissions aggregated in the histogram
 *       console.log(histogram.submissions());
 *     });
 *
 *
 * The above example is just an illustration, you should not hard-code
 * the `'<channel>/<version>'` or measure identifier strings. Valid values for
 * these parameters can be obtained from `Telemetry.versions` and
 * `Telemetry.measures`.
 *
 * **Remark** you should never instantiate `Telemetry.Histogram` instances on
 * your own. The constructor is exposed to facilitate use with `instanceof`,
 * parameters taken by the constructor is not part of the public stable
 * `telemetry.js` API.
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

/**
 * Get the measure aggregated in this `Histogram` instance.
 *
 * This is the measure id given when the data was loaded by either
 * `loadEvolutionOverBuilds` or `loadEvolutionOverTime`. You'll also find this
 * measure id in the results obtained from `Telemetry.measures`.
 *
 * See `Telemetry.measures` for more information on measure ids.
 */
Histogram.prototype.measure = function Histogram_measure() {
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
 *     // Print the mean, if we have 'linear' histogram.
 *     if(histogram.kind() == 'linear') {
 *       console.log("mean value: " + histogram.mean());
 *     }
 *
 */
Histogram.prototype.kind = function Histogram_kind() {
  return this._spec.kind;
};

/**
 * Get a human readable description of the measure in this histogram.
 *
 * This is the same description as offered by `Telemetry.measures`, it is
 * defined in `Histograms.json`, see section on measure identifiers in
 * `Telemetry.measures`.
 */
Histogram.prototype.description = function Histogram_description() {
  return this._spec.description;
};

/**
 * Name of filter available, `null` if no filter is available.
 *
 *     // Check to see if a filter is available, assuming histogram is
 *     // an instance of Histogram
 *     var filterName = histogram.filterName();
 *     if (filterName !== null) {
 *       alert("Current filter available: " + filterName);
 *     } else {
 *       alert("No filter available!");
 *     }
 *
 * The aggregated histograms are stored in a filter tree, you can apply one
 * filter at the time _drilling down_ the aggregated data. Each application of
 * a filter returns a new `Histogram` instance.
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
Histogram.prototype.filterName = function Histogram_filterName() {
  return this._filter_tree.name || null;
};

/**
 * List of options available for current filter, empty list if none or no filter
 * is available.
 *
 * Each option is a string, for example the `'reason'` filter will as of writing
 * offer options `'idle_daily'` and `'saved_session'`.
 * You may pass an option to `Histogram.filter` if you want to filter by it or,
 * as in this example, show options to the user.
 *
 *     // Present user with filter options available, if filter is available
 *     if (histogram.filterName() !== null) {
 *       var options = histogram.filterOptions();
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
 Histogram.prototype.filterOptions = function Histogram_filterOptions() {
  var options = [];
  for (var key in this._filter_tree) {
    if (key != "name" && key != "_id") {
      options.push(key);
    }
  }
  return options.sort();
};

/**
 * Get a `Histogram` instance filtered by `option`.
 *
 * The `option` parameter **must** be a string returned by the `filterOptions`
 * method on this object. It may be tempting to hard code these options, but
 * this **not** recommended, as available options may change at any time.
 * Instead use `filterOptions` to query for available options, and pick one.
 *
 * If you filter the a `Histogram` instance by two different options, you should
 * get two disjoint aggregates. The following example demonstrates this feature,
 * as the number of submissions in each filtered result must sum up to the
 * number of submissions in the unfiltered aggregated histogram.
 *
 *     // Loop over all available filter options
 *     histogram.filterOptions().forEach(function(option) {
 *       // Filter by option, returning a new Histogram instance
 *       var filteredHistogram = histogram.filter(option);
 *
 *       // Get submissions from the filtered histogram
 *       var submissions = filterHistogram.submissions();
 *       console.log(option + " has " + submissions + " submissions");
 *     });
 *
 *     // Get show submission in the unfiltered histogram
 *     var submissions = histogram.submissions();
 *     console.log("In total: " + submissions + " submissions");
 *
 * **Remark** this method will not modify the existing `Histogram` instance, but
 * return a new instance of `Histogram` filtered by the given `option`.
 *
 * @param {String}    option            Option you want result filter by
 */
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

/**
 * Returns the number of telemetry pings aggregated in this histogram
 *
 * Notice that each _telemetry ping_ contains a histogram of it own with
 * multiple measurements. That is, a telemetry ping usually contains many hits
 * in multiple buckets. It is only for simple measurements that the number of
 * submissions is equal to hits in all buckets.
 *
 * For example, if filtered with `'reason'` as `'session_saved'` the number of
 * submissions is the number session aggregated in this histogram.
 */
Histogram.prototype.submissions = function Histogram_submissions() {
  return _aggregate(DataOffsets.SUBMISSIONS, this);
};

/**
 * Get number of data points in this histogram.
 *
 * This method returns the number of measurements in this histogram. That is the
 * number of hits in all buckets. For simple measurements, this is usually equal
 * to the number of submissions.
 */
Histogram.prototype.count = function Histogram_count() {
  var count = 0;
  var n = this._buckets.length;
  for(var i = 0; i < n; i++) {
    count += _aggregate(i, this);
  }
  return count;
};

/**
 * Returns the [mean](http://en.wikipedia.org/wiki/Mean) of all data points in
 * this histogram.
 *
 * The _mean_ is computed using special statistics collected by telemetry in
 * gecko.  This means that the computed mean value is exact, as oppose to
 * `median` and `percentile` which are _estimated_.
 *
 *     // Print mean if available
 *     if (histogram.kind() == 'linear' || histogram.kind() == 'exponential') {
 *       console.log("mean: " + histogram.mean());
 *     }
 *
 * **Remark**, this method in **only supported** for `'linear'` and
 * `'exponential'` histograms, see `Histogram.kind()` to see what kind of
 * histogram you have. Invoking this method on any other kind of histogram will
 * throw an exception.
 */
Histogram.prototype.mean = function Histogram_mean() {
  if (this.kind() != "linear" && this.kind() != "exponential") {
     throw new Error("Histogram.geometricMean() is only available for " +
                     "linear and exponential histograms");
  }
  var sum = _aggregate(DataOffsets.SUM, this);
  return sum / this.count();
};

/**
 * Get the [standard deviation](http://en.wikipedia.org/wiki/Standard_deviation)
 * over all data points in this histogram.
 *
 * This method **depends on** `big.js` for high-precision integer arithmetics.
 * You can download `big.js` from [here](https://github.com/MikeMcl/big.js/),
 * but the library is usually also included with `telemetry.js`.
 *
 *     // Print standard deviation if available
 *     if (histogram.kind() == 'linear') {
 *       console.log("std dev: " + histogram.mean());
 *     }
 *
 * **Remark**, this method in **only supported** for `'linear'` histograms, see
 * `Histogram.kind()` to see what kind of histogram you have. Invoking this
 * method on any other kind of histogram will throw an exception.
 */
Histogram.prototype.standardDeviation = function Histogram_standardDeviation() {
  if (this.kind() != "linear") {
    throw new Error("Histogram.standardDeviation() is only available for " +
                    "linear histograms");
  }
  // Get big from global scope, and check that is available
  var Big = exports.Big;
  if (Big === undefined) {
    throw new Error("Histogram.standardDeviation() requires big.js from: " +
                    "https://github.com/MikeMcl/big.js/");
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
 * Get the [geometric mean](http://en.wikipedia.org/wiki/Geometric_mean) of all
 * data points in this histogram.
 *
 *     // Print geometric mean if available
 *     if (histogram.kind() == 'exponential') {
 *       console.log("Geo mean: " + histogram.geometricMean());
 *     }
 *
 * **Remark**, this method in **only supported** for `'exponential'` histograms,
 * see `Histogram.kind()` to see what kind of histogram you have. Invoking this
 * method on any other kind of histogram will throw an exception.
 */
Histogram.prototype.geometricMean = function Histogram_geometricMean() {
  if (this.kind() != "exponential") {
    throw new Error("Histogram.geometricMean() is only available for " +
                    "exponential histograms");
  }
  var log_sum = _aggregate(DataOffsets.LOG_SUM, this);
  return log_sum / this.count();
};

/**
 * Return the [geometric standard deviation
 * ](http://en.wikipedia.org/wiki/Geometric_standard_deviation)
 * over all data points in this histogram.
 *
 *     // Print geometric standard deviation if available
 *     if (histogram.kind() == 'exponential') {
 *       console.log("Geo std dev: " + histogram.geometricStandardDeviation());
 *     }
 *
 * **Remark**, this method in **only supported** for `'exponential'` histograms,
 * see `Histogram.kind()` to see what kind of histogram you have. Invoking this
 * method on any other kind of histogram will throw an exception.
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

/**
 * Estimate the value of the `percent` percentile. The `percent` parameter must
 * be a number between `0` and `100`.
 *
 * **Warning**, this method **only estimates** the requested percentile.There is
 * no way to compute the exact percentiles for histograms. This could be done
 * for simple measures, but this is **not** implemented in the telemetry
 * analysis backend, and it would be non-trivial to compute the exact
 * percentiles.
 *
 * The the request percentile is estimated by first finding the bucket that
 * contains the given percentile. This is pretty easy as we know how many hits
 * each bucket has. Once we know which bucket contains the requested percentile
 * then we know that the requested percentile is between the start and the end
 * of this bucket. From here we then interpolate the percentile as a point
 * between start and end of the given bucket. For `'linear'` histograms we
 * employ a linear interpolation, for `'exponential'` histograms an exponential
 * interpolation is employed.
 *
 * Please, note that for percentiles located in the highest bucket, this is
 * often the case for the 95th percentile, there is no upper-bound specified for
 * the bucket. To allow for interpolation to work when estimating the requested
 * percentile within this bucket, an upper-bound for the highest bucket is
 * estimated. See `Histogram.each` for details on how this the highest bucket
 * upper-bound is estimated.
 *
 *     // Print estimated percentile if available
 *     if (histogram.kind() == 'linear') {
 *       console.log("Estimated median with linear interpolation:");
 *       console.log(histogram.percentile(50));
 *     }
 *     if (histogram.kind() == 'exponential') {
 *       console.log("Estimated median with exponential interpolation:");
 *       console.log(histogram.percentile(50));
 *     }
 *
 * **Remark**, this method in **only supported** for `'linear'` and
 * `'exponential'` histograms, see `Histogram.kind()` to see what kind of
 * histogram you have. Invoking this method on any other kind of histogram will
 * throw an exception.
 *
 * @param {Number}    percent           Percentile to estimate between 1 and 100
 */
Histogram.prototype.percentile = function Histogram_percentile(percent) {
  if (this.kind() != "linear" && this.kind() != "exponential") {
    throw new Error("Histogram.percentile() is only available for linear " +
                    "and exponential histograms");
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

/**
 * Estimate the [median](http://en.wikipedia.org/wiki/Median), also known as
 * the 50th percentile.
 *
 * This is just an alias for `Histogram.percentile(50)`, read documentation for
 * `Histogram.percentile` to understand limitations of the estimation.
 *
 * **Remark**, this method in **only supported** for `'linear'` and
 * `'exponential'` histograms, see `Histogram.kind()` to see what kind of
 * histogram you have. Invoking this method on any other kind of histogram will
 * throw an exception.
 */
Histogram.prototype.median = function Histogram_median() {
  return this.percentile(50);
};

/**
 * Iterate over buckets, ordered from low to high, by having `cb` invoked as
 * `cb(count, start, end, index)` for each bucket in this `Histogram` instance.
 *
 * In the `cb(count, start, end, index)` invocation of `cb`, `count` the number
 * of measurements that fell in the interval between `start` and `end`, while
 * `index` is the bucket index, an integer incremented by one for each
 * invocation of `cb`.
 *
 * The following example shows how to print the contents of all buckets in an
 * instance of `Telemetry.Histogram`.
 *
 *     // Print the contents of all buckets
 *     histogram.each(function(count, start, end, index) {
 *       console.log("In bucket " + index + " we have " + count + " hits);
 *       console.log("between " + start + " and " + end);
 *     });
 *
 * **Remark** this optional `ctx` parameter can be used to provide a context
 * `cb` should invoked within. If `ctx` is provided `cb` will invoked with the
 * `Histogram` instance as context.
 *
 * @param {Function}  cb                Callback to be invoked with buckets
 * @param {Object}    ctx               Optional, context for the callback
 */
Histogram.prototype.each = function Histogram_each(cb, ctx) {
  // Set ctx if none is provided
  if (ctx === undefined) {
    ctx = this;
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
    cb.call(ctx, count, start, end, i);
  }
};

/**
 * Map buckets in this `Histogram` instance to an array (ordered by buckets,
 * low to high). Bascially, `cb` is invoked as `cb(count, start, end, index)`
 * for each bucket in order from low to high, then the values returned by `cb`
 * is appended to an array, which is then returned by `map()`.
 *
 * This is quite similar to what `Histogram.each()` does, except the return
 * values from `cb` are stored in an array, returned by `map()` when it
 * it finished. As the following example shows how to generate a CSV dump from
 * an instance of `Histogram`.
 *
 *     // Print Comma-Separate-Value file from histogram
 *     var csv = "count,start,end,index\n";
 *     csv += histogram.map(function(count, start, end, index) {
 *       return [count, start, end, index].join(",");
 *     }).join("\n");
 *     console.log(csv);
 *
 * **Remark** this optional `ctx` parameter can be used to provide a context
 * `cb` should invoked within. If `ctx` is provided `cb` will invoked with the
 * `Histogram` instance as context.
 *
 * @param {Function}  cb                Mapping to be invoked with buckets
 * @param {Object}    ctx               Optional, context for the callback
 */
Histogram.prototype.map = function Histogram_map(cb, ctx) {
  // Set ctx if none is provided
  if (ctx === undefined) {
    ctx = this;
  }

  // Array of return values
  var results = [];

  // For each, invoke cb and push the result
  this.each(function(count, start, end, index) {
    results.push(cb.call(ctx, count, start, end, index));
  });

  // Return values from cb
  return results;
};

return Histogram;

})();

exports.Telemetry = Telemetry;
return exports.Telemetry;

})(this);
