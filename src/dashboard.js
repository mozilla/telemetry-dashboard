//naming convention gVariableName - global var
var gSingleSeriesMode = true;
var gHistogramFilterObjects = [];
var gSyncWithFirst = true;
var gStatesOnPlot = [];
var cachedData = {};//if data was prepared once never do it again
var gHashSetFromCode = false;

function event() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('event');
  args.unshift('send');
  ga.call(ga, args)
  //console.log("Event: " + args.join(' > '));
}

function setCookie(cname, cvalue, exdays) {
  var d = new Date();
  d.setTime(d.getTime() + (exdays * 24 * 60 * 60 * 1000));
  var expires = "expires=" + d.toGMTString();
  document.cookie = cname + "=" + cvalue + "; " + expires;
}

function setUrlHash(hash) {
  gHashSetFromCode = true;
  window.location.hash = hash;
  setCookie("stateFromUrl", hash, 3);
}

function getCookie(cname) {
  var name = cname + "=";
  var ca = document.cookie.split(';');
  for(var i=0; i < ca.length; i++) {
    var c = ca[i].trim();
    if (c.indexOf(name)==0) {
      return c.substring(name.length, c.length);
    }
  }
  return "";
}

function readCookie() {
  var stateFromUrl = getCookie("stateFromUrl");
  if (stateFromUrl != "" && stateFromUrl != null) {
    return stateFromUrl;
  } else {
    return "";
  }
}

