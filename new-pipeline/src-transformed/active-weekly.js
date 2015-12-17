"use strict";
var $__16,
    $__17;
var kDimensionList = [['buildversion', 'value'], ['buildarchitecture', 'value'], ['channel', 'value'], ['os', 'value'], ['osversion', 'value'], ['osservicepack', 'key'], ['locale', 'value'], ['activeexperiment', 'value'], ['country', 'value'], ['active_days', 'key']];
var gWindowsPrettyNames = {
  "5.0": "2000",
  "5.1": "XP",
  "5.2": "XP Pro x64",
  "6.0": "Vista",
  "6.1": "7",
  "6.2": "8",
  "6.3": "8.1",
  "6.4": "10 (Tech Preview)",
  "10.0": "10"
};
var gDarwinNames = {
  "1.2": "Kodiak",
  "1.3": "Cheetah",
  "1.4": "Puma",
  "6": "Jaguar",
  "7": "Panther",
  "8": "Tiger",
  "9": "Leopard",
  "10": "Snow Leopard",
  "11": "Lion",
  "12": "Mountain Lion",
  "13": "Mavericks",
  "14": "Yosemite",
  "15": "El Capitan"
};
var kCommaFormat = d3.format(',');
var gFilters = {};
var $__4 = true;
var $__5 = false;
var $__6 = undefined;
try {
  for (var $__2 = void 0,
      $__1 = (kDimensionList)[Symbol.iterator](); !($__4 = ($__2 = $__1.next()).done); $__4 = true) {
    var $__15 = $__2.value,
        name = ($__16 = $__15[Symbol.iterator](), ($__17 = $__16.next()).done ? void 0 : $__17.value),
        sort = ($__17 = $__16.next()).done ? void 0 : $__17.value;
    {
      gFilters[name] = null;
    }
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
;
var gWorker = new Worker("src-transformed/active-worker.js");
gWorker.postMessage(["setup", kDimensionList]);
gWorker.addEventListener("message", function(e) {
  switch (e.data[0]) {
    case "fetch-complete":
      getResults();
      break;
    case "results":
      processResults(e.data[1]);
      break;
    default:
      console.error("Unexpected event from worker", e);
  }
}, false);
$(document).ready(function() {
  indicate("Fetching data...");
  gWorker.postMessage(["fetch", "20151111"]);
  d3.selectAll('.view-selector > tfoot').append('tr').append('th').append('input').attr('type', 'checkbox').classed('view-selectall', true).property('checked', true);
  $(document).on("change", ".view-selectall", checkall_click);
  $(document).on("click", ".view-selector > tbody > tr", filter_click);
});
function getResults() {
  indicate("Calculating...");
  gWorker.postMessage(["get-results", gFilters]);
}
function processResults(results) {
  var $__19,
      $__20;
  d3.select('#grand-total').text(kCommaFormat(results.grand_total));
  d3.select('#sub-total').text(kCommaFormat(results.sub_total));
  d3.select('#sub-total-pct').text(d3.format(".1%")(results.sub_total / results.grand_total));
  var show_osversion = false;
  var show_servicepack = false;
  if (gFilters.os != null && gFilters.os.length == 1) {
    show_osversion = true;
    if (gFilters.osversion != null && gFilters.osversion.length == 1) {
      show_servicepack = true;
    }
  }
  d3.select("#osversion-note").classed("hidden", show_osversion);
  d3.select("#osversion-view > .view-selector").classed("hidden", !show_osversion);
  d3.select("#osservicepack-note").classed("hidden", show_servicepack);
  d3.select("#osservicepack-view > .view-selector").classed("hidden", !show_servicepack);
  var $__11 = true;
  var $__12 = false;
  var $__13 = undefined;
  try {
    for (var $__9 = void 0,
        $__8 = (kDimensionList)[Symbol.iterator](); !($__11 = ($__9 = $__8.next()).done); $__11 = true) {
      var $__18 = $__9.value,
          name = ($__19 = $__18[Symbol.iterator](), ($__20 = $__19.next()).done ? void 0 : $__20.value),
          sort = ($__20 = $__19.next()).done ? void 0 : $__20.value;
      {
        var ordered = results.dimensions[name];
        if (sort == "key") {
          ordered.sort(function(a, b) {
            return d3.ascending(a.key, b.key);
          });
        } else {
          ordered.sort(function(a, b) {
            return b.value < a.value ? -1 : b.value > a.value ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
          });
        }
        var keyFunction = function(d) {
          return d.key;
        };
        if (name == "osversion") {
          if (!show_osversion) {
            continue;
          }
          if (gFilters.os[0] == "Windows") {
            keyFunction = function(d) {
              if (d.key in gWindowsPrettyNames) {
                return d.key + " (Windows " + gWindowsPrettyNames[d.key] + ")";
              }
              return d.key;
            };
          } else if (gFilters.os[0] == "Darwin") {
            keyFunction = function(d) {
              if (d.key in gDarwinNames) {
                return d.key + "(" + gDarwinNames[d.key] + ")";
              }
              return d.key;
            };
          }
        }
        var rows = d3.select("#" + name + "-view.view-section > .view-selector > tbody").selectAll("tr").data(ordered, function(d) {
          return d.key;
        });
        var new_row = rows.enter().append("tr");
        new_row.append("th").text(keyFunction);
        new_row.append("td").classed('view-value', true);
        new_row.append("td").classed('view-pct', true);
        rows.exit().remove();
        rows.select('.view-value').text(function(d) {
          return kCommaFormat(d.value);
        });
        rows.select('.view-pct').text(function(d) {
          return d3.format(".1%")(d.value / results.sub_total);
        });
        rows.order();
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
  indicate();
}
function checkall_click(e) {
  var selected = $(this).prop('checked');
  var rows = $('tbody > tr', $(this).closest('.view-selector'));
  rows.toggleClass('filtered', !selected);
  rebuildFilters();
}
function filter_click(e) {
  if (e.ctrlKey) {
    $(this).toggleClass('filtered');
  } else {
    $(this).toggleClass('filtered', false).siblings().toggleClass('filtered', true);
  }
  rebuildFilters();
}
function rebuildFilters() {
  var $__19,
      $__20;
  var $__11 = true;
  var $__12 = false;
  var $__13 = undefined;
  try {
    var $__21 = function() {
      var $__18 = $__9.value,
          name = ($__19 = $__18[Symbol.iterator](), ($__20 = $__19.next()).done ? void 0 : $__20.value),
          sort = ($__20 = $__19.next()).done ? void 0 : $__20.value;
      {
        var table = d3.select("#" + name + "-view.view-section > .view-selector");
        var rows = table.selectAll("tbody > tr");
        var select_all = table.select(".view-selectall");
        if (name == "osversion") {
          if (gFilters.os == null || gFilters.os.length != 1) {
            rows.classed("filtered", false);
          }
        } else if (name == "osservicepack") {
          if (gFilters.os == null || gFilters.os.length != 1 || gFilters.osversion == null || gFilters.osversion.length != 1) {
            rows.classed("filtered", false);
          }
        }
        var filter = [];
        var excluded = false;
        rows.each(function(d) {
          if (d3.select(this).classed("filtered")) {
            excluded = true;
          } else {
            filter.push(d.key);
          }
        });
        if (!excluded) {
          gFilters[name] = null;
          select_all.property("checked", true);
        } else {
          gFilters[name] = filter;
          select_all.property("checked", false);
          select_all.property("indeterminate", filter.length != 0);
        }
      }
    };
    for (var $__9 = void 0,
        $__8 = (kDimensionList)[Symbol.iterator](); !($__11 = ($__9 = $__8.next()).done); $__11 = true) {
      $__21();
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
  getResults();
}
