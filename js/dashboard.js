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
    selectorType:   BootstrapSelector,
    evolutionOver:  $('input[name=evo-type]:radio:checked').val(),
  });

  $("#histogram-filter").bind("histogramfilterchange", function(event, data) {

    // Get HistogramEvolution instance
    var hgramEvo = data.histogram;

    if (hgramEvo !== null) {
      update(hgramEvo);
      $("#content").fadeIn();
      $("#spinner").fadeOut();
    } else {
      $("#content").fadeOut();
      $("#spinner").fadeIn();
    }
  });

  $('input[name=evo-type]:radio').change(function() {
    var evoType = $('input[name=evo-type]:radio:checked').val();
    $("#histogram-filter").histogramfilter('option', 'evolutionOver', evoType);
    console.log(evoType);
  });
});

/** Format numbers */
function fmt(number) {
  var fixed = number.toFixed(3);
  if(fixed.length > 8 || parseFloat(fixed) == 0) {
    return number.toPrecision(8);
  }
  return fixed;
}

var renderHistogramTime = null;

function update(hgramEvo) {
  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());

  $("#measure").text(hgramEvo.measure());
  $("#description").text(hgramEvo.description());

  function updateProps(extent) {
    var hgram;
    if(extent){
      hgram = hgramEvo.range(new Date(extent[0]), new Date(extent[1]));
    } else {
      hgram = hgramEvo.range();
    }

    // Set common properties
    $('#prop-kind')       .text(hgram.kind());
    $('#prop-submissions').text(hgram.submissions());
    $('#prop-count')      .text(hgram.count());


    // Set linear only properties
    if (hgram.kind() == 'linear') {
      $('#prop-mean').text(fmt(hgram.mean()));
      $('#prop-standardDeviation').text(fmt(hgram.standardDeviation()));
    }

    // Set exponential only properties
    if (hgram.kind() == 'exponential') {
      $('#prop-geometricMean')
        .text(fmt(hgram.geometricMean()));
      $('#prop-geometricStandardDeviation')
        .text(fmt(hgram.geometricStandardDeviation()));
    }

    // Set percentiles if linear or exponential
    if (hgram.kind() == 'linear' || hgram.kind() == 'exponential') {
        $('#prop-p5').text(fmt(hgram.percentile(5)));
        $('#prop-p25').text(fmt(hgram.percentile(25)));
        $('#prop-p50').text(fmt(hgram.percentile(50)));
        $('#prop-p75').text(fmt(hgram.percentile(75)));
        $('#prop-p95').text(fmt(hgram.percentile(95)));
    }

    function renderHistogram() {
      var vals = hgram.map(function(count, start, end, index) {
                    return {x: end, y: count};
      });

      var data = [{
        key:      "Count",
        values:   vals,
        color:    "#0000ff"
      }];

      var chart = nv.models.discreteBarChart()
       .margin({top: 10, right: 80, bottom: 40, left: 80})
       .tooltips(true);

      d3.select("#histogram")
        .datum(data)
        .transition().duration(500).call(chart);

      nv.utils.windowResize(
        function() {
          chart.update();
        }
      );
      return chart;
    }

    if(renderHistogramTime) {
      clearTimeout(renderHistogramTime);
    }
    renderHistogramTime = setTimeout(function() {
      nv.addGraph(renderHistogram);
    }, 100);
  }

  nv.addGraph(function() {
    var submissions = hgramEvo.map(function(date, hgram) {
      return {x: date.getTime(), y: hgram.submissions()};
    });

    var data = [{
      key:      "Submissions",
      bar:      true, // This is hacked :)
      yAxis:    2,
      values:   submissions,
    }];

    if(hgramEvo.kind() == 'linear' || hgramEvo.kind() == 'exponential') {
      var means = [];
      var p5 = [];
      var p25 = [];
      var p50 = [];
      var p75 = [];
      var p95 = [];
      hgramEvo.each(function(date, hgram) {
        date = date.getTime();
        means.push({x: date, y: hgram.mean()});
        p5.push({x: date, y: hgram.percentile(5)});
        p25.push({x: date, y: hgram.percentile(25)});
        p50.push({x: date, y: hgram.percentile(50)});
        p75.push({x: date, y: hgram.percentile(75)});
        p95.push({x: date, y: hgram.percentile(95)});
      });
      data.push({
        key:      "Mean",
        yAxis:    1,
        values:   means,
      },{
        key:      "5th percentile",
        yAxis:    1,
        values:   p5,
      },{
        key:      "25th percentile",
        yAxis:    1,
        values:   p25,
      },{
        key:      "median",
        yAxis:    1,
        values:   p50,
      },{
        key:      "75th percentile",
        yAxis:    1,
        values:   p75,
      },{
        key:      "95th percentile",
        yAxis:    1,
        values:   p95,
      });
    }
    
    var focusChart = telemetryMultiChartFocusChart()
      .margin({top: 10, right: 80, bottom: 40, left: 80});

    focusChart.xAxis
      .tickFormat(function(d) {
        return d3.time.format('%Y/%m/%d')(new Date(d));
      });
    focusChart.x2Axis
      .tickFormat(function(d) {
        return d3.time.format('%Y/%m/%d')(new Date(d));
      });
    focusChart.y1Axis
        .tickFormat(d3.format('s'));
    focusChart.y2Axis
        .tickFormat(d3.format('s'));
    focusChart.y3Axis
        .tickFormat(d3.format('s'));
    focusChart.y4Axis
        .tickFormat(d3.format('s'));

    d3.select("#evolution-focus")
      .datum(data)
      .transition().duration(500).call(focusChart);

    nv.utils.windowResize(
      function() {
        focusChart.update();
      }
    );

    focusChart.setSelectionChangeCallback(updateProps);
  });

  updateProps();
}