//if cached return data in not prepare it and cache it
function prepareData(state, hgramEvo) {
  var maxSubmissions = 0;
  // Whether we actually filter submissions is controllable via the
  // 'sanitize-pref' preference.
  var sanitizeData = $('input[name=sanitize-pref]:checkbox').is(':checked');
  var pgState = getPageState();
  dataKey = state + " " + pgState.evoOver + " " +  pgState.sanitize;
  if (dataKey in cachedData) {
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
  cachedData[dataKey] = data;
  return data;
}

function getPageState() {
  var pageState = {};
  pageState.filter = [];
  for (var i = 0; i < gHistogramFilterObjects.length; i++) {
    pageState.filter.push(gHistogramFilterObjects[i].histogramfilter('state'));
  }

  pageState.aggregates = $("#aggregateSelector").multiselect("getSelected").val();
  if (pageState.aggregates === undefined || pageState.aggregates === null) {
    pageState.aggregates = [];
  }
  pageState.aggregates = pageState.aggregates.filter(function(e) { return e !== "";});
  pageState.evoOver = $('input[name=evo-type]:radio:checked').val();
  pageState.locked = gSyncWithFirst;
  pageState.sanitize = $('input[name=sanitize-pref]:checkbox').is(':checked');
  pageState.renderhistogram = $('input[name=render-type]:radio:checked').val();
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

function toBoolean(x) {
  if (x === "true" || x === true)
    return true;
  if (x === "false" || x === false)
    return false;
  throw new Error("a boolean could not be inferred from x = " + x );
}

//take params from obj pageState and restore the page by setting all the attributes
function restoreFromPageState(newPageState, curPageState) {
  if (newPageState === undefined ||
    newPageState.filter === undefined ||
    newPageState.filter.length === 0) {
    return false;
  }

  if (newPageState.sanitize !== undefined) {
    $('input[name=sanitize-pref]:checkbox').prop('checked', toBoolean(newPageState.sanitize));
  }

  if (newPageState.evoOver !== undefined) {
    $('input[name=evo-type][value=' + newPageState.evoOver + ']:radio').prop("checked", true);

  }

  if (!arraysEqual(newPageState.filter, curPageState.filter)) {
    $('#histogram-filters').empty();

    gHistogramFilterObjects = [];

    var states = newPageState.filter;
    addHistogramFilter(true, states[0]);
    if (states.length == 1) {
      gSingleSeriesMode = true;
      $('.single-histogram-only').show();
    }

    for (var i = 1; i < states.length; i++) {
      addHistogramFilter(false, states[i]);
    }

    if (states.length > 1 ) {
      gSingleSeriesMode = true;
      $("#histogram").hide();
      $('#histogram-table').hide();
      $('.single-histogram-only').hide();
    }
  }
  $('input:radio[name=render-type]').val([newPageState.renderhistogram + ""]);
  $('input:radio[name=render-type]').trigger("click");

  if (newPageState.renderhistogram !== undefined && gHistogramFilterObjects.length == 1) {
    gSingleSeriesMode = true;
    $('input:radio[name=render-type]').val([newPageState.renderhistogram + ""]);
    $("#histogram").show();
  }

  if (newPageState.locked !== undefined) {
    changeLockButton(toBoolean(newPageState.locked));
    if (newPageState.locked) {
      var x = states[0].split('/');
      x.shift();
      x.shift();
      var y = x.join("/")
      $("#measure").text(y);
    }
  }

  if (newPageState.aggregates !== undefined) {
    setAggregateSelectorOptions(newPageState.aggregates, function() {
    }, false);
  }

  return true;
}

//encode page state in url
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

//if something changed in the page state update url
function updateUrlHashIfNeeded() {
  if (gHistogramFilterObjects.length === 0) {
    return;
  }

  if (anyHsLoading()) {
    return;
  }

  var pageState = getPageState();
  if (window.location.hash.split("#")[1] === pageStateToUrlHash(pageState)) {
    return;
  }
  setUrlHash(pageStateToUrlHash(pageState));
}

//check if filters are loading
function anyHsLoading() {
  var anyLoading = false;
  gHistogramFilterObjects.forEach(function (filter) {
    if (!filter.histogramfilter('histogram')) {
      anyLoading = true;
    }
  });
  return anyLoading;
}

function gaLogFilter(state) {
  event('states', 'changed', state, 1);
  var parts = state.split('/');
  event( 'states', 'channel', parts[0], 1);
  event( 'version', parts[1], 1);
  event('states', 'measure', parts[2], 1);
  event('states', 'filter', parts.slice(3).join('/'), 1);
}

//firstChanged true if first filter changed and I need to sync all hidden filters
function plot(firstChanged) {
  if (anyHsLoading()) {
    $("#content").fadeOut();
    $("#spinner").fadeIn();
    return;
  }

  if (gHistogramFilterObjects.length !== 0) {
    // Send new state to google analytics
    gHistogramFilterObjects.forEach(function(f) {
      var state = f.histogramfilter('option', 'state');
    });
  }

  $("#content").fadeIn();
  $("#spinner").fadeOut();

  if (firstChanged && gSyncWithFirst) {
    syncStateWithFirst();
  }

  var pgState = getPageState();

  var filterStates = {};
  gHistogramFilterObjects.forEach(function (hfilter) {
    var key = hfilter.histogramfilter("state") + " " + pgState.evoOver + " " + pgState.sanitize;
    filterStates[key] = 1;
  });

  if (arraysEqual(gStatesOnPlot, Object.keys(filterStates))) {
    return;
  }

  if (!anyHsLoading()) {
    gStatesOnPlot = Object.keys(filterStates);
  }

  var hgramEvos = {};
  gHistogramFilterObjects.forEach(function (f) {
    var hist = f.histogramfilter('histogram');
    if (hist != null){
      hgramEvos[f.histogramfilter('state')] = hist;
    }
  });

  update(hgramEvos);
}

//if lock == true all filters are sync with first
function syncStateWithFirst() {
  if (gHistogramFilterObjects.length == 0 || anyHsLoading()) {
    return;
  }

  var stateSegment = gHistogramFilterObjects[0].histogramfilter('state');
  var segmParts = stateSegment.split("/");
  segmParts.shift();
  segmParts.shift();
  var segment = segmParts.join("/");
  segment = "/" + segment;
  for (var j = 1; j < gHistogramFilterObjects.length; j++) {
    var segmParts = gHistogramFilterObjects[j].histogramfilter('state').split("/");
    var currentVersion = segmParts[0] + '/' + segmParts[1];
    gHistogramFilterObjects[j].histogramfilter('state', currentVersion + segment);
  }

  var x = gHistogramFilterObjects[0].histogramfilter('state').split("/");
  x.shift();
  x.shift();
  var y = x.join("/");
  $("#measure").text(y);
  $('#measure').show();
}

//construct selector and set selected aggregates
function setAggregateSelectorOptions(options, changeCb, defaultToAll) {
  if (options.length === 0) {
    return;
  }
  
  var prevOptions = [];
  $("#aggregateSelector option").each(function() { prevOptions.push($(this).val()); });
  var prevSelected = $("#aggregateSelector").multiselect("getSelected").val() || [];
  var selector = $("<select multiple id=aggregateSelector class='selectorPadding'>");

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
    var allOptions = options.join('/');
    event('click', 'aggregates_options', allOptions);

  }

  selector.multiselect({
    includeSelectAllOption: true,
    onChange : function(option, checked) {
      selector.multiselect("updateSelectAll");
      if(option.is(':selected')) {
        event('click', 'aggregates_options', allOptions);
      }
      changeCb();
      updateUrlHashIfNeeded();
    }
  });

  if (prevOptions.length === 0) {
    // first time drawing the selector.
    selector.multiselect("select", options);
    if (defaultToAll) {
      selector.multiselect("updateSelectAll");
    }
  } else {
    // updating existing selector.
    if (prevSelected.indexOf("multiselect-all") !== -1) {
      selector.multiselect("select", options);
      selector.multiselect("updateSelectAll");
    } else {
      selector.multiselect("select", prevSelected);
    }
  }
  changeCb();
  updateUrlHashIfNeeded();
}

Telemetry.init(function () {
  var urlPageState = urlHashToPageState(window.location.hash);
  //if I don't come with a custom url I check for a cookie
  if (!restoreFromPageState(urlPageState, {})) {
    var cookie = readCookie();
    if (cookie) {
      // cookie should be set from #
      var pgState = urlHashToPageState(cookie);
      restoreFromPageState(pgState, {});
    } else {
      // Could not restore from either url or cookie => create a default hs filter.
      addHistogramFilter(true, null); //  first filter
      changeLockButton(true);  // default: locked
    }
  }

  $(window).bind("hashchange", function () {
    if (gHashSetFromCode) {
      gHashSetFromCode = false;
      return;
    }
    var curPageState = getPageState();
    var newPageState = urlHashToPageState(window.location.hash);
    restoreFromPageState(newPageState, curPageState);
  });

  $('input[name=render-type]:radio').change(function () {
    var hgramEvos = {};
    var currentHistogram = gHistogramFilterObjects[0].histogramfilter('histogram');
    if (currentHistogram != null) {
      hgramEvos[gHistogramFilterObjects[0].histogramfilter('state')] = currentHistogram;
      update(hgramEvos);
    }
    // Inform google analytics of click
    var renderType = $('input[name=render-type]:radio:checked').val();
    event('click', 'render-type', renderType);
  });

  if (gHistogramFilterObjects.length > 1) {
    gSingleSeriesMode = false;
    $('.single-histogram-only').hide();
    $('#description').hide();

  }

  $("#addVersionButton").click(function () {
    var state = null;
    event('click', 'addVersion', 'addVersion');

    if (gHistogramFilterObjects.length != 0) {
      state = gHistogramFilterObjects[0].histogramfilter('state');
    }

    addHistogramFilter(false, state);

    gSingleSeriesMode = false;

    $('input[name=render-type]:radio:checked').val(['Graph']);
    if (!gSyncWithFirst) {
      $('#measure').hide();
      $("#description").hide();
    }
    $("#histogram").hide;
    $('#histogram-table').hide();
    //$("#description").hide();
    $('.single-histogram-only').hide();
    updateUrlHashIfNeeded();
  });

  $('#tinyUrl').click(function() {
    event('click', 'tinyUrl', 'generatedTinyUrl');
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
        code.remove();
        code = $("<code>");
        var a = $('<a></a>').attr("href",shortUrl);
        a.text(shortUrl);
        code.append(a);
        $("#tiny").append(code);

      }
    };
    $.ajax(request);

  });

  $('input[name=evo-type]:radio').change(function () {
    var evoType = $('input[name=evo-type]:radio:checked').val();
    // Inform google analytics of click
    gHistogramFilterObjects.forEach(function (x) {
      x.histogramfilter('option', 'evolutionOver', evoType);
    });
    plot(false);
    updateUrlHashIfNeeded();
    event('click', 'evolution-type', evoType);
  });

  $('input[name=sanitize-pref]:checkbox').change(function () {
    plot(true);
    // Inform google analytics of click
    var value = $('input[name=sanitize-pref]:checkbox').is(':checked');
    event('click', 'sanitize-data', value );
  });

  if (gHistogramFilterObjects.length > 1) {
    $('.single-histogram-only').hide();
  }

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
  var button = $('<button type="button" class="btn btn-default " class="button-resize" style="padding: 2px 7px;">');
  $('<span class="glyphicon glyphicon-remove">').appendTo(button);
  parent.append(button);
  button.click(function () {
    event('click', 'removeButton', 'removeButton');
    parent.remove();
    gHistogramFilterObjects = gHistogramFilterObjects.filter(function (x) {
      return x !== parent;
    });

    if (gHistogramFilterObjects.length == 1) {
      gSingleSeriesMode = true;
      var hgramEvos = {};
      var currentHistogram = gHistogramFilterObjects[0].histogramfilter('histogram');
      if (currentHistogram != null) {
        hgramEvos[gHistogramFilterObjects[0].histogramfilter('state')] = currentHistogram;
        update(hgramEvos);
      }
      $('input[value="Graph"]').prop('checked',true);
      $('.single-histogram-only').show();
      $('#measure').show();
      $("#description").show();
      $("#histogram").show();
    }
    plot(false);
    //not sure we need this
    updateUrlHashIfNeeded();
  });
  return button;
}

