"use strict";

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
    let r;
    if (this.osversion.startsWith("1.")) {
      r = /^(1\.\d+)\.?(.*)$/;
    } else {
      r = /^(\d+)\.?(.*)$/;
    }
    let m = r.exec(this.osversion);
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
  gDimensionList.forEach(function([dimension, sort]) {
    gDimensions[dimension] = gData.dimension((d) => d[dimension]);
  });
}

function fetchData(datestr) {
  let url = kBaseURL.replace(/YYYY/g, datestr.slice(0, 4)).replace(/MMDD/g, datestr.slice(4, 8));
  Papa.parse(url, {
    download: true,
    header: true,
    skipEmptyLines: true,
    error: function(err, file, inputElem, reason) {
      console.error("CSV parsing error", err, file, inputElem, reason);
    },
    complete: function(csvdata) {
      gData.add([new ActiveRow(d) for (d of csvdata.data)]);
      if (csvdata.errors.length) {
        console.warn("Errors parsing CSV data", csvdata.errors);
      }
      gGrandTotal = gData.groupAll().reduceSum(get_active).value();
      self.postMessage(["fetch-complete", datestr]);
    },
  });
}

function getResults(filters) {
  let results = {
    grand_total: gGrandTotal,
    dimensions: {},
  };

  results.grand_total = gGrandTotal;

  for (let [name, sort] of gDimensionList) {
    let filter = filters[name];
    let dimension = gDimensions[name];
    if (filter == null) {
      dimension.filterAll();
    } else {
      gDimensions[name].filterFunction((d) => filter.includes(d));
    }
  }

  results.sub_total = gData.groupAll().reduceSum(get_active).value();

  for (let [name, sort] of gDimensionList) {
    let dimension = gDimensions[name];
    let r = dimension.group().reduceSum(get_active).all();
    if (name == "osversion") {
      r = r.filter((d) => (d.value != 0));
    }
    results.dimensions[name] = r;
  }
  self.postMessage(["results", results]);
}
