function ActiveRow(d) {
  this.buildversion = d.buildversion;
  this.buildarchitecture = d.buildarchitecture;
  this.channel = d.channel;
  this.os = d.os;
  this.osversion = d.osversion;
  this.osservicepack = +d.osservicepackmajor;
  this.locale = d.locale;
  this.activeexperiment = [d.activeexperimentid || null, d.activeexperimentbranch || null];
  this.country = d.country;
  this.active_days = parseInt(d.active_days);
  this.active_users = parseInt(d.active_users);
  if (isNaN(this.active_days) || isNaN(this.active_users)) {
    console.error("Error parsing numbers!", d, this);
  }
}

$(document).ready(function() {
  d3.csv('20151017-active-weekly.csv.gz')
    .on('progress', function() {
      var pct = 0;
      if (d3.event.lengthComputable) {
        pct = d3.event.loaded / d3.event.total * 100;
      }
      indicate("Loading...", pct);
    })
    .row(function(d) { return new ActiveRow(d); })
    .get(function(error, rows) {
      if (error) {
        console.error("Error retreiving CSV data", error);
      } else {
        setupData(rows);
        indicate(null);
      }
    });
});

var gRawData;
var gData;
var gDimensions;
var gFilters;

var kDimensionList = [
  'buildversion',
  'buildarchitecture',
  'channel',
  'os',
  'osversion',
  'osservicepack',
  'locale',
  'activeexperiment',
  'country',
  'active_days'];
var kCommaFormat = d3.format(',');

function get_active(d) {
  return d.active_users;
}

function setupData(rows) {
  gData = crossfilter(rows);
  gDimensions = {};
  gFilters = {};
  kDimensionList.forEach(function(name) {
    var dimension = gData.dimension(function(d) { return d[name]; });
    gDimensions[name] = dimension;
    gFilters[name] = null;
  });
  d3.select('#grand-total').text(kCommaFormat(gData.groupAll().reduceSum(get_active).value()));
  setupTables();
}

function setupTables() {
  kDimensionList.forEach(function(name) {
    var ordered = gDimensions[name].group().reduceSum(get_active).all();

    if (name == "osservicepack" || name == "active_days") {
      ordered.sort(function(a, b) { return d3.ascending(a.key, b.key); });
    } else {
      ordered.sort(function(a, b) { return d3.descending(a.value, b.value); });
      if (ordered.length > 10) {
        var other = d3.sum(ordered.slice(10), function(d) { return d.value; });
        ordered.splice(10, ordered.length - 10,
          { key: "__other__", value: other });
      }
    }

    var rows = d3.select("#" + name + "-view.view-section > table")
      .selectAll("tr").data(ordered, function(d) { return d.key; });
    var new_row = rows.enter().append("tr");
    new_row.classed('view-other', function(d) { return d.key == "__other__"; });
    new_row.append("th").text(function(d) { return d.key; });
    new_row.append("td").classed('view-value', true);
    rows.exit().remove();
    rows.select('.view-value').text(function(d) { return d.value; });
    rows.order();
  });
}