function createLockButton(parent){
  var button = $('<button type="button" class="btn btn-default " style="padding: 2px 7px;" >');
  var span = $('<span id="lock-button" class="glyphicon">');

  span.addClass(gSyncWithFirst ? "glyphicon-lock" : "glyphicon-ok");
  span.appendTo(button);

  parent.append(button);
  button.click(function() {
    changeLockButton(!gSyncWithFirst);
  });
  return button;
}

function changeLockButton(newValue) {
  if (gSyncWithFirst === newValue) {
    return;
  }
  gSyncWithFirst = newValue;
  var lockButton = $("#lock-button");
  if (!gSyncWithFirst && gHistogramFilterObjects.length !== 1) {
    $("#measure").hide();
    $("#description").hide();
  }

  if (!gSyncWithFirst) {
    lockButton.removeClass("glyphicon-lock");
    lockButton.addClass("glyphicon-ok");
    event('click', 'lockButton', 'edit');

  } else {
    lockButton.addClass("glyphicon-lock");
    lockButton.removeClass("glyphicon-ok");
    var measure = gHistogramFilterObjects[0].histogramfilter('state');
    $('#measure').text(measure);
    event('click', 'lockButton', 'lock');

  }

  gHistogramFilterObjects.slice(1).forEach(function (x) {
    x.histogramfilter('option', 'locked', gSyncWithFirst);
  });

  if (gSyncWithFirst) {
    syncStateWithFirst();
  }
  updateUrlHashIfNeeded();
  plot(false);
}

