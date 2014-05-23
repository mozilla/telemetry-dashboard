var setVisible = true;
var gHistogramEvolutions = {};
var gHistogramFilterObjects = [];
var gSyncWithFirst = false;
var oldEvolutions = [];

function computePageState() {
  var pageState = {};
  pageState.filter = [];
  for (var i = 0; i < gHistogramFilterObjects.length; i++) {
    pageState.filter.push(gHistogramFilterObjects[i].histogramfilter('state'));
  }

/*
  // TODO: doesn't work!
  pageState.aggregates = $("#optSelector").val();
  if (pageState.aggregates === undefined || pageState.aggregates === null) {
    pageState.aggregates = [];
  }
*/
  pageState.evoOver = $('input[name=evo-type]:radio:checked').val();
  pageState.locked = gSyncWithFirst;
  pageState.sanitize = $('input[name=sanitize-pref]:checkbox').is(':checked');

  return pageState;
}

// Only works on array of objects which can be compared with == (string, numbers, etc.)
function arraysEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length != b.length) return false;

  // make copies so that sort doesn't change the order in the originals
  a = [].concat(a);
  b = [].concat(b);

  a.sort();
  b.sort();

  for (var i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function restoreFromPageState(newPageState, curPageState) {
  if (newPageState === undefined ||
      newPageState.filter === undefined ||
      newPageState.filter.length === 0) {
    return false;
  }

  if (!arraysEqual(newPageState.filter, curPageState.filter)) {

    $('#newHistoFilter').empty();

    gHistogramEvolutions = {};
    gHistogramFilterObjects = [];

    var states = newPageState.filter;

    addFilter(true, states[0]);
    if (states.length == 1) {
      setVisible = true;
    }

    for (var i = 1; i < states.length; i++) {
      addFilter(false, states[i]);
    }

    /*
    // TODO: re-enable?
    if (states.length > 1) {
      document.getElementById("summary").remove();
      document.getElementById('summaryDetails').remove();
    }
*/

  }

  function toBoolean(x) {
    if (x === "true" || x === true)
      return true;
    if (x === "false" || x === false)
      return false;
    throw x;
  }

  if (newPageState.evoOver !== undefined) {
    $('input[name=evo-type][value=' + newPageState.evoOver + ']:radio').prop("checked", true);
  }

  if (newPageState.sanitize !== undefined) {
    $('input[name=sanitize-pref]:checkbox').prop('checked', toBoolean(newPageState.sanitize));
  }

  if (newPageState.locked !== undefined) {
    changeLockButton(toBoolean(newPageState.locked));
  }

  if (newPageState.aggregates !== undefined) {
    $("#optSelector").val(newPageState.aggregates);
  }

  return true;
}

function pageStateToUrlHash(pageState) {
  var fragments = [];
  $.each(pageState, function(k, v) {
    if (v instanceof Array) {
      v = v.join("!");
    }

    fragments.push(encodeURIComponent(k) + "=" + encodeURIComponent(v));
  });

  var newUrl = fragments.join("&");
  return newUrl;
}

function urlHashToPageState(url) {
  if (url.length === 0) {
    return {}; // empty state
  }

  if (url[0] === "#") {
    url = url.slice(1);  // drop #
  }

  var fragments = url.split("&");
  var pageState = {};
  for(var i = 0; i < fragments.length; i++) {
      var l = fragments[i].split("=");
      pageState[decodeURIComponent(l[0])] = decodeURIComponent(l[1]);
  }

  if (pageState.filter !== undefined) {
    pageState.filter = pageState.filter.split("!");
  }

  if (pageState.aggregates !== undefined) {
    pageState.aggregates = pageState.aggregates.split("!");
  }

  return pageState;
}

function updateUrlHashIfNeeded() {
  var pageState = computePageState();
  var urlPageState = urlHashToPageState(window.location.hash);

  var loadedEvolutions = Object.keys(gHistogramEvolutions).length;
  var allEvolutions = gHistogramFilterObjects.length;
  if (loadedEvolutions !== allEvolutions) {
    //return;
  }


  // debugger;

  if (!arraysEqual(pageState.filter, urlPageState.filter) ||
      !arraysEqual(pageState.aggregates, urlPageState.aggregates) ||
      "" + pageState.locked !== "" + urlPageState.locked ||
      "" + pageState.evoOver !== "" + urlPageState.evoOver ||
      "" + pageState.sanitize !== "" + urlPageState.sanitize) {

    window.location.hash = pageStateToUrlHash(pageState);
  }
}

// firstChanged true if first filter changed and I need to sync all hidden filters
function plot(firstChanged) {
  var isLoaded = true;
  gHistogramFilterObjects.forEach(function (filter) {
    if (!filter.histogramfilter('histogram')) isLoaded = false;
  })
  if (isLoaded) {
    $("#content").fadeIn();
    $("#spinner").fadeOut();
  } else {
    $("#content").fadeOut();
    $("#spinner").fadeIn();
    return;
  }
  gHistogramEvolutions = {};

  if (firstChanged && gSyncWithFirst) {
    syncStateWithFirst();
  }
  //ralu
  var filt = [];

  gHistogramFilterObjects.forEach(function (f) {

    var hist = f.histogramfilter('histogram');
    var xxx = f.histogramfilter('state');
    var auci = f.histogramfilter('state') + "";
    if (hist !== null && filt.indexOf(xxx) == -1 && oldEvolutions.indexOf(auci) === -1) {
      gHistogramEvolutions[f.histogramfilter('state')] = hist;
      console.log("f.histogramfilter('state') ", f.histogramfilter('state'), "oldEvolution", oldEvolutions.indexOf(f.histogramfilter('state')));
      console.log("oldEvolution looks like inside the if", oldEvolutions);
      filt.push(xxx);

    }
    oldEvolutions = Object.keys(gHistogramEvolutions);
    console.log("old evolutions look like", oldEvolutions);
    //compare old with new histogram evolutions

  });

  if (!$.isEmptyObject(gHistogramEvolutions)) {
    update(gHistogramEvolutions);
    console.log("-----i made un update again");
  }

  updateUrlHashIfNeeded();

  return gHistogramEvolutions;
}


function syncStateWithFirst() {  
  if (gHistogramFilterObjects.length == 0 ) {
    return;
  }
  
  var stateSegment = gHistogramFilterObjects[0].histogramfilter('state');
  var segmParts = stateSegment.split("/");
  segmParts.shift();
  segmParts.shift();
  var segment = "";
  for (var i = 0; i < segmParts.length; i++) {
    segment += '/' + segmParts[i];
  }
  
  for (var j = 1; j < gHistogramFilterObjects.length; j++) {
    var segmParts = gHistogramFilterObjects[j].histogramfilter('state').split("/");
    var currentVersion = segmParts[0] + '/' + segmParts[1];    
    gHistogramFilterObjects[j].histogramfilter('state', currentVersion+segment);
  }

  updateUrlHashIfNeeded();
}

function addMultipleSelect(options, changeCb) {
  var selector = $("<select multiple id=optSelector>");
  selector.addClass("multiselect");
  $('#multipercentile').empty().append(selector);
  var n = options.length;
  for (var i = 0; i < n; i++) {
    var option = options[i];
    var label = option;
    // Add <option>
    selector.append($("<option>", {
      text: label,
      value: option,
    }));
  }
  $("#optSelector").val(options);
  $("#optSelector").change(function () {
    changeCb(selector);
    updateUrlHashIfNeeded();
  });
  updateUrlHashIfNeeded();
  selector.multiselect();
}


Telemetry.init(function () {  
  var versions = Telemetry.versions();
//todo
  //ralu
  createButtonTinyMe();
  var pageState = urlHashToPageState(window.location.hash);
  if (!restoreFromPageState(pageState, {})) {
    addFilter(true, null); //  first filter
    gSyncWithFirst = true;
  }

  $(window).bind("hashchange", function(){ 
    var curPageState = computePageState();
    var newPageState = urlHashToPageState(window.location.hash);
    restoreFromPageState(newPageState, curPageState);
  });
  

  $("#addVersionButton").click(function () {
    var state = null;
    if  (gHistogramFilterObjects.length != 0) {
      state = gHistogramFilterObjects[0].histogramfilter('state');
    }

    addFilter(false, state);
    $('#histogram-table').hide();
    setVisible = false;
    /*
    if (document.getElementById("summary") !== null) {
      document.getElementById("summary").remove();
      document.getElementById('summaryDetails').remove();
    }
    document.getElementById('measure').remove();
    document.getElementById('description').remove();
    document.getElementById('renderHistogram').remove();
    */
    updateUrlHashIfNeeded();
  });

  $('input[name=evo-type]:radio').change(function () {
    var evoType = $('input[name=evo-type]:radio:checked').val();
    gHistogramFilterObjects.forEach(function(x){
      x.histogramfilter('option', 'evolutionOver', evoType);
    });
    updateUrlHashIfNeeded();
  });

  $('input[name=render-type]:radio').change(function () {
    plot(true);
    // TODO: add updateUrlHashIfNeeded + add to state?
  });

  $('input[name=sanitize-pref]:checkbox').change(function () {
    plot(true);
    updateUrlHashIfNeeded();
  });
});

/** Format numbers */

function fmt(number) {
  if (number == Infinity) return "Infinity";
  if (number == -Infinity) return "-Infinity";
  if (isNaN(number)) return "NaN";
  var prefix = d3.formatPrefix(number, 's');
  return Math.round(prefix.scale(number) * 100) / 100 + prefix.symbol;
}

function createRemoveButton(parent) {
  var button = $('<button type="button" class="btn btn-default " >');
  $('<span class="glyphicon glyphicon-remove">').appendTo(button);
  parent.append(button);
  button.click(function () {
    parent.remove();
    gHistogramFilterObjects = gHistogramFilterObjects.filter(function (x) {
      return x !== parent;
    });
    plot(false);
    updateUrlHashIfNeeded();
  });
  return button;
}

function changeLockButton(newValue) {
  if (gSyncWithFirst === newValue) {
    return;
  }

  gSyncWithFirst = newValue;
  var lockButton = $("#lock-button");
  if (!gSyncWithFirst) {
    lockButton.removeClass("glyphicon-lock");
    lockButton.addClass("glyphicon-ok");

  } else {
    lockButton.addClass("glyphicon-lock");
    lockButton.removeClass("glyphicon-ok");
  }

  gHistogramFilterObjects.slice(1).forEach(function (x) {
    x.histogramfilter('option', 'locked', gSyncWithFirst);
  });

  if (gSyncWithFirst) {
    syncStateWithFirst();
  }

  plot(false);

}
//ralu
function createButtonTinyMe()
{
  var valOfTyniUrl;
  var button = $('<button type="button" class="btn btn-default">');
  button.addClass("glyphicon glyphicon-leaf");
  button.text(" tinyMe");

  $("#tinyMe").append(button);
  button.click(function(){
    var request = {
      url: "https://api-ssl.bitly.com/shorten",

      // tell jQuery we're expecting JSONP
      dataType: "jsonp",

      // tell YQL what we want and that we want JSON
      data: {
        longUrl: window.location.href ,  access_token: "48ecf90304d70f30729abe82dfea1dd8a11c4584",
        format: "json"
      },

      // work with the response
      success: function( response ) {
        var longUrl = Object.keys(response.results)[0];
        var shortUrl = response.results[longUrl].shortUrl;
        valOfTyniUrl = "tiny url for this state is: " + " " + shortUrl;
        var tiny = $("<div>");
        //maibe we don't want to append ..we'll see
        tiny.append(valOfTyniUrl);
        $("#tinyMe").append(tiny);
      }
    };


    var response = $.ajax(request);

  })

  }

function createLockButton(parent){
  var button = $('<button type="button" class="btn btn-default " >');
  var span = $('<span id="lock-button" class="glyphicon">');

  span.addClass(gSyncWithFirst ? "glyphicon-lock" : "glyphicon-ok");
  span.appendTo(button);

  parent.append(button);
  button.click(function() {
    changeLockButton(!gSyncWithFirst);
  });
  return button;
}
var allChachedStates = {};
function addFilter(firstHistogramFilter, state) {
  var f = $("<div>");
  if (firstHistogramFilter) {
    createLockButton(f);
  } else {
    createRemoveButton(f);
  }
  
  $('#newHistoFilter').append(f);
  var locked = false;
  if (gHistogramFilterObjects.length >= 1 && gSyncWithFirst) {
    locked = true;
  }
    f.histogramfilter({
    synchronizeStateWithHash: false,
    defaultVersion: function (versions) {
      var nightlies = versions.filter(function (version) {
        return version.substr(0, 8) == "nightly/";
      });
      nightlies.sort();
      return nightlies.pop() || versions.sort().pop();
    },
    selectorType: BootstrapSelector,
    locked: locked,
    state: state,
    evolutionOver: $('input[name=evo-type]:radio:checked').val(),
  });
  f.bind("histogramfilterchange", function() { plot(firstHistogramFilter); });
  gHistogramFilterObjects.push(f);
}


function renderHistogramTable(hgram) {
  $('#histogram').hide();
  $('#histogram-table').hide();
  if(setVisible == true) {
    $('#histogram-table').show();
  }

  var body = $('#histogram-table').find('tbody')
  body.empty();

  body.append.apply(body, hgram.map(function (count, start, end, index) {
    return $('<tr>').append($('<td>').text(fmt(start))).append($('<td>').text(fmt(end))).append($('<td>').text(fmt(count)));
  }));
}

function renderHistogramGraph(hgram) {
  $('#histogram-table').hide();
  $('#histogram').hide();
  if(setVisible == true) {
    $('#histogram').show();
  }
  
  nv.addGraph(function () {
    var total = hgram.count();
    var vals = hgram.map(function (count, start, end, index) {
      return {
        x: [start, end],
        y: count,
        percent: count / total
      };
    });

    var data = [{
      key: "Count",
      values: vals,
      color: "#0000ff"
    }];

    var chart = histogramchart().margin({
      top: 20,
      right: 80,
      bottom: 40,
      left: 80
    });
    chart.yAxis.tickFormat(fmt);
    chart.xAxis.tickFormat(function (bucket) {
      return fmt(bucket[0]);
    });
    d3.select("#histogram").datum(data).transition().duration(500).call(chart);

    nv.utils.windowResize(

    function () {
      chart.update();
    });
    return chart;
  });
}

var renderHistogramTime = null;
var lastHistogramEvo = null;
var _exportHgram = null;
var _lastBlobUrl = null;
// Generate download on mousedown
$('#export-link').mousedown(function () {
  if (_lastBlobUrl) {
    URL.revokeObjectURL(_lastBlobUrl);
    _lastBlobUrl = null;
  }
  var csv = "start,\tend,\tcount\n";
  csv += _exportHgram.map(function (count, start, end, index) {
    return [start, end, count].join(",\t");
  }).join("\n");

  _lastBlobUrl = URL.createObjectURL(new Blob([csv]));
  $('#export-link')[0].href = _lastBlobUrl;
  $('#export-link')[0].download = _exportHgram.measure() + ".csv";
});

function update(hgramEvos) {
  var evosVals = [];
  $.each(hgramEvos, function (key, value) {
    evosVals.push(value);
  });
  var hgramEvo = evosVals[0];
  if (hgramEvos === undefined || hgramEvos === []) {
    return;
  }
  if (!hgramEvos) {
    hgramEvos = lastHistogramEvos;
  }
  lastHistogramEvos = hgramEvos;

  var datas = [];
  var labels = [];

  $.each(hgramEvos, function (state, evo) {
    var series = prepareData(evo);
    for (var x in series) {
      labels.push(series[x].key);
    }
    $.each(series, function(i, entry) {
      entry.tableState = state;
      entry.tableKey = entry.key;
      entry.key = state + ": " + entry.key;
    });

    datas.push(series);
  });


  // from list of lists to list
  cDatas = [].concat.apply([], datas);
  function unique(array) {
    return $.grep(array, function (el, index) {
      return index == $.inArray(el, array);
    });
  }

  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());

  $("#measure").text(hgramEvo.measure());
  $("#description").text(hgramEvo.description());

  function updateProps(extent) {
    var hgram;
    var dates = hgramEvo.dates();
    if (extent) {
      var start = new Date(extent[0]);
      var end = new Date(extent[1]);
      // Normalize dates
      start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      hgram = hgramEvo.range(start, end);
      // Filter dates
      dates = dates.filter(function (date) {
        return start <= date && date <= end;
      });
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
    $('#prop-kind').text(hgram.kind());
    $('#prop-submissions').text(fmt(hgram.submissions()));
    $('#prop-count').text(fmt(hgram.count()));
    $('#prop-dates').text(d3.format('s')(dates.length));
    $('#prop-date-range').text(dateRange);

    // Set linear only properties
    if (hgram.kind() == 'linear') {
      $('#prop-mean').text(fmt(hgram.mean()));
      $('#prop-standardDeviation').text(fmt(hgram.standardDeviation()));
    }

    // Set exponential only properties
    if (hgram.kind() == 'exponential') {
      $('#prop-mean2').text(fmt(hgram.mean()));
      $('#prop-geometricMean').text(fmt(hgram.geometricMean()));
      $('#prop-geometricStandardDeviation').text(fmt(hgram.geometricStandardDeviation()));
    }

    // Set percentiles if linear or exponential
    if (hgram.kind() == 'linear' || hgram.kind() == 'exponential') {
      $('#prop-p5').text(fmt(hgram.percentile(5)));
      $('#prop-p25').text(fmt(hgram.percentile(25)));
      $('#prop-p50').text(fmt(hgram.percentile(50)));
      $('#prop-p75').text(fmt(hgram.percentile(75)));
      $('#prop-p95').text(fmt(hgram.percentile(95)));
    }

    if (renderHistogramTime) {
      clearTimeout(renderHistogramTime);
    }
    renderHistogramTime = setTimeout(function () {
      var renderType = $('input[name=render-type]:radio:checked').val();
      if (renderType == 'Table') {
        renderHistogramTable(hgram);
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

    var submissions = hgramEvo.map(function (date, hgram) {
      if (hgram.submissions() > maxSubmissions) {
        maxSubmissions = hgram.submissions();
      }

      return {
        x: date.getTime(),
        y: hgram.submissions()
      };
    });

    var data = [{
      key: "Submissions",
      bar: true,
      // This is hacked :)
      yAxis: 2,
      values: submissions,
    }];

    // Don't crap up the percentiles / means with lines based on a tiny number
    // of submissions. Flatten them all to zero if there are less than this
    // many submissions.
    // The cutoff is the lesser of 100 or 1% of the maximum number of
    // submissions we saw.
    var submissionsCutoff = Math.min(maxSubmissions / 100, 100);

    if (hgramEvo.kind() == 'linear' || hgramEvo.kind() == 'exponential') {
      var means = [];
      // Percentile series
      var ps = {};
      [5, 25, 50, 75, 95].forEach(function (p) {
        ps[p] = [];
      });
      hgramEvo.each(function (date, hgram) {
        date = date.getTime();
        if (!sanitizeData || hgram.submissions() >= submissionsCutoff) {
          var mean = hgram.mean();
          if (mean >= 0) {
            means.push({
              x: date,
              y: mean
            });
          }[5, 25, 50, 75, 95].forEach(function (p) {
            var v = hgram.percentile(p);
            // Weird negative values can cause d3 etc. to freak out - see Bug 984928 
            if (v >= 0) {
              ps[p].push({
                x: date,
                y: v
              });
            }
          });
        } else {
          // Set everything to zero to keep the graphs looking nice.
          means.push({
            x: date,
            y: 0
          });
          [5, 25, 50, 75, 95].forEach(function (p) {
            ps[p].push({
              x: date,
              y: 0
            });
          });
        }
      });
      data.push({
        key: "Mean",
        yAxis: 1,
        values: means,
      }, {
        key: "5th percentile",
        yAxis: 1,
        values: ps['5'],
      }, {
        key: "25th percentile",
        yAxis: 1,
        values: ps['25'],
      }, {
        key: "median",
        yAxis: 1,
        values: ps['50'],
      }, {
        key: "75th percentile",
        yAxis: 1,
        values: ps['75'],
      }, {
        key: "95th percentile",
        yAxis: 1,
        values: ps['95'],
      });
    }
    return data;
  }
  nv.addGraph(function () {
    //top was 10
    var focusChart = evolutionchart().margin({
      top: 10,
      right: 80,
      bottom: 40,
      left: 80
    });

    focusChart.xAxis.tickFormat(function (d) {
      return d3.time.format('%Y/%m/%d')(new Date(d));
    });
    focusChart.x2Axis.tickFormat(function (d) {
      return d3.time.format('%Y/%m/%d')(new Date(d));
    });
    focusChart.y1Axis.tickFormat(fmt);
    focusChart.y2Axis.tickFormat(fmt);
    focusChart.y3Axis.tickFormat(fmt);
    focusChart.y4Axis.tickFormat(fmt);

    d3.select("#evolution").datum(cDatas).transition().duration(500).call(focusChart);

    nv.utils.windowResize(function () { focusChart.update(); });

    focusChart.setSelectionChangeCallback(updateProps);

    function endsWith(str, suffix) {
      suffix = ": " + suffix;
      return str.indexOf(suffix, str.length - suffix.length) !== -1;
    }
    labels = unique(labels);


    addMultipleSelect(labels, function (selector) {
      var toBeSelected = selector.val();
      if (toBeSelected === null) toBeSelected = [];
      for (var i = 0; i < cDatas.length; i++) {
        if (isKeySelected(cDatas[i].originalKey, toBeSelected)) {
          agregates = toBeSelected;
          cDatas[i].disabled = false;
        } else {
          cDatas[i].disabled = true;
        }
      }
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
  
  
  