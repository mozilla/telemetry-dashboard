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
      $("#content").fadeIn();
      $("#spinner").fadeOut();
    } else {
      $("#content").fadeOut();
      $("#spinner").fadeIn();
    }
  });
});

function render(hgramEvo) {
  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());

  $("#measure").text(hgramEvo.measure());
  $("#description").text(hgramEvo.description());

  var hgram = hgramEvo.range();

  // Set common properties
  $('#prop-kind')       .text(hgram.kind());
  $('#prop-submissions').text(hgram.submissions());
  $('#prop-count')      .text(hgram.count());


  // Set linear only properties
  if (hgram.kind() == 'linear') {
    $('#prop-mean').text(hgram.mean());
    $('#prop-standardDeviation').text(hgram.standardDeviation());
  }

  // Set exponential only properties
  if (hgram.kind() == 'exponential') {
    $('#prop-geometricMean')
      .text(hgram.geometricMean());
    $('#prop-geometricStandardDeviation')
      .text(hgram.geometricStandardDeviation());
  }

  // Set percentiles if linear or exponential
  if (hgram.kind() == 'linear' || hgram.kind() == 'exponential') {
      $('#prop-p5').text(hgram.percentile(5).toFixed(1));
      $('#prop-p25').text(hgram.percentile(25).toFixed(1));
      $('#prop-p50').text(hgram.percentile(50).toFixed(1));
      $('#prop-p75').text(hgram.percentile(75).toFixed(1));
      $('#prop-p95').text(hgram.percentile(95).toFixed(1));
  }

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
    var vals = hgram.map(function(count, start, end, index) {
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
