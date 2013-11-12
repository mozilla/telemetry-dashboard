var BootstrapSelector = (function($){
  function BootstrapSelector(filterName) {
    this._filterName = filterName;
    this._span = $("<span>");
    this._select = $("<select>");
    this._span.append(this._select);
    this._options = [];
    this._select.bind("change", $.proxy(function() {
      if (this._callback !== undefined) {
        this._callback(this, this.val());
      }
    }, this));
    this._select.addClass("show-tick");
    if (this._filterName === "version" || this._filterName === "measure") {
      this._select.data("live-search", true);
    }
    this._select.addClass("filter-" + this._filterName);
    this._select.selectpicker();
  }

  $.extend(BootstrapSelector.prototype, {
    element: function BootstrapSelector_element() {
      return this._span;
    },
    
    options: function BootstrapSelector_options(options) {
      if (options !== undefined) {
        // Clear existing options
        this._select.empty();

        var parent = this._select;
        var n = options.length;
        for(var i = 0; i < n; i++) {
          var option = options[i];

          var label = option;
          // Special label if we're displaying versions
          if (this._filterName === "version") {
            var opts = option.split("/");
            if (opts[0] !== parent.attr("label")) {
              parent = $("<optgroup>", {label: opts[0]});
              this._select.append(parent);
            }
            var label = label.replace("/", " ");
          }

          // Add <option>
          parent.append($("<option>", {
            text:       label,
            value:      option
          }));
        }

        // Store options for another time
        this._options = options;

        // Update bootstrap select
        this._select.selectpicker('refresh');
      }
      return this._options;
    },

    val: function BootstrapSelector_val(value) {
      if (value !== undefined) {
        this._select.val(value);
        this._select.selectpicker('render');
      }
      return this._select.val();
    },

    change: function BootstrapSelector_change(cb) {
      this._callback = cb;
    },

    destroy: function BootstrapSelector_destroy() {
      this._callback = null;
      this._options = null;
      this._select.remove();
      this._span.remove();
    },
  });

  return BootstrapSelector;
})(jQuery);

Telemetry.init(function(){
  $("#histogram-filter").histogramfilter({
    synchronizeStateWithHash:   true,
    defaultVersion:             function(versions) {
      var nightlies = versions.filter(function(version) {
        return version.substr(0,8) == "nightly/";
      });
      nightlies.sort();
      return nightlies.pop() || versions.sort().pop();
    },
    selectorType: BootstrapSelector
  });

  $("#histogram-filter").bind("histogramfilterchange", function(event, data) {

    // Get HistogramEvolution instance
    var hgramEvo = data.histogram;

    if (hgramEvo !== null) {
      render(hgramEvo);
      $("#state-loaded").fadeIn();
      $("#state-loading").fadeOut();
    } else {
      $("#state-loaded").fadeOut();
      $("#state-loading").fadeIn();
    }
  });
});

function render(hgramEvo) {
  $("#measure").text(hgramEvo.measure());
  $("#description").text(hgramEvo.description());

  nv.addGraph(function() {
    var vals = hgramEvo.map(function(date, hgram) {
      return {x: date.getTime(), y: hgram.submissions()};
    });

    var data = [{
      key:      "Submissions",
      values:   vals,
      color:    "#0000ff"
    }];

    var chart = nv.models.lineChart()
     .tooltips(false);

    chart.xAxis
      .tickFormat(function(d) {
        return d3.time.format('%Y%m%d')(new Date(d));
      });

    d3.select("#evolution")
      .datum(data)
      .transition().duration(500).call(chart);

    nv.utils.windowResize(
      function() {
        chart.update();
      }
    );
    return chart;
  });

  nv.addGraph(function() {
    var vals = hgramEvo.range().map(function(count, start, end, index) {
                  return {x: end, y: count};
    });

    var data = [{
      key:      "Count",
      values:   vals,
      color:    "#0000ff"
    }];

    var chart = nv.models.discreteBarChart()
     .tooltips(false);

    d3.select("#histogram")
      .datum(data)
      .transition().duration(500).call(chart);

    nv.utils.windowResize(
      function() {
        chart.update();
      }
    );
    return chart;
  });
}
