(function(exports){

"use strict";

/** Namespace for this module */
var Dashboard = {};

var _plots = null;

/** Initialize the dashboard, load state from window.location.hash, etc. */
Dashboard.init = function Dashboard_init() {
  if (_plots !== null) {
    throw new Error("Dashboard.init(): Dashboard already initialized!");
  }

  // Initialize list of plots
  _plots = [];

  // Allow for creation of new plots
  $("#add-plot").click(function() { Dashboard.addPlotArea(); });

  // Parse current hash and restore state from it
  Dashboard.hashChanged();

  // If not state was restored from hash, we create a little state
  if (_plots.length == 0) {
    // Create an initial plot area
    Dashboard.addPlotArea();
  }

  // Listen for hash changed events
  $(window).bind("hashchange", Dashboard.hashChanged);

  // Update plot sizes on resize
  var resizeTimeout;
  $(window).resize(function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      var n = _plots.length;
      for(var i = 0; i < n; i++) {
        _plots[i].resize();
      }
    }, 100);
  });
}

/** Add a new PlotArea to the dashboard */
Dashboard.addPlotArea = function Dashboard_addPlotArea(state) {
  var plot = new Dashboard.PlotArea(state);
  _plots.push(plot);
  $("article").append(plot.element());
}

// Last updated hash
var _lastUpdatedHash = null;

/**
 * Update window.location.hash to have the form #<state1>|<state2>, where
 * <state1>, <state2> are PlotArea.state() values from current plot areas
 */
Dashboard.updateHash = function Dashboard_updateHash() {
  // Create a list of states
  var states = [];

  // For each plot
  var n = _plots.length;
  for (var i = 0; i < n; i++) {
    var plot  = _plots[i];

    // Get the state
    var state = plot.state();
    // Ignore null and empty states, allowing for loading plots to be ignored
    if (state) {
      // TODO: Handle cases where state contains a pipe | character.
      if (state.indexOf("|") != -1) {
        console.log("State string \"" + state + "\" contains a pipe character");
      }
      states.push(state);
    }
  }
  _lastUpdatedHash     = "#" + states.join("|");
  window.location.hash = _lastUpdatedHash;
}

/** Restored state from hash */
Dashboard.hashChanged = function Dashboard_hashChanged() {
  // Ignore hash change events we're caused ourselves...
  if (_lastUpdatedHash == window.location.hash) {
    return;
  }

  // Get the current hash without the # character
  var hash = window.location.hash.substr(1);
  // Split hash into states
  var states = hash.split(/\|/);

  // Remove existing plots
  while(_plots.length) {
    var plot = _plots.pop();
    plot.element().remove();
  }

  // For each state
  var n = states.length;
  for(var i = 0; i < n; i++) {
    var state = states[i];

    // Create plot for state
    Dashboard.addPlotArea(state);
  }
}

/**
 * A PlotArea instance creates elements necessary to choose version, measure and
 * various filters. It then fetches the histogram and plots the evolution over
 * time as well as the aggregated histogram.
 * Offering various options to plot percentiles, mean, number of submissions and
 * shows standard deviation as well as histogram description.
 *
 * The state() function gets the state of the PlotArea as a string, designed for
 * use with window.location.hash
 */
Dashboard.PlotArea = (function(){

// Auxiliary function to populate a select element and add options to it
function _populateSelect(options, select) {
  if (select === undefined) {
    select = $("<select>");
  } else {
    select.empty();
  }

  // for each option
  var n = options.length;
  for(var i = 0; i < n; i++) {
    var option = options[i];

    // Add <option>
    select.append($("<option>", {value: option, text: option}));
  }

  // Select first option
  select.val(options[0]);

  return select;
}

/** Create new PlotArea, where state is an optional state to restore from */
function PlotArea(state) {
  // Current HistogramEvolution, null, while loading
  this._hgramEvo = null;

  // Create section
  this._element = $("<section>");

  // Create nav area
  this._nav = $("<nav>")
  this._element.append(this._nav);
  //this._nav.bind("change", $.proxy(this._optionChanged, this));

  // Create selectors
  this._versionSelector = _populateSelect(Telemetry.versions());
  this._measureSelector = _populateSelect([]);

  // Append selectors
  this._nav.append(this._versionSelector);
  this._nav.append(this._measureSelector);

  // Listen for selector changes
  this._versionSelector.bind("change", $.proxy(this._versionChanged, this));
  this._measureSelector.bind("change", $.proxy(this._measureChanged, this));

  // Create span for filter selectors
  this._filterSelectors = $("<span>");
  this._nav.append(this._filterSelectors);
  this._filterSelectors.bind("change", $.proxy(this._filterChanged, this));

  // Creat div for description and other text
  this._descDiv = $("<div>", {class: "info"});
  this._element.append(this._descDiv);

  // Create divs for plotting
  this._hgEvoPlotDiv = $("<div>", {class: "graph"});
  this._hgramPlotDiv = $("<div>", {class: "graph"});
  var plots = $("<div>", {class: "plots"});
  plots.append(this._hgEvoPlotDiv);
  plots.append(this._hgramPlotDiv);
  this._element.append(plots);

  // Place holders for plot objects
  this._hgEvoPlot = null;    
  this._hgramPlot = null;

  // Restore from existing state
  this.restore(state);
}

PlotArea.prototype.restore = function PlotArea_restore(state) {
  var that = this;
  var stateFragments = (state || "").split("/");
  
  // Create version selector
  var versions = Telemetry.versions();
  var version = versions[0];
  if (stateFragments.length >= 2) {
    version = stateFragments.shift() + "/" + stateFragments.shift();
  }

  // Select version
  this._versionSelector.val(version);

  // Fetch measures
  var that = this;
  Telemetry.measures(version, function(measures) {
    _populateSelect(measures, that._measureSelector);

    // Select measure
    var measure = stateFragments.shift() || measures[0];
    that._measureSelector.val(measure);

    // Load histogram
    Telemetry.loadHistogram(version, measure, function(hgramEvo) {
      function applyFilterOptions() {
        // Create next filter
        var filterName = hgramEvo.filterName();
        if (filterName != null) {
          var options = [filterName + "*"].concat(hgramEvo.filterOptions());
          var nextSelector = _populateSelect(options);
          nextSelector.data("hgramEvo", hgramEvo);

          // Try to restore option from stateFragments
          var option = stateFragments.shift();
          if (options.indexOf(option) != -1 && option != filterName + "*") {
            nextSelector.val(option);
            hgramEvo = hgramEvo.filter(option);
          }

          // Append selector, after option have been selected
          that._filterSelectors.append(nextSelector);

          // Restore further filter options, once next selector have been
          // appended
          if (options.indexOf(option) != -1 && option != filterName + "*") {
            applyFilterOptions();
          }
        }
      }

      // Restore filter options
      applyFilterOptions(stateFragments);

      // Update histogram
      that._hgramEvo = hgramEvo;
      that.updatePlots();
    });
  });
}

/** Get element from PlotArea */
PlotArea.prototype.element = function PlotArea_element(){
  return this._element;
}

/** Serialize this PlotArea to a minimalistic string */
PlotArea.prototype.state = function PlotArea_state(){
  var stateFragments = [
    this._versionSelector.val(),
    this._measureSelector.val()
  ];
  this._filterSelectors.children().each(function() {
    var hgramEvo = $(this).data("hgramEvo");
    var option = $(this).val();
    if (option != hgramEvo.filterName() + "*") {
      stateFragments.push(option);
    }
  });
  // Check for slashes
  // if (stateFragment.indexOf("/") != -1) {
  //  // TODO: Handle corner cases where state fragments contains a slash
  //  console.log("PlotArea.state: State fragment \"" + stateFragment + "\"" +
  //              "contains a slash \"/\"!");
  //}
  return stateFragments.join("/");
}

/** Event handler for when selected version is changed */
PlotArea.prototype._versionChanged = function PlotArea__versionChanged() {
  var version = this._versionSelector.val();

  var that = this;
  Telemetry.measures(version, function(measures) {
    // Store old measure, so we can restore it under new version...
    var measure = that._measureSelector.val();

    // Repopulate measure selector
    _populateSelect(measures, that._measureSelector);

    // Clear filter selectors
    that._filterSelectors.empty();

    // Now update measure
    that._measureChanged();
  });
}

/** Event handler for when selected measure is changed */
PlotArea.prototype._measureChanged = function PlotArea__measureChanged() {
  var version = this._versionSelector.val();
  var measure = this._measureSelector.val();

  var that = this;
  Telemetry.loadHistogram(version, measure, function(hgramEvo) {
    // Clear filter selectors
    that._filterSelectors.empty();

    // Create next filter
    var filterName = hgramEvo.filterName();
    if (filterName != null) {
      var options = [filterName + "*"].concat(hgramEvo.filterOptions());
      var nextSelector = _populateSelect(options);
      nextSelector.data("hgramEvo", hgramEvo);
      that._filterSelectors.append(nextSelector);
    }

    // Update histogram
    that._hgramEvo = hgramEvo;
    that.updatePlots();
  });
}

PlotArea.prototype._filterChanged = function PlotArea__filterChanged(e) {
  var filterSelector = $(e.target);

  filterSelector.nextAll().remove();

  // Get filtered HistogramEvolution
  var hgramEvo = filterSelector.data("hgramEvo");
  if (!hgramEvo) throw new Error("Missing hgramEvo!!!");

  // Check if option is selected
  var option = filterSelector.val();
  if (option != hgramEvo.filterName() + "*") {
    // Filter histogram
    hgramEvo = hgramEvo.filter(option);

    // Create next filter
    var filterName = hgramEvo.filterName();
    if (filterName != null) {
      var options = [filterName + "*"].concat(hgramEvo.filterOptions());
      var nextSelector = _populateSelect(options);
      nextSelector.data("hgramEvo", hgramEvo);
      this._filterSelectors.append(nextSelector);
    }
  }

  // Update histogram
  this._hgramEvo = hgramEvo;
  this.updatePlots();
}

/** Update plots to reflect filtered data */
PlotArea.prototype.updatePlots = function PlotArea_updatePlots(){
  // When we update plots, let's just notify dashboard of state changes
  Dashboard.updateHash();

  // Data for evolution series
  var mean        = [],
      submissions = [],
      median      = [];

  // Collect data from histogram evolution
  this._hgramEvo.each(function(date, histogram) {
    // Get Unix time-stamp
    var ts = date - 0;

    // Add data-points
    mean.push([ts, histogram.mean()]);
    submissions.push([ts, histogram.submissions()]);
    median.push([ts, histogram.median()]);
  });

  // Evolution series
  var evoSeries = [
    {label: "Average", data: mean },
    {label: "Daily submissions", data: submissions, yaxis: 2},
    {label: "Median", data: median}
  ];

  // Plot evolution
  this._hgEvoPlot = $.plot(this._hgEvoPlotDiv, evoSeries, {
    grid: {
      hoverable: true
    },
    series: {
      lines:  { show: true },
      points: { show: true },
    },
    xaxes: [
      { mode: "time", timeformat: "%y%0m%0d"}
    ],
    yaxes: [
      {min: 0},
      {min: 0, position: "right"}
    ],
  });

  // Aggregated histogram data
  var aggregated_histogram = [],
      aggregated_ticks = [];
  var i = 0;

  // Create aggregated histogram, with an opened interval in both ends...
  var hgram = this._hgramEvo.range();

  // Collect data from histogram
  hgram.each(function(count, start, end){
    console.log(count);
    aggregated_histogram.push([i, count]);
    aggregated_ticks.push([i, start]);
    i++;
  });

  // Aggregated histogram series
  var hgramSeries = [{data:aggregated_histogram, bars: {show: true}}];

  // Plot aggregated histogram
  this._hgramPlot = $.plot(this._hgramPlotDiv, hgramSeries, {
    "xaxis": { 
      "ticks": aggregated_ticks
    },
    "grid": {
      "hoverable":  true,
    }
  });

  // Update histogram information
  this._descDiv.text(hgram.description() + " (submissions: " +
                     hgram.submissions() + ")");
}

/** Resize plot area */
PlotArea.prototype.resize = function PlotArea_resize() {
  if (this._hgEvoPlot) {
    this._hgEvoPlot.resize();
    this._hgEvoPlot.setupGrid();
    this._hgEvoPlot.draw();
  }
  if (this._hgramPlot) {
    this._hgramPlot.resize();
    this._hgramPlot.setupGrid();
    this._hgramPlot.draw();
  }
}

return PlotArea;

})();

return exports.Dashboard = Dashboard;

})(this);