function addHistogramFilter(firstHistogramFilter, state) {
  var f = $("<div>");
  if (firstHistogramFilter) {
    createLockButton(f);
  } else {
    createRemoveButton(f);
  }

  $('#histogram-filters').append(f);

  var locked = false;

  if (gHistogramFilterObjects.length >= 1 && gSyncWithFirst) {

    locked = gSyncWithFirst;
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
    if (firstHistogramFilter && gSyncWithFirst) {
      syncStateWithFirst();
    }
    if (args.doneLoading) {
      var state = f.histogramfilter('option', 'state');
      gaLogFilter(state);
      plot(firstHistogramFilter);
    }

  });
  gHistogramFilterObjects.push(f);
}

function renderHistogramTable(hgram) {
  $('#histogram').hide();
  $('#histogram-table').hide();
  if (!gSyncWithFirst) {
    $("#description").text(hgram.description()).hide();
    $("#measure").text(hgram.measure()).hide();
  }

  if (gSingleSeriesMode) {
    $("#description").text(hgram.description()).show();
    $("#measure").text(hgram.measure()).show();

    $('#histogram-table').show();
  }
  var body = $('#histogram-table').find('tbody');
  body.empty();

  body.append.apply(body, hgram.map(function (count, start, end, index) {
    return $('<tr>').append($('<td>').text(fmt(start))).append($('<td>').text(fmt(end))).append($('<td>').text(fmt(count)));
  }));
}

function renderHistogramGraph(hgram) {
  $('#histogram-table').hide();
  $('#histogram').hide();
  if (!gSyncWithFirst) {
    $("#description").text(hgram.description()).hide();
    $("#measure").text(hgram.measure()).hide();
  }
  if (gSingleSeriesMode) {
    $("#measure").text(hgram.measure()).show();
    $("#description").text(hgram.description()).show();
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
      function() {
        chart.update();
      }
    );
    return chart;
  });
}

var renderHistogramTime = null;
var lastHistogramEvos = null;
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
  event('click','download csv', 'download csv');
});

var hasReportedDateRangeSelectorUsedInThisSession = false;

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
      entry.fullState = state;
      entry.title = entry.key;
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
    if (toBeSelected === undefined) {
      return;
    }

    if (toBeSelected === null) {
      toBeSelected = [];
    }

    var count = 0;
    for(var j = 0; j < cDatas.length; j++) {
      if (toBeSelected.indexOf(cDatas[j].title) !== -1) {
        count++;
      }
    }
    if (count == 0) {
      toBeSelected = [cDatas[0].title];
      $("#aggregateSelector").children().removeAttr("selected");
      $("#aggregateSelector").multiselect("select", toBeSelected);

    }
    for (var i = 0; i < cDatas.length; i++) {
      if (toBeSelected.indexOf(cDatas[i].title) !== -1 && toBeSelected.length !== 0) {
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
      // Report it the first time the date-range selector is used in a session
      if (!hasReportedDateRangeSelectorUsedInThisSession) {
	     hasReportedDateRangeSelectorUsedInThisSession = true;
       event('report', 'date-range-selector', 'used-in-session', 1);

      }
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
    }, true);

    updateUrlHashIfNeeded();
  });

  updateProps();
}


  
  
  