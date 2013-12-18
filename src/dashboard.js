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

  $('input[name=render-type]:radio').change(function() {
    update();
  });
});

/** Format numbers */
function fmt(number) {
  if(number == Infinity)
    return "Infinity";
  if(number == -Infinity)
    return "-Infinity";
  if(isNaN(number))
    return "NaN";
  var prefix = d3.formatPrefix(number ,'s')
  return Math.round(prefix.scale(number) * 100) / 100 + prefix.symbol;
}


function renderHistogramTable(hgram) {
  $('#histogram').hide();
  $('#histogram-table').show();
  var body = $('#histogram-table').find('tbody')
  body.empty();

  body.append.apply(body, hgram.map(function(count, start, end, index) {
    return $('<tr>')
      .append($('<td>').text(fmt(start)))
      .append($('<td>').text(fmt(end)))
      .append($('<td>').text(fmt(count)));
  }));
}


function renderHistogramGraph(hgram) {
  $('#histogram-table').hide();
  $('#histogram').show();
  nv.addGraph(function(){
    var vals = hgram.map(function(count, start, end, index) {
                  return {x: [start, end], y: count};
    });

    var data = [{
      key:      "Count",
      values:   vals,
      color:    "#0000ff"
    }];

    var chart = histogramchart()
     .margin({top: 20, right: 80, bottom: 40, left: 80});
    chart.yAxis.tickFormat(fmt);
    chart.xAxis.tickFormat(function(bucket) {return fmt(bucket[0]);});
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



var renderHistogramTime = null;

var lastHistogramEvo = null;


var _exportHgram = null;
var _lastBlobUrl = null;
// Generate download on mousedown
$('#export-link').mousedown(function(){
  if(_lastBlobUrl){
    URL.revokeObjectURL(_lastBlobUrl);
    _lastBlobUrl = null;
  }
  var csv = "start,\tend,\tcount\n";
  csv += _exportHgram.map(function(count, start, end, index) {
    return [start, end, count].join(",\t");
  }).join("\n");

   _lastBlobUrl = URL.createObjectURL(new Blob([csv]));
   $('#export-link')[0].href = _lastBlobUrl;
   $('#export-link')[0].download = _exportHgram.measure() + ".csv";
});

function update(hgramEvo) {
  if(!hgramEvo) {
    hgramEvo = lastHistogramEvo;
  }
  lastHistogramEvo = hgramEvo;

  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());

  $("#measure").text(hgramEvo.measure());
  $("#description").text(hgramEvo.description());

  function updateProps(extent) {
    var hgram;
    var dates = hgramEvo.dates();
    if(extent){
      var start = new Date(extent[0]);
      var end   = new Date(extent[1]);
      // Normalize dates
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      end   = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      hgram = hgramEvo.range(start, end);
      // Filter dates
      dates = dates.filter(function(date) { return start <= date && date <= end;});
    } else {
      hgram = hgramEvo.range();
    }

    _exportHgram = hgram;

    dateFormat = d3.time.format('%Y/%m/%d');
    var dateRange = "";
    if (dates.length == 0) {
      dateRange = "None";
    } else if (dates.length == 1) {
      dateRange = dateFormat(dates[0]);
    } else {
      var last = dates.length - 1;
      dateRange = dateFormat(dates[0]) + " to " + dateFormat(dates[last]);
    }

    // Set common properties
    $('#prop-kind')       .text(hgram.kind());
    $('#prop-submissions').text(fmt(hgram.submissions()));
    $('#prop-count')      .text(fmt(hgram.count()));
    $('#prop-dates')      .text(d3.format('s')(dates.length));
    $('#prop-date-range') .text(dateRange);

    // Set linear only properties
    if (hgram.kind() == 'linear') {
      $('#prop-mean').text(fmt(hgram.mean()));
      $('#prop-standardDeviation').text(fmt(hgram.standardDeviation()));
    }

    // Set exponential only properties
    if (hgram.kind() == 'exponential') {
      $('#prop-mean2')
        .text(fmt(hgram.mean()));
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

    if(renderHistogramTime) {
      clearTimeout(renderHistogramTime);
    }
    renderHistogramTime = setTimeout(function() {
      var renderType = $('input[name=render-type]:radio:checked').val();
      if(renderType == 'Table') {
        renderHistogramTable(hgram)
      } else {
        renderHistogramGraph(hgram);
      }
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
    
    var focusChart = evolutionchart()
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
        .tickFormat(fmt);
    focusChart.y2Axis
        .tickFormat(fmt);
    focusChart.y3Axis
        .tickFormat(fmt);
    focusChart.y4Axis
        .tickFormat(fmt);

    d3.select("#evolution")
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
