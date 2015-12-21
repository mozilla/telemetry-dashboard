"use strict";
self.importScripts("../lib/traceur-runtime.js");
self.importScripts("../lib/papaparse.min.js");
self.importScripts("../lib/crossfilter.min.js");
var gDimensionList;
var gData = crossfilter();
var gDimensions = {};
var kBaseURL = "//analysis-output.telemetry.mozilla.org/stability-rollups/YYYY/YYYYMMDD-active-weekly.csv.gz";
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
  gDimensionList.forEach(function($__15) {
    var $__17,
        $__18;
    var $__16 = $__15,
        dimension = ($__17 = $__16[Symbol.iterator](), ($__18 = $__17.next()).done ? void 0 : $__18.value),
        sort = ($__18 = $__17.next()).done ? void 0 : $__18.value;
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
      gData.add(csvdata.data.map(function(d) {
        return new ActiveRow(d);
      }));
      if (csvdata.errors.length) {
        console.warn("Errors parsing CSV data", csvdata.errors);
      }
      gGrandTotal = gData.groupAll().reduceSum(get_active).value();
      self.postMessage(["fetch-complete", datestr]);
    }
  });
}
function getResults(filters) {
  var $__16,
      $__17,
      $__19,
      $__20;
  var results = {
    grand_total: gGrandTotal,
    dimensions: {}
  };
  results.grand_total = gGrandTotal;
  var $__4 = true;
  var $__5 = false;
  var $__6 = undefined;
  try {
    var $__21 = function() {
      var $__15 = $__2.value,
          name = ($__16 = $__15[Symbol.iterator](), ($__17 = $__16.next()).done ? void 0 : $__17.value),
          sort = ($__17 = $__16.next()).done ? void 0 : $__17.value;
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
    for (var $__2 = void 0,
        $__1 = (gDimensionList)[Symbol.iterator](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
      $__21();
    }
  } catch ($__7) {
    $__5 = true;
    $__6 = $__7;
  } finally {
    try {
      if (!$__4 && $__1.return != null) {
        $__1.return();
      }
    } finally {
      if ($__5) {
        throw $__6;
      }
    }
  }
  results.sub_total = gData.groupAll().reduceSum(get_active).value();
  var $__11 = true;
  var $__12 = false;
  var $__13 = undefined;
  try {
    for (var $__9 = void 0,
        $__8 = (gDimensionList)[Symbol.iterator](); !($__11 = ($__9 = $__8.next()).done); $__11 = true) {
      var $__18 = $__9.value,
          name = ($__19 = $__18[Symbol.iterator](), ($__20 = $__19.next()).done ? void 0 : $__20.value),
          sort = ($__20 = $__19.next()).done ? void 0 : $__20.value;
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
  } catch ($__14) {
    $__12 = true;
    $__13 = $__14;
  } finally {
    try {
      if (!$__11 && $__8.return != null) {
        $__8.return();
      }
    } finally {
      if ($__12) {
        throw $__13;
      }
    }
  }
  self.postMessage(["results", results]);
}
