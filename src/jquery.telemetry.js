/**
 * jQuery Telemetry plugin, providing utility widgets for easy filtering and
 * presentation of Telemetry histograms. Requires jquery.ui.widget.js and
 * telemetry.js, please make sure Telemetry.init() has called back before using
 * any elements from this module.
 */
(function($){

"use strict";

// Auxiliary function for parsing a state string to an array of fragments
function _parseState(state) {
  return (state || "").split("/").map(decodeURIComponent);
}

// Auxiliary function for creating a state string from an array of fragments
function _encodeStateFragments(fragments) {
  return fragments.map(encodeURIComponent).join("/");
}

/**
 * Telemetry histogramfilter widget, a simple widget that manages the <select>
 * elements to filter a histogram. Whenever, the selected filters are changed
 * the histogramfilterchange event is triggered.
 * This event is triggered with a new state and a histogram, null, if currently
 * loading. The state parameter can be used to set window.location.hash and only
 * consists of encodeURIComponent() encoded characters and slash "/" characters.
 *
 * Remark: The histogramfilterchange maybe triggered twice with the same state
 * once, when a new filter is selected and histogram is loading, and once when
 * the histogram have loaded. This allows UI to present a loading graphics,
 * while histogram is loaded. However, sometimes the histogram will only need
 * to be filter, thus, no loading will be involved.
 */
$.widget("telemetry.histogramfilter", {
  
  /** Default options */
  options: {
    /** Bool: lock or unlock measure and filters */
    locked:                        false,
    
    /** Class use to style <select> elements */
   
    selectorClass:                  "histogram-filter",

    /** Initial state of histogram filter */
    state:                          null,

    /**
     * Default version, or function that takes a list of versions and returns
     * the default version.
     */
    defaultVersion:                 null,

    /**
     * Default measure, or function that takes a JSON object of measure ids as
     * created by Telemetry.measures() and returns a measure id.
     */
    defaultMeasure:                 null,

    /** 
     * Attempt to auto restore low level filters when a high level filter is
     * changed, e.g. restore measure and other filters, when version is changed.
     */
    attemptFilterAutoRestore:       true,

    /**
     * Synchronize state with window.location.hash, do not use this option if
     * you intend to have multiple instances of histogramfilter!
     */
    synchronizeStateWithHash:       false,

    /**
     * List of histogram kinds to which measure selection should be limited,
     * this is useful if your dashboard is specialized in a specific kind of
     * histograms: linear, exponential, flag, boolean, enumerated
     */
    allowedHistogramKinds:          null,

    /** Prefix for state() if synchronizeStateWithHash is true */
    windowHashPrefix:               "",
    
    
    /**
     * Load histogram evolution over "Builds" or "Time".
     *
     * If "Builds" is chosen the HistogramEvolution instances returned by this
     * filter will have dates corresponding to build dates.
     * If "Time" is chosen, dates in the HistogramEvolution instances returned
     * will be telemetry ping submission dates. See telemetry.js for more
     * information.
     */
    evolutionOver:                  "Builds",
    
    

    /**
     * Constructor for type to use for selectors. The default constructor
     * creates a type that wraps a <select> element.
     *
     * Objects constructed with `selectorType` should have following methods:
     *  - element()       Get jQuery wrapped element to add to container
     *  - options(opts)   Get/set list of options.
     *  - val(v)          Get/set currently selected option
     *  - enable(v)       Enable/disable the selector
     *  - change(cb)      Set value changed callback, invoked as
     *                    cb(selectorTypeInstance, value)
     *  - destroy()       Remove jQuery wrapped element, unbind event listeners,
     *                    and release resources held.
     *
     * The constructor `selectorType` will be given filterName as argument,
     * which may take one of the following values:
     *  - 'version', 'measure', 'reason', 'appName', 'OS', 'osVersion', 'arch'
     */
    selectorType: (function(){
      /**
       * Construct a selector given a filter name, valid filter names are:
       *  - 'version', 'measure', 'reason', 'appName', 'OS', 'osVersion', 'arch'
       *  Default option, if supported, is filterName + '*'
       */
      function DefaultSelector(filterName) {
        this._filterName = filterName;
        this._select = $("<select>");
        this._options = [];
        this._select.bind("change", $.proxy(function() {
          if (this._callback !== undefined) {
            this._callback(this, this.val());
          }
        }, this));
      }

      // Methods for selector strategy
      $.extend(DefaultSelector.prototype, {
        /** Returns a jQuery wrapper for the underlying DOM element */
        element: function DefaultSelector_element() {
          return this._select;
        },

        /** Get/set selectable options */
        options: function DefaultSelector_options(options) {
          if (options !== undefined) {
            // Clear existing options
            this._select.empty();

            var n = options.length;
            for(var i = 0; i < n; i++) {
              var option = options[i];

              var label = option;
              // Special label if we're displaying versions
              if (this._filterName === "version") {
                label = option.replace("/", " ");
              }

              // Add <option>
              this._select.append($("<option>", {
                text:       label,
                value:      option
              }));
            }

            // Store options for another time
            this._options = options;
          }
          return this._options;
        },

        /** Get/set selected value */
        val: function DefaultSelector_value(value) {
          if (value !== undefined) {
            this._select.val(value);
          }
          return this._select.val();
        },

        /** Enable/disable (gray-out) this selector */
        enable: function DefaultSelector_enable(value) {
          if (value !== undefined) {
            this._select.prop("disabled", !value);
          }
          return this._select.prop("disabled");
        },

        /**
         * Set change callback, only one callback supported, invocation without
         * the callback argument unbinds previous callback. The callback is
         * invoked as: callback(this, selectedValue)
         */
        change: function DefaultSelector_change(callback) {
          this._callback = callback;
        },

        /** Clean up, after element() being detached */
        destroy: function DefaultSelector_remove() {
          this._callback = null;
          this._options = null;
          this._select.remove();
        }
      });

      return DefaultSelector;
    })()
  },

  /** Create new histogramfilter */
  _create: function histogramfilter__create() {
    // Bind event handlers to this
    this._versionChanged    = $.proxy(this._versionChanged,     this);
    this._measureChanged    = $.proxy(this._measureChanged,     this);
    this._filterChanged     = $.proxy(this._filterChanged,      this);
    this._windowHashChanged = $.proxy(this._windowHashChanged,  this);

    // Create version and measure selectors
    this._versionSelector = new this.options.selectorType('version');
    this._measureSelector = new this.options.selectorType('measure');
    if (this.options.locked) {
      this._measureSelector.enable(false);
    }
   
    this._versionSelector.options(Telemetry.versions());
    this._versionSelector.element().addClass(this.options.selectorClass);
    this._measureSelector.element().addClass(this.options.selectorClass);

    // Append version and measure selectors
    this.element.append(this._versionSelector.element());
    this.element.append(this._measureSelector.element());

    // Flag to ignore changes to select elements
    this._ignoreChanges = false;

    // Listen for selector changes
    this._versionSelector.change(this._versionChanged);
    this._measureSelector.change(this._measureChanged);

    // List of filters where each filter is represented by:
    //  {
    //    select:       selectorType,       // selectorType instance
    //    histogram:    HistogramEvolution  // HistogramEvolution instance to be
    //                                      // filtered by selected option
    //  }
    this._filterList = [];

    // State to restore from
    var state = this.options.state;

    // Setup window.location.hash synchronization
    if(this.options.synchronizeStateWithHash) {
      // Get hash from window, if not provided by
      var prefixLength = this.options.windowHashPrefix.length;
      state = state || window.location.hash.substr(1 + prefixLength);

      // Listen for hashchange events
      $(window).bind("hashchange", this._windowHashChanged);
    }

    // Restore state
    this.state(state);
  },

  /** Get or set state of filter */
  state: function histogramfilter_state(state) {
    // Restore state if provided
    if (state !== undefined) {
      // Just set the state as we're restoring it
      this.options.state = state;

      // Parse state to find fragments
      var fragments = _parseState(state);

      // Version entry should always contain a slash
      var version = fragments.shift() + "/" + fragments.shift();

      // Get measure
      var measure = fragments.shift();

      // Restore version, etc. and trigger an change event
      this._restoreVersion(version, measure, fragments);
    }
    return this.options.state;
  },

  /** 
   * Get current histogram, returns an instance of Telemetry.HistogramEvolution
   * or null if currently loading.
   */
  histogram: function histogramfilter_histogram() {
    // Get filter list length
    var n = this._filterList.length;

    // If there is a last filter, get the histogram from it and apply the
    // select option, if not default
    var histogram = null;
    if (n !== 0) {
      // Get last filter
      var filter = this._filterList[n - 1];

      // Get histogram
      histogram = filter.histogram;

      // Get selected option
      var option = filter.select.val();

      // If selected option isn't the default option and the option is available
      if (option != histogram.filterName() + "*" &&
          histogram.filterOptions().indexOf(option) !== -1) {
        
        // Filter the histogram
        histogram = histogram.filter(option);
      }
    }

    // Return the histogram we found
    return histogram;
  },

  /** Set option */
  _setOption: function histogramfilter__setOption(option, value) {
    if (option == "state") {
      // Set state option using state setter
      this.state(value);
    
    } else if (option == "evolutionOver") {
      // Change what we load evolution over
      this.options.evolutionOver = value;

      var state = this.state();
      // Force reload of filters, so it doesn't believe we're already loaded
      this._clearFilterList();
      // Reload state, this should refresh and reload as best possible
      this.state(state);

    } else if (option == "selectorClass") {

      // Change class for each selector
      var oldValue = this.options.selectorClass;

      // Restyle version and measure selectors
      this._versionSelector.element()
        .removeClass(oldValue)
        .addClass(value);
      this._measureSelector.element()
        .removeClass(oldValue)
        .addClass(value);

      // Update options
      this.options.selectorClass = value;

      // Restyle filters by recreating them using set state(get state)
      this.state(this.state());

    } else if (option == "selectorType") {
      // Save current state
      var state = this.state();

      // Clear existing filters
      this._clearFilterList()

      // Remove version and measure selectors
      this._versionSelector.destroy();
      this._measureSelector.destroy();

      // Update options
      this.options.selectorType = value;

      // Create version and measure selectors
      this._versionSelector = new this.options.selectorType('version');
      this._measureSelector = new this.options.selectorType('measure');
      this._versionSelector.options(Telemetry.versions());
      this._versionSelector.element().addClass(this.options.selectorClass);
      this._measureSelector.element().addClass(this.options.selectorClass);

      // Append version and measure selectors
      this.element.append(this._versionSelector.element());
      this.element.append(this._measureSelector.element());

      // Restore state and filters with their new type
      this.state(this.state());

    } else if (option == "synchronizeStateWithHash") {

      // Update options
      this.options.synchronizeStateWithHash = value;

      // Bind/unbind from hashchange event
      if (value) {
        $(window).bind("hashchange", this._windowHashChanged);
      } else {
        $(window).unbind("hashchange", this._windowHashChanged);
      }

     } else if (option == "locked"){
       this.options.locked = value;
       this._measureSelector.enable(!value);
       this._filterList.forEach(function(x){
         x.select.enable(!value);
       });
     } else {
      this.options[option] = value;
    }
  },

  /**
   * Event handler for the hashchange event on window, used if configured to
   * synchronize state with window.location.hash.
   * See options.synchronizeStateWithHash
   */
  _windowHashChanged: function histogramfilter__windowHashChanged() {
    // Get state from hash
    var prefixLength = this.options.windowHashPrefix.length;
    var hashState = window.location.hash.substr(1 + prefixLength);

    // Update if it doesn't match current state
    if (this.state() != hashState) {
      this.state(hashState);
    }
  },

  /** Attempt to restore version with measures and filter fragments */
  _restoreVersion: function histogramfilter__restoreVersion(version, measure,
                                                            fragments) {
    // Validate selected version
    var versions = Telemetry.versions();
    if (versions.indexOf(version) === -1) {
      version = this._defaultVersion(versions);
    }

    // Select version, but ignore this change in event handlers
    this._ignoreChanges = true;
    this._versionSelector.val(version);
    this._ignoreChanges = false;

    // Report that we're loading
    this._triggerChange(false);

    // Load measures for selected version
    Telemetry.measures(version, $.proxy(function(measures) {
      // Abort if another version have been selected while we loaded
      if (this._versionSelector.val() !== version) {
        return;
      }

      // If there is a list of allowed histogram kinds, we limit the list of
      // measures under consideration to these measures
      if (this.options.allowedHistogramKinds !== null) {
        var allowedMeasures = {};
        for(var m in measures) {
          var kind = measures[m].kind;
          if (this.options.allowedHistogramKinds.indexOf(kind) != -1) {
            allowedMeasures[m] = measures[m];
          }
        }
      }

      // Choose default measure if desired isn't available
      if(measures[measure] === undefined) {
        measure = this._defaultMeasure(measures);
      }

      // Populate measures selector while ignoring changes in event handlers
      this._ignoreChanges = true;
      this._measureSelector.options(Object.keys(measures).sort());
      this._ignoreChanges = false;

      // Restore things at measure level
      this._restoreMeasure(measure, fragments);
    }, this));
  },

  /** Attempt to restore measure with filter fragments  */
  _restoreMeasure: function histogramfilter__restoreMeasure(measure,
                                                            fragments) {
    // Select measure, ignoring changes in event handlers
    this._ignoreChanges = true;
    this._measureSelector.val(measure);
    this._ignoreChanges = false;

    // Get version to load histogram for
    var version = this._versionSelector.val();

    // Report that we're loading
    this._triggerChange(false);

    // Load histogram for desired measure
    var loader = "loadEvolutionOver" + this.options.evolutionOver;
    Telemetry[loader](version, measure, $.proxy(function(hgram) {
      // Abort if another version or measure have been selected while we loaded
      if (this._versionSelector.val() !== version ||
          this._measureSelector.val() !== measure) {
        return;
      }

      // Clear filters just to be safe
      this._clearFilterList();

      // Attempt to restore filters from fragments and trigger change event
      this._restoreFilters(hgram, fragments);
    }, this));
  },

  /** 
   * Attempt to restore remaining filters from histogram and state fragments.
   * This method assumes filters for which options are listed in fragments have
   * already been cleared, and that first option of fragments to be applied to
   * hgram immediately.
   */
  _restoreFilters: function histogramfilter__restoreFilters(hgram, fragments) {
    // Get filter name
    var filterName = hgram.filterName();

    // Try to restore filter if one exists
    if(filterName !== null) {
      // Get filter options
      var options = hgram.filterOptions();

      // Prepend default optionf
      var defaultOption = filterName + "*";
      options.unshift(defaultOption);

      // Create a filter entry for the _filterList
      var filter = {
        select:         new this.options.selectorType(filterName),
        histogram:      hgram
      };

      if (this.options.locked) {
        filter.select.enable(false);
      }
            
      filter.select.options(options);
      filter.select.element().addClass(this.options.selectorClass);

      // Now add filter to _filterList so it gets index we assigned above
      this._filterList.push(filter);

      // Restore option
      var option = fragments.shift();

      // If option is invalid or default, we restore default and clear fragments
      if (options.indexOf(option) <= 0) {
        option = defaultOption;
        fragments = [];
      }

      // Select option
      filter.select.val(option);

      // Listen for changes and append to root element
      filter.select.change(this._filterChanged);
      this.element.append(filter.select.element());

      if (option != defaultOption) {
        // If we didn't select the default option, filter histogram and continue
        // to recursively restore remaining fragments
        this._restoreFilters(hgram.filter(option), fragments);
      } else {
        // If we selected default options then no filters follows and we should
        // trigger a change
        this._triggerChange(true);
      }
    } else {
      // If there's no filter available, then we've drilled all the way down and
      // should trigger a change event
      this._triggerChange(true);
    }
  },

  /** Select default version from a list of versions, using this.options */
  _defaultVersion: function histogramfilter__defaultVersion(versions) {
    // Get default version
    var version = this.options.defaultVersion;

    // If function, use it to choose a version
    if (version instanceof Function) {
      version = version.call(this.element, versions);
    }

    // Validate selected version
    if (versions.indexOf(version) == -1) {
      // Now resort to choose the first version available
      version = versions[0];
    }

    return version;
  },

  /** 
   * Select default measure given values as provided by Telemetry.measures(),
   * note, you shouldn't have to overwrite this method. The same functionality
   * is exposed through options.defaultMeasure which can also be specified as
   * a function.
   */
  _defaultMeasure:
              function histogramfilter__defaultMeasure(measures) {
    // Get default measure
    var measure = this.options.defaultMeasure;
    
    // If function, use it to choose a measure
    if (measure instanceof Function) {
      measure = measure.call(this.element, measures);
    }

    // Validate selected measure
    if (measures[measure] === undefined) {
      // Now resort to choose the first measure available
      measure = Object.keys(measures).sort()[0]
    }
    
    return measure;
  },

  /** Selected version changed event handler */
  _versionChanged: function histogramfilter__versionChanged() {
    // If flagged to ignore changes in event handler, then we comply. This is
    // usually done to avoid recursion and interference from event handlers
    if (this._ignoreChanges) {
      return;
    }

    // Get selected version
    var version = this._versionSelector.val();
    
    // Get selected measure, so we can restore it
    var measure = this._measureSelector.val();
    
    // Clear applied filters
    var clearedFilters = this._clearFilterList();
    
    // If we're not supposed to restore from them measure and clear filtered
    // forget them
    if(!this.options.attemptFilterAutoRestore) {
      measure = null;
      clearedFilters = [];
    }

    // Now restore version, measure and cleared filters as desired
    // this will also trigger a changed event, so that's it
    this._restoreVersion(version, measure, clearedFilters);
  },

  /** Selected measure changed event handler */
  _measureChanged: function histogramfilter__measureChanged() {
    // If flagged to ignore changes in event handler, then we comply. This is
    // usually done to avoid recursion and interference from event handlers
    if (this._ignoreChanges) {
      return;
    }

    // Get selected measure
    var measure = this._measureSelector.val();
    
    // Clear applied filters
    var clearedFilters = this._clearFilterList();
    
    // If we're not supposed to restore from cleared filters we forget them
    if(!this.options.attemptFilterAutoRestore) {
      clearedFilters = [];
    }

    // Now restore measure and cleared filters as desired this will also
    // trigger a changed event, so that's it
    this._restoreMeasure(measure, clearedFilters);
  },

  /** Filter changed event handler */
  _filterChanged: function histogramfilter__filterChanged(select, option) {
    // If flagged to ignore changes in event handler, then we comply. This is
    // usually done to avoid recursion and interference from event handlers
    if (this._ignoreChanges) {
      return;
    }

    // Find filter index in _filterList
    var i, n = this._filterList.length;
    for (i = 0; i < n; i++) {
      if (this._filterList[i].select === select) {
        break;
      }
    }
    if (i >= n) {
      throw new Error("Select not in _filterList");
    }

    // Find filter
    var filter = this._filterList[i];

    // Clear lower level filters
    var clearedFilters = this._clearFilterList(i + 1);

    // If we're not supposed to restore from cleared filters we forget them
    if(!this.options.attemptFilterAutoRestore) {
      clearedFilters = [];
    }

    // If we haven't chosen the default option, restore filters, or at least
    // create next filter and trigger change event
    if(filter.histogram.filterName() + "*" !== option) {
      this._restoreFilters(filter.histogram.filter(option), clearedFilters);
    } else {
      // Otherwise, trigger the change event
      this._triggerChange(true);
    }
  },

  /**
   * Clear _FilterList starting from given index, all if no index is given,
   * and return a list of selected options for removed filters
   */
  _clearFilterList: function histogramfilter__clearFilterList(index) {
    if (index === undefined) {
      index = 0;
    }

    // Remove filters from index forward from _filterList
    var removed = this._filterList.splice(index);

    // Remove <select> from removed filters and get selected options
    var options = [];
    var n = removed.length;
    for (var i = 0; i < n; i++) {
      // Get i'th removed filter
      var filter = removed[i];

      // Get selected option
      var option = filter.select.val();

      // If this isn't the last filter or we haven't selected the default option
      // add it to the list of options
      if (i != n - 1 || filter.histogram.filterName() + "*" != option) {
        options.push(option);
      }

      // Remove filter
      filter.select.destroy();
    }

    // Return list of removed options, for any body remotely interested in
    // trying to restore them.
    return options;
  },

  /** Trigger the histogramfilterchange event */
  _triggerChange: function histogramfilter__triggerChange(doneLoading) {
    // Version should be channel/version, and we wish to treat this as two
    // fragments with respect to serialization
    var fragments = this._versionSelector.val().split("/");
    if (fragments.length != 2) {
      // We need the version to be on format <channel>/<version> this is fairly
      // stupid, and we might accidentally break this in the future, but there
      // is not easy way to change it now... We should consider doing this when
      // refactoring mr2disk.py
      console.log("Telemetry versions are supposed to be <channel>/<version>" +
                  " changing this breaks jquery.telemetry.js");
    }

    // Append selected measure
    fragments.push(this._measureSelector.val());

    // For each filter with exception of the last one append selected value
    var filter;
    var n = this._filterList.length;
    for (var i = 0; i < n - 1; i++) {
      // Get i'th filter
      filter = this._filterList[i];

      // Append select option
      fragments.push(filter.select.val());
    }

    // If there is a last filter, get the histogram from it and apply the
    // select option, if not default
    var histogram = null;
    if (n !== 0) {
      filter = this._filterList[n - 1];

      // Get histogram
      histogram = filter.histogram;

      // Get selected option
      var option = filter.select.val();

      // If selected option isn't the default option and the option is available
      if (option != histogram.filterName() + "*" &&
          histogram.filterOptions().indexOf(option) != -1) {
        
        // Filter the histogram
        histogram = histogram.filter(option);

        // Append option to fragments
        fragments.push(option);
      }
    }

    // Update cache state
    this.options.state = _encodeStateFragments(fragments);

    // If window.location.hash synchronization is active and we have altered
    // the current state, we should update window.location.hash
    var hashWithPrefix = this.options.windowHashPrefix  + this.options.state;
    if (this.options.synchronizeStateWithHash &&
        hashWithPrefix != window.location.hash.substr(1)) {
      window.location.hash = "#" + hashWithPrefix;
    }

    // Now trigger the histogramfilterchange event
    this._trigger("change", null, {
      state:      this.options.state,
      histogram:  histogram,
      doneLoading: doneLoading,
    });
  },

  /** Destroy histogramfilter */
  destroy: function histogramfilter_destroy() {
    // Remove all selectors
    this._versionSelector.remove();
    this._measureSelector.remove();
    this._clearFilterList();

    // Destroy widget base class
    $.Widget.prototype.destroy.call(this);
  },
  
});

})(jQuery);
