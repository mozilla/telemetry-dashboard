// NEW  
function plot(){
  var isLoaded = true;
  gHistogramFilterObjects.forEach(function (filter){
    if (!filter.histogramfilter('histogram'))
      isLoaded = false;
  })
  if (isLoaded) {
      $("#content").fadeIn();
      $("#spinner").fadeOut();
  } 
  else 
  {
      $("#content").fadeOut();
      $("#spinner").fadeIn();
      return;
  }
	gHistogramEvolutions = {};
	gHistogramFilterObjects.forEach(function(f) {
    var hist = f.histogramfilter('histogram');
		if (hist !== null) {
      gHistogramEvolutions[f.histogramfilter('state')] = hist;
    }
	});
	
	if (!$.isEmptyObject(gHistogramEvolutions)) {
		update(gHistogramEvolutions);
	}
	return gHistogramEvolutions;
}

function addMultipleSelect(options, changeCb) {
  
     var selector = $("<select multiple  id=optSelector >");
     selector.addClass( "multiselect");
     $('#multipercentile').empty().append(selector);
     var n = options.length;
     for(var i = 0; i < n; i++) {
       var option = options[i];

       var label = option;
       // Add <option>
       selector.append($("<option>", {
         text:       label,
         value:      option,
         //selected: true
         
       }));
     }
     $("#optSelector").val(options);
     $("#optSelector").change(function(){
       console.log("just enetered in change---");
       console.log($(selector).val());
       changeCb(selector);
       console.log("finished the callback for selector---");
       
       
     });
     selector.multiselect();
}

 Telemetry.init(function(){
  var id = 0;
  var versions = Telemetry.versions();
  addFilter();
  $("#addVersionButton").click(function() {  
                                             id++;
                                             addFilter(id);
                                           });
	

  $('input[name=evo-type]:radio').change(function() {
    var evoType = $('input[name=evo-type]:radio:checked').val();
    $("#histogram-filter").histogramfilter('option', 'evolutionOver', evoType);
    //console.log(evoType);
  });

  $('input[name=render-type]:radio').change(function() {
    plot();
  });
  $('input[name=sanitize-pref]:checkbox').change(function() {
    plot();
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

var gHistogramFilterObjects = [];
var gHistogramEvolutions = {};
function createRemoveButton(parent)
{  
  var button = $("<button>");
  button.name = "remove";
  console.log("the name of my button is", button.name, "and the object itself is", button);
  parent.append(button);
  button.click(function(){parent.remove();
  gHistogramFilterObjects = gHistogramFilterObjects.filter(function(x)
                                                          {
                                                              return x !==parent;
                                                           });
    plot();})
}
function addFilter(name)
{
  var f = $("<div>");
  f.id = name;
  if (name !== undefined)
  {
    console.log("i ended up here");
    var button = createRemoveButton(f); 
  }
 	$('#newHistoFilter').append(f);
	f.histogramfilter({
	// TODO: raluca: Fighting over the window url.
    // synchronizeStateWithHash: true,
    defaultVersion: function(versions) {
      var nightlies = versions.filter(function(version) {
        return version.substr(0,8) == "nightly/";
      });
      nightlies.sort();
      return nightlies.pop() || versions.sort().pop();
    }, 
    selectorType: BootstrapSelector,
    evolutionOver: $('input[name=evo-type]:radio:checked').val(),
  });
  f.bind("histogramfilterchange", plot);
  gHistogramFilterObjects.push(f);
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
    var total = hgram.count();
    var vals = hgram.map(function(count, start, end, index) {
      return {
        x: [start, end],
        y: count,
        percent: count / total
      };
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

function update(hgramEvos) {
  var xxx = [];
  
  $.each(hgramEvos, function( key, value ) { xxx.push(value); });
  
  var hgramEvo = xxx[0];
  
  if (hgramEvos === undefined || hgramEvos === [])
  {
    return;
  }
  

  if(!hgramEvos) {
    hgramEvos = lastHistogramEvos;
  }
  lastHistogramEvos = hgramEvos;
  function prependState(state, data) {  
    $.each(data, function(i, d) { 
      d.key = state + ": " + d.key; 
    });
  
    return data;
  }
  
  var datas = []; 
  var allDataForLabels = [];
  $.each(hgramEvos, function(state, evo){
    allDataForLabels.push(prepareData(evo));
  });
  //from list of lists to list   
  listOfAllData = [].concat.apply([], allDataForLabels);
  
  var labels = listOfAllData.map(function(x){
      return x.key;
    });
  
  function unique(array) {
    return $.grep(array, function(el, index) {
        return index == $.inArray(el, array);
    });
  }
  
  $.each(hgramEvos, function(state, evo) { 
    var data = prepareData(evo); 
    datas.push(prependState(state, data));
  });
  
  //from list of lists to list  
  cDatas = [].concat.apply([], datas);
  
  
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

  
  function prepareData(hgramEvo) {
    var maxSubmissions = 0;

    // Whether we actually filter submissions is controllable via the
    // 'sanitize-pref' preference.
    var sanitizeData = $('input[name=sanitize-pref]:checkbox').is(':checked');

    var submissions = hgramEvo.map(function(date, hgram) {
      if (hgram.submissions() > maxSubmissions) {
        maxSubmissions = hgram.submissions();
      }

      return {x: date.getTime(), y: hgram.submissions()};
    });

    var data = [{
      key:      "Submissions",
      bar:      true, // This is hacked :)
      yAxis:    2,
      values:   submissions,
    }];

    // Don't crap up the percentiles / means with lines based on a tiny number
    // of submissions. Flatten them all to zero if there are less than this
    // many submissions.
    // The cutoff is the lesser of 100 or 1% of the maximum number of
    // submissions we saw.
    var submissionsCutoff = Math.min(maxSubmissions / 100, 100);

    if(hgramEvo.kind() == 'linear' || hgramEvo.kind() == 'exponential') {
      var means = [];
      // Percentile series
      var ps = {};
      [5, 25, 50, 75, 95].forEach(function(p) {
        ps[p] = [];
      });
      hgramEvo.each(function(date, hgram) {
        date = date.getTime();
        if (!sanitizeData || hgram.submissions() >= submissionsCutoff) {
          var mean = hgram.mean();
          if (mean >= 0) {
            means.push({x: date, y: mean});
          }
          [5, 25, 50, 75, 95].forEach(function(p) {
            var v = hgram.percentile(p);
            // Weird negative values can cause d3 etc. to freak out - see Bug 984928 
            if (v >= 0) {
              ps[p].push({x: date, y: v});
            }
          });
        } else {
          // Set everything to zero to keep the graphs looking nice.
          means.push({x: date, y: 0});
          [5, 25, 50, 75, 95].forEach(function(p) {
            ps[p].push({x: date, y: 0});
          });
        }
      });
      data.push({
        key:      "Mean",
        yAxis:    1,
        values:   means,
      },{
        key:      "5th percentile",
        yAxis:    1,
        values:   ps['5'],
      },{
        key:      "25th percentile",
        yAxis:    1,
        values:   ps['25'],
      },{
        key:      "median",
        yAxis:    1,
        values:   ps['50'],
      },{
        key:      "75th percentile",
        yAxis:    1,
        values:   ps['75'],
      },{
        key:      "95th percentile",
        yAxis:    1,
        values:   ps['95'],
      });
    }
    return data;  
  }
  
  function plot(){
    var isLoaded = true;
    gHistogramFilterObjects.forEach(function (filter){
      if (!filter.histogramfilter('histogram'))
        isLoaded = false;
    })
    if (isLoaded) {
        $("#content").fadeIn();
        $("#spinner").fadeOut();
    } 
    else 
    {
        $("#content").fadeOut();
        $("#spinner").fadeIn();
        return;
    }
  	gHistogramEvolutions = {};
  	gHistogramFilterObjects.forEach(function(f) {
      var hist = f.histogramfilter('histogram');
  		if (hist !== null) {
        gHistogramEvolutions[f.histogramfilter('state')] = hist;
      }
  	});


	
  	if (!$.isEmptyObject(gHistogramEvolutions)) {
  		update(gHistogramEvolutions);
  	}
  	return gHistogramEvolutions;
  }

  
  
  nv.addGraph(function() {    
    //var data = prepareData(hgramEvo);
    console.log("hgramEvos----------", hgramEvos);
    //update(hgramEvos);
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
      .datum(cDatas)
      .transition().duration(500).call(focusChart);

    nv.utils.windowResize(
      function() {
        focusChart.update();
      }
    );

    focusChart.setSelectionChangeCallback(updateProps);
    
    function endsWith(str, suffix) {
      suffix = ": " + suffix;
      console.log("---------########str is", str, "suffix is", suffix);
        return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }
    labels = unique(labels);
    addMultipleSelect(labels, function(selector){
      var toBeSelected = selector.val();
      if (toBeSelected === null)
      toBeSelected = [];
      for (var i = 0; i < cDatas.length; i++) {
        if (isKeySelected(cDatas[i].originalKey, toBeSelected)){
          console.log("isKeySelected true");
            cDatas[i].disabled = false;
        }
        else
        {
            cDatas[i].disabled = true;
            console.log("isKeySelected false");
        
        }
      }
          
      console.log("to be selected looks like", toBeSelected);
      focusChart.update();
    });
    
    function isKeySelected(key, toBeSelected) {
      for (var i = 0; i < toBeSelected.length; i++) {
        if (endsWith(key, toBeSelected[i])) {
          return true;
        }
      }
      return false;
    }
   
    
    
    
    
    
    
  });

  updateProps();
}
