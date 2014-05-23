/**
 * This is an implementation of the `selectorType` for `histogramfilter` as
 * defined in `jquery.telemetry.js`. This uses bootstrap-select for rendering
 * selectors, creating a very nice UI.
 */
var BootstrapSelector = (function($){
  function BootstrapSelector(filterName) {
    this._filterName = filterName;
    this._span = $("<span>");
    this._select = $("<input >");
    this._span.append(this._select);
    this._options = [];
    this._select.bind("change", $.proxy(function() {
      if (this._callback !== undefined) {
        this._callback(this, this.val());
      }
    }, this));

    if (this._filterName === "version" || this._filterName === "measure") {
      this._select.data("live-search", true);
    }
    this._select.addClass("filter-" + this._filterName);
    this._select.select2({data: []});
  }

  $.extend(BootstrapSelector.prototype, {
    element: function BootstrapSelector_element() {
      return this._span;
    },

    options: function BootstrapSelector_options(options) {
      var data = [];
      if (this._filterName === "version") {
        var groups = {};
        $.each(options, function (idx, option) {
          var groupName = option.split("/")[0];
          if (groups[groupName] === undefined) {
            groups[groupName] = [];
          }
          groups[groupName].push({id: option, text: option.replace("/", " ")});
        });
        data = [];
        $.each(groups, function (groupName, children) {
          data.push({text: groupName, children: children});
        });
      } else {
        data = options.map(function(value) { return {id : value, text: value}});
      }

      if (options !== undefined) {
        this._options = options;
        this._select.select2({data: data});
        this._select.select2("val", options[0]);
      }

        if (false) {

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

      }
      return this._options;
    },

    val: function BootstrapSelector_val(value) {
      if (value !== undefined) {
        this._select.select2("val", value);
      }
      return this._select.select2("val");
    },

    enable: function BootstrapSelector_enable(value) {
      if (value !== undefined) {
        this._select.select2("readonly", !value);
      }
      return this._select.select2("enable");
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