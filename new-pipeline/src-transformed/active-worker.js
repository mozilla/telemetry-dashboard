"use strict";
self.importScripts("../lib/traceur-runtime.js");
self.importScripts("../lib/papaparse.min.js");
self.importScripts("../lib/crossfilter.min.js");
var gDimensionList;
var gData = crossfilter();
var gDimensions = {};
var kBaseURL = "http://analysis-output.telemetry.mozilla.org/stability-rollups/YYYY/YYYYMMDD-active-weekly.csv.gz";
var gGrandTotal;
function ActiveRow(d) {
  this.buildversion = d.buildversion;
  this.buildarchitecture = d.buildarchitecture;
  this.channel = d.channel;
  this.os = d.os;
  this.osversion = d.osversion;
  this.osservicepack = +d.osservicepackmajor;
  if (this.os == "Darwin") {
    var r;
    if (this.osversion.startsWith("1.")) {
      r = /^(1\.\d+)\.?(.*)$/;
    } else {
      r = /^(\d+)\.?(.*)$/;
    }
    var m = r.exec(this.osversion);
    if (m) {
      this.osversion = m[1];
      this.osservicepack = m[2];
    }
  }
  this.locale = d.locale;
  this.activeexperiment = [d.activeexperimentid || null, d.activeexperimentbranch || null];
  this.country = d.country;
  this.active_days = parseInt(d.active_days);
  this.active_users = parseInt(d.active_users);
  if (isNaN(this.active_days) || isNaN(this.active_users)) {
    console.error("Error parsing numbers!", d, this);
  }
}
function get_active(d) {
  return d.active_users;
}
self.addEventListener("message", function(e) {
  switch (e.data[0]) {
    case "setup":
      setup(e.data[1]);
      break;
    case "fetch":
      fetchData(e.data[1]);
      break;
    case "get-results":
      getResults(e.data[1]);
      break;
    default:
      console.warn("Unexpected message", e);
  }
}, false);
function setup(dimensions) {
  gDimensionList = dimensions;
  gDimensionList.forEach(function($__17) {
    var $__19,
        $__20;
    var $__18 = $__17,
        dimension = ($__19 = $__18[Symbol.iterator](), ($__20 = $__19.next()).done ? void 0 : $__20.value),
        sort = ($__20 = $__19.next()).done ? void 0 : $__20.value;
    gDimensions[dimension] = gData.dimension(function(d) {
      return d[dimension];
    });
  });
}
function fetchData(datestr) {
  var url = kBaseURL.replace(/YYYY/g, datestr.slice(0, 4)).replace(/MMDD/g, datestr.slice(4, 8));
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    error: function(err, file, inputElem, reason) {
      console.error("CSV parsing error", err, file, inputElem, reason);
    },
    complete: function(csvdata) {
      gData.add((function() {
        var $__1 = 0,
            $__2 = [];
        var $__6 = true;
        var $__7 = false;
        var $__8 = undefined;
        try {
          for (var $__4 = void 0,
              $__3 = (csvdata.data)[Symbol.iterator](); !($__6 = ($__4 = $__3.next()).done); $__6 = true) {
            var d = $__4.value;
            $__2[$__1++] = new ActiveRow(d);
          }
        } catch ($__9) {
          $__7 = true;
          $__8 = $__9;
        } finally {
          try {
            if (!$__6 && $__3.return != null) {
              $__3.return();
            }
          } finally {
            if ($__7) {
              throw $__8;
            }
          }
        }
        return $__2;
      }()));
      if (csvdata.errors.length) {
        console.warn("Errors parsing CSV data", csvdata.errors);
      }
      gGrandTotal = gData.groupAll().reduceSum(get_active).value();
      self.postMessage(["fetch-complete", datestr]);
    }
  });
}
function getResults(filters) {
  var $__18,
      $__19,
      $__21,
      $__22;
  var results = {
    grand_total: gGrandTotal,
    dimensions: {}
  };
  results.grand_total = gGrandTotal;
  var $__6 = true;
  var $__7 = false;
  var $__8 = undefined;
  try {
    var $__23 = function() {
      var $__17 = $__4.value,
          name = ($__18 = $__17[Symbol.iterator](), ($__19 = $__18.next()).done ? void 0 : $__19.value),
          sort = ($__19 = $__18.next()).done ? void 0 : $__19.value;
      {
        var filter = filters[name];
        var dimension = gDimensions[name];
        if (filter == null) {
          dimension.filterAll();
        } else {
          gDimensions[name].filterFunction(function(d) {
            return filter.includes(d);
          });
        }
      }
    };
    for (var $__4 = void 0,
        $__3 = (gDimensionList)[Symbol.iterator](); !($__6 = ($__4 = $__3.next()).done); $__6 = true) {
      $__23();
    }
  } catch ($__9) {
    $__7 = true;
    $__8 = $__9;
  } finally {
    try {
      if (!$__6 && $__3.return != null) {
        $__3.return();
      }
    } finally {
      if ($__7) {
        throw $__8;
      }
    }
  }
  results.sub_total = gData.groupAll().reduceSum(get_active).value();
  var $__13 = true;
  var $__14 = false;
  var $__15 = undefined;
  try {
    for (var $__11 = void 0,
        $__10 = (gDimensionList)[Symbol.iterator](); !($__13 = ($__11 = $__10.next()).done); $__13 = true) {
      var $__20 = $__11.value,
          name = ($__21 = $__20[Symbol.iterator](), ($__22 = $__21.next()).done ? void 0 : $__22.value),
          sort = ($__22 = $__21.next()).done ? void 0 : $__22.value;
      {
        var dimension = gDimensions[name];
        var r = dimension.group().reduceSum(get_active).all();
        if (name == "osversion") {
          r = r.filter(function(d) {
            return (d.value != 0);
          });
        }
        results.dimensions[name] = r;
      }
    }
  } catch ($__16) {
    $__14 = true;
    $__15 = $__16;
  } finally {
    try {
      if (!$__13 && $__10.return != null) {
        $__10.return();
      }
    } finally {
      if ($__14) {
        throw $__15;
      }
    }
  }
  self.postMessage(["results", results]);
}
