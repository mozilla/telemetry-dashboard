var setVisible = true;
var gHistogramEvolutions = {};
var gHistogramFilterObjects = [];
var gSyncWithFirst = false;
var gStatesOnPlot = [];
var cachedData = {};//if data was prepared once never do it again
var cookie;
var oldSelectionFromUrl = "";
function setCookie(cname,cvalue,exdays)
{
  var d = new Date();
  d.setTime(d.getTime()+(exdays*24*60*60*1000));
  var expires = "expires="+d.toGMTString();
  document.cookie = cname + "=" + cvalue + "; " + expires;
}

function getCookie(cname)
{
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i=0; i < ca.length; i++)
  {
    var c = ca[i].trim();
    if (c.indexOf(name)==0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function checkCookie()
{
  var stateFromUrl=getCookie("stateFromUrl");
  if (stateFromUrl!="" && stateFromUrl != null)
  {
    return stateFromUrl;
  }
  else
  {
    return "";
  }
}

function prepareData(state, hgramEvo) {
  var maxSubmissions = 0;
  // Whether we actually filter submissions is controllable via the
  // 'sanitize-pref' preference.
  var sanitizeData = $('input[name=sanitize-pref]:checkbox').is(':checked');
  var pgState = computePageState();
  dataKey = state +" " + pgState.sanitize + " " + pgState.evoOver;
  if (dataKey in cachedData) {
    console.log("@_@I do have this in my cache  where dataKey is ", dataKey);
    console.log("@_@The cached data is ", cachedData[dataKey]);
    return cachedData[dataKey];
  }

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
  var pgState = computePageState();
  dataKey = state +" " + pgState.sanitize + " " + pgState.evoOver;
  console.log("^_^ I just cached data    ", data,  "with this dataKey    ", dataKey);
  cachedData[dataKey] = data;
  return data;
}

function computePageState() {
  var pageState = {};
  pageState.filter = [];
  for (var i = 0; i < gHistogramFilterObjects.length; i++) {
    pageState.filter.push(gHistogramFilterObjects[i].histogramfilter('state'));
  }


  // TODO: doesn't work!
  pageState.aggregates = $("#aggregateSelector").multiselect("getSelected").val();
  if (pageState.aggregates === undefined || pageState.aggregates === null) {
    pageState.aggregates = [];
  }

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
  console.log("I am in restoreFromPageState", newPageState);
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

    addHistogramFilter(true, states[0]);
    if (states.length == 1) {
      setVisible = true;
    }

    for (var i = 1; i < states.length; i++) {
      addHistogramFilter(false, states[i]);
    }


    // TODO: re-enable?
    if (states.length > 1 ) {
      if (document.getElementById("summary") !== null)
        document.getElementById("summary").remove();
      if (document.getElementById('summaryDetails') !== null)
        document.getElementById('summaryDetails').remove();
      if (document.getElementById('renderHistogram') !== null) {
        $('#histogram').hide();
        $('#histogram').remove();
        document.getElementById('renderHistogram').remove();
      }

    }

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
    // TODO: $("#aggregateSelector").val(newPageState.aggregates);
    if (oldSelectionFromUrl == "")
        oldSelectionFromUrl = newPageState.aggregates;
    console.log("i've got this aggregates", newPageState.aggregates);
    console.log("what does jquery returns",  $('#multipercentile').selector);
    console.log("oldSelectionFromUrl is ", oldSelectionFromUrl);
    if ("oldSelectionFromUrl" !== "")
    {
      /*$("#aggregateSelector option").each(function() { prevOptions.push($(this).val()); });
      var prevSelected = $("#aggregateSelector").multiselect("getSelected").val() || [];
      var selector = $("<select multiple id=aggregateSelector>");
      selector.addClass("multiselect");*/

    }


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
    url = url.slice(1);  //drop #
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
  if (!arraysEqual(pageState.filter, urlPageState.filter) ||
      !arraysEqual(pageState.aggregates, urlPageState.aggregates) ||
      "" + pageState.locked !== "" + urlPageState.locked ||
      "" + pageState.evoOver !== "" + urlPageState.evoOver ||
      "" + pageState.sanitize !== "" + urlPageState.sanitize) {

    window.location.hash = pageStateToUrlHash(pageState);
    cookie = pageStateToUrlHash(pageState);
    setCookie("stateFromUrl",cookie,3);

  }
}

function anyHsLoading() {
  var anyLoading = false;
  gHistogramFilterObjects.forEach(function (filter) {
    if (!filter.histogramfilter('histogram')) {
      anyLoading = true;
    }
  })
  return anyLoading;
}

// `firstChanged true if first filter changed and I need to sync all hidden filters
function plot(firstChanged) {
  if (anyHsLoading()) {
    $("#content").fadeOut();
    $("#spinner").fadeIn();
    return;
  }

  $("#content").fadeIn();
  $("#spinner").fadeOut();

  gHistogramEvolutions = {};

  if (firstChanged && gSyncWithFirst) {
    syncStateWithFirst();
  }


  var filterStates = {};
  gHistogramFilterObjects.forEach(function (hfilter) {
    filterStates[hfilter.histogramfilter("state")] = 1; });
  //FIX ME
  if (arraysEqual(gStatesOnPlot, Object.keys(filterStates))) {
    console.log("got the same old filters: ", gStatesOnPlot, Object.keys(filterStates));
    return;
  }

  gStatesOnPlot = Object.keys(filterStates);
  gHistogramFilterObjects.forEach(function (f) {
    var hist = f.histogramfilter('histogram');
    if (hist != null){
      gHistogramEvolutions[f.histogramfilter('state')] = hist;
    }
  });
  update(gHistogramEvolutions);
  updateUrlHashIfNeeded();
}


function syncStateWithFirst() {  
  if (gHistogramFilterObjects.length == 0 ) {
    return;
  }

  if (anyHsLoading()) {
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
   //XXX
  //updateUrlHashIfNeeded();
}


function setAggregateSelectorOptions(options, changeCb) {
  var prevOptions = [];
  $("#aggregateSelector option").each(function() { prevOptions.push($(this).val()); });
  var prevSelected = $("#aggregateSelector").multiselect("getSelected").val() || [];
  var selector = $("<select multiple id=aggregateSelector>");
  selector.addClass("multiselect");


  if (!arraysEqual(prevOptions, options)) {
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
  }

  selector.multiselect({
    includeSelectAllOption: true,
    onChange : function(option, checked) {
      changeCb();
      //XXX
      //updateUrlHashIfNeeded();
    }
  });

  // If "Select All" is checked, select all the new options.
  if (prevSelected.length === 0 || prevSelected.indexOf("multiselect-all") !== -1) {
    selector.multiselect("select", options);
  } else {
    selector.multiselect("select", prevSelected);

  }
   //XXX
  //updateUrlHashIfNeeded();
}


Telemetry.init(function () {
  createButtonTinyUrl();

  var cookie = checkCookie();
  var pageState = urlHashToPageState(window.location.hash);

  if (cookie && !restoreFromPageState(pageState, {})) {
    console.log("I do have a cookie!    ", cookie);
    //cookie should be set from #
    var pgState = urlHashToPageState(cookie);
    console.log("my page state is ", pgState);
    restoreFromPageState(pgState, {});
  } else if (!restoreFromPageState(pageState, {})) {
      addHistogramFilter(true, null); //  first filter
      changeLockButton(true);
  }
  $(window).bind("hashchange", function () {
    var curPageState = computePageState();
    var newPageState = urlHashToPageState(window.location.hash);
    restoreFromPageState(newPageState, curPageState);

  });

  $("#addVersionButton").click(function () {
    var state = null;
    if (gHistogramFilterObjects.length != 0) {
      state = gHistogramFilterObjects[0].histogramfilter('state');
    }

    addHistogramFilter(false, state);
    $('#histogram-table').hide();
    setVisible = false;

    if (document.getElementById("summary") !== null) {
      document.getElementById("summary").remove();
      document.getElementById('summaryDetails').remove();
    }

    if (document.getElementById('measure') !== null)
      document.getElementById('measure').remove();
    if (document.getElementById('description') !== null)
      document.getElementById('description').remove();
    if (document.getElementById('renderHistogram') !== null) {
      $('#histogram').hide();
      document.getElementById('renderHistogram').remove();
    }

    updateUrlHashIfNeeded();
  });

  $('input[name=evo-type]:radio').change(function () {
    var evoType = $('input[name=evo-type]:radio:checked').val();
    gHistogramFilterObjects.forEach(function (x) {
      x.histogramfilter('option', 'evolutionOver', evoType);
    });
    plot(false);
    updateUrlHashIfNeeded();
  });

  $('input[name=render-type]:radio').change(function () {
    plot(true);
    // TODO: add updateUrlHashIfNeeded + add to state?
  });

  $('input[name=sanitize-pref]:checkbox').change(function () {
    plot(true);
    //XXX
    //updateUrlHashIfNeeded();
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
//I need this here for a corner case -- when got two identical filters, remove one the url needs to be updated even if I don't make a plot
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
  } else {
  //  updateUrlHashIfNeeded();
  }
  updateUrlHashIfNeeded();
  plot(false);

}

function createButtonTinyUrl()
{
  var valOfTinyUrl;
  var button = $('<button type="button" class="btn btn-default">');
  button.text(" tinyUrl");
  $("#tinyUrl").append(button);
  var tiny = $("<div>");
  $("#tinyUrl").append(tiny);


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
        valOfTinyUrl = "tiny url for this state is: " + " " + shortUrl;
        tiny.remove();
        tiny = $("<div>");
        tiny.append(valOfTinyUrl);
        $("#tinyUrl").append(tiny);
      }
    };
    $.ajax(request);

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

function addHistogramFilter(firstHistogramFilter, state) {
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
  f.bind("histogramfilterchange", function(event, args) {
    if (args.doneLoading)
      plot(firstHistogramFilter); });
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
      //chart.update();
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
    var series = prepareData(state,evo);
    for (var x in series) {
      labels.push(series[x].key);
    }

    // shallow clone for each item: don't change the original series because it's cached by prepareData.
    series = series.map(function(e) {
      var d = {};
      $.each(e, function (k, v) {
        d[k] = v;
      });
      return d;
    });

    $.each(series, function(i, entry) {
      entry.tableState = state;
      entry.tableKey = entry.key;
      entry.key = state + ": " + entry.key;
    });

    datas.push(series);
  });


  // from list of lists to list
  var cDatas = [].concat.apply([], datas);
  function unique(array) {
    return $.grep(array, function (el, index) {
      return index == $.inArray(el, array);
    });
  }

  function updateDisabledAggregates() {
    var toBeSelected = $("#aggregateSelector").multiselect("getSelected").val();
    console.log("updateDisabledAggregates toBeSelected:", toBeSelected, cDatas);

    if (toBeSelected === undefined) {
      return;
    }

    if (toBeSelected === null) toBeSelected = [];
    // toBeSelected is [] when nothing is selected, and we set all .disabled=true
    console.log("updateDisabledAggregateX toBeSelected:", toBeSelected, cDatas);

    for (var i = 0; i < cDatas.length; i++) {
      if (toBeSelected.indexOf(cDatas[i].tableKey) !== -1 && toBeSelected.length !== 0) {
        cDatas[i].disabled = false;
      } else {
        cDatas[i].disabled = true;
      }
    }
  }
  updateDisabledAggregates();

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

    // Fix nvd3 bug: addGraph called on a non-empty svg breaks tooltips.
    // Clear the svg to avoid this.
    $("#evolution").empty();
    d3.select("#evolution").datum(cDatas).call(focusChart);

    nv.utils.windowResize(function () { focusChart.update(); });

    focusChart.setSelectionChangeCallback(updateProps);

    labels = unique(labels);



    setAggregateSelectorOptions(labels, function () {
      updateDisabledAggregates();
      focusChart.update();
    });
  });

  updateProps();
}


  
  
  