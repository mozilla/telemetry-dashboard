//naming convention gVariableName - global var
var gSingleSeriesMode = true;
var gHistogramFilterObjects = [];
var gSyncWithFirst = true;
var gStatesOnPlot = [];
var cachedData = {};//if data was prepared once never do it again
var gHashSetFromCode = false;
var gCurrentHistogramPlot = null;
var gCurrentHistogram = null;
var gRangeBarControl = null;

function event() {
  var args = Array.prototype.slice.call(arguments);
  args.unshift('event');
  args.unshift('send');
  ga.apply(ga, args);
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
  var sanitizeData = $('#sanitize-pref').is(':checked');
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
          ps[p].push({
            x: date,
            y: hgram.percentile(p)
          });
        });
      } else {
        // Histogram doesn't have enough submissions, so ignore these points entirely
      }
    });
    data.push({
      key: "Mean",
      values: means,
    }, {
      key: "5th percentile",
      values: ps['5'],
    }, {
      key: "25th percentile",
      values: ps['25'],
    }, {
      key: "median",
      values: ps['50'],
    }, {
      key: "75th percentile",
      values: ps['75'],
    }, {
      key: "95th percentile",
      values: ps['95'],
    });
  }
  cachedData[dataKey] = data;
  return data;
}

// Format a state string like "release/28/saved_session/Firefox/Linux" into a friendlier name like "release 28: Firefox (Linux)"
function formatState(stateString) {
  var stateFilterNames = ["type", "version", "measure", "reason", "product", "OS", "osVersion", "arch"];
  var parts = stateString.split("/");
  var parts = parts.map(function(component, i) {
    return gHistogramFilterObjects[0].histogramfilter("formatOption", stateFilterNames[i], component, parts[2] !== undefined ? parts[2] : null);
  });
  return parts[0] + " " + parts[1] +
    ", " + parts[4] + (parts[7] ? " " + parts[7] : "") +
    (parts[5] ? " (" + parts[5] + (parts[6] ? " " + parts[6] : "") + ")" : "");
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
  pageState.sanitize = $('#sanitize-pref').is(':checked');
  pageState.renderhistogram = $('input[name=render-type]:radio:checked').val();
  return pageState;
}

// Only works on array of objects which can be compared with == (string, numbers, etc.)
function multisetEqual(a, b) {
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
    $('#sanitize-pref').prop('checked', toBoolean(newPageState.sanitize));
  }

  if (newPageState.evoOver !== undefined) {
    $('input[name=evo-type][value=' + newPageState.evoOver + ']:radio').prop("checked", true);
  }

  if (!multisetEqual(newPageState.filter, curPageState.filter)) {
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

  if ($('input:radio[name=render-type]').val() !== newPageState.renderhistogram + "") {
    $('input:radio[name=render-type]').val([newPageState.renderhistogram + ""]);
    $('input:radio[name=render-type]').trigger("click");
  }

  if (newPageState.renderhistogram !== undefined && gHistogramFilterObjects.length == 1) {
    gSingleSeriesMode = true;
    $('input:radio[name=render-type]').val([newPageState.renderhistogram + ""]);
    $("#histogram").show();
  }

  if (newPageState.locked !== undefined) {
    changeLockButton(toBoolean(newPageState.locked));
    if (newPageState.locked) {
      // Set the measure to the state (excluding the version and version number)
      var x = newPageState.filter[0].split('/');
      x.shift();
      x.shift();
      var y = x.join("/")
      $("#measure").text(y);
    }
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
    pageState.aggregates = pageState.aggregates.split("!").filter(function(e) { return e !== "";});
  }
  return pageState;
}

//if something changed in the page state update url
function updateUrlHashIfNeeded() {
  if (gHistogramFilterObjects.length === 0) {
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

  if (multisetEqual(gStatesOnPlot, Object.keys(filterStates))) {
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

// Entry point
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
      var nightlies = Telemetry.versions().sort().filter(function(version) {
        return version.startsWith("nightly/")
      });
      var latest_nightly = nightlies[nightlies.length - 1];
      addHistogramFilter(true, latest_nightly + "/GC_MS/saved_session/Firefox"); //  first filter
      changeLockButton(true);  // default: locked
    }

    $('input[value="Graph"]').prop('checked',true);
  }
  
  $(window).bind("hashchange", function () {
    // Ignore hash changes caused programmatically
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

    var renderType = $('input[name=render-type]:radio:checked').val();
    // Inform google analytics of click
    event('click', 'render-type', renderType);
  });

  if (gHistogramFilterObjects.length > 1) {
    gSingleSeriesMode = false;
    $('.single-histogram-only').hide();
    $('#description').hide();
  }
  
  // Automatically resize range bar
  $(window).resize(function() {
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().outerWidth() - dateControls.outerWidth() - 10);
  });
  
  // Add series button
  $("#addVersionButton").click(function () {
    var state = "nightly/40/SIMPLE_MEASURES_FIRSTPAINT/saved_session/Firefox";
    event('click', 'addVersion', 'addVersion');
    if (gHistogramFilterObjects.length != 0) {
      state = gHistogramFilterObjects[gHistogramFilterObjects.length - 1].histogramfilter('state');
    }
    addHistogramFilter(false, state);
    gSingleSeriesMode = false;

    if (!gSyncWithFirst) {
      $('#measure').hide();
      $("#description").hide();
    }

    $("#histogram").hide;
    $('#histogram-table').hide();
    $('.single-histogram-only').hide();
    updateUrlHashIfNeeded();
  });

  // Shortened permalink button
  $('#tinyUrl').click(function() {
    var tinyUrlArea = $("<input type=text>");
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
      success: function(response) {
        var longUrl = Object.keys(response.results)[0];
        var shortUrl = response.results[longUrl].shortUrl;
        $("#txtContainer").empty();
        tinyUrlArea.val(shortUrl);
        $("#txtContainer").append(tinyUrlArea);
        tinyUrlArea.focus(function() {
          var $this = $(this);
          $this.select();
          // Work around Chrome's little problem(http://stackoverflow.com/questions/5797539)
          $this.mouseup(function() {
            // Prevent further mouseup intervention
            $this.unbind("mouseup");
            return false;
          });
        });
      }
    };

    $.ajax(request);
  });

  // Radio button for changing the plot type
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

  // Toggle whether to throw out data points from sources that haven't submitted enough
  $('#sanitize-pref').change(function () {
    plot(true);
    // Inform google analytics of click
    var value = $('#sanitize-pref').is(':checked');
    event('click', 'sanitize-data', value );
  });

  if (gHistogramFilterObjects.length > 1) {
    $('.single-histogram-only').hide();
  }
});

/** Format numbers to two deciaml places with unit suffixes */
function fmt(number) {
  if (number == Infinity) return "Infinity";
  if (number == -Infinity) return "-Infinity";
  if (isNaN(number)) return "NaN";
  var mag = Math.abs(number);
  var exponent = Math.floor(Math.log10(mag));
  var interval = Math.pow(10, Math.floor(exponent / 3) * 3);
  var units = {1000: "k", 1000000: "M", 1000000000: "B", 1000000000000: "T"};
  if (interval in units) {
    return Math.round(number * 100 / interval) / 100 + units[interval];
  }
  if (interval > 1000000000000) { // Very large value that we don't have a unit for
    return Math.round(number * 100 / interval) / 100 + "e" + Math.log10(interval);
  }
  return Math.round(number * 100) / 100;
}

function unique(array) {
  return $.grep(array, function (el, index) {
    return index == $.inArray(el, array);
  });
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
    defaultMeasure: "SIMPLE_MEASURES_FIRSTPAINT",
    selectorType: CustomSelector,
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

  // Build table after aggregating in the background worker
  var body = $('#histogram-table').find('tbody');
  body.empty();
  Telemetry.doAsync("Histogram_count", hgram, [], function(hgram, total) {
    body.append.apply(body, hgram.map(function (count, start, end, index) {
      return $('<tr>')
        .append($('<td>').text(fmt(start)))
        .append($('<td>').text(fmt(end)))
        .append($('<td>').text(fmt(count)))
        .append($('<td>').text(Math.round(100 * count / total) + "%"));
    }));
  });
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
  } else {
    return;
  }
  
  // Compute chart data values
  Telemetry.doAsync("Histogram_count", hgram, [], function(hgram, total) {
    var tooltipLabels = {};
    var labels = hgram.map(function (count, start, end, index) {
      var label = fmt(start);
      tooltipLabels[label] = fmt(count) + " hits (" + Math.round(100 * count / total, 2) + "%) between " + start + " and " + end;
      return label;
    });
    var maxCount = 0;
    var data = hgram.map(function (count, start, end, index) {
      if (count > maxCount) { maxCount = count; }
      return count;
    });
    
    // Plot the data using Chartjs
    var ctx = document.getElementById("histogram").getContext("2d");
    Chart.defaults.global.responsive = true;
    Chart.defaults.global.animation = false;
    Chart.defaults.global.maintainAspectRatio = false;
    if (gCurrentHistogramPlot !== null) {
      gCurrentHistogramPlot.destroy();
    }
    gCurrentHistogramPlot = new Chart(ctx).Bar({
      labels: labels,
      datasets: [{
        fillColor: "#555555",
        data: data,
      }]
    }, {
      barValueSpacing : 0,
      barDatasetSpacing : 0,
      barShowStroke: false,
      scaleLabel: function(valuesObject) { return fmt(valuesObject.value); },
      tooltipFontSize: 10,
      tooltipTemplate: function(valuesObject) { return tooltipLabels[valuesObject.label] || valuesObject.label; },
      scaleOverride: true,
      scaleSteps : 10,
      scaleStepWidth : maxCount / 10,
      scaleStartValue : 0,
    });
    
    // Assign fixed pseudorandom colors to make it easy to differentiate between bars
    var seed = 0.2;
    gCurrentHistogramPlot.datasets[0].bars.forEach(function(bar) {
      seed = Math.sin(seed) * 10000;
      var hue = Math.floor((seed - Math.floor(seed)) * 256);
      bar.fillColor = "hsla(" + hue + ", 80%, 70%, 0.8)";
    });
    gCurrentHistogramPlot.update();
  });
}

var gCurrentHistogramEvolutionPlots = null;
function renderHistogramEvolution(lines, minDate, maxDate) {
  var drawnLines = lines.filter(function(line) { return !line.disabled; });
  
  // Filter out the points that are outside of the time range
  var minX = maxDate, maxX = minDate, minY = Infinity, maxY = -Infinity;
  var filteredDatasets = drawnLines.map(function (line) {
    return {
      label: line.key,
      strokeColor: line.color,
      data: line.values.filter(function(point) {
        return point.x >= minDate && point.x <= maxDate;
      }).map(function(point) {
        if (point.x < minX) { minX = point.x; }
        if (point.x > maxX) { maxX = point.x; }
        if (point.y < minY) { minY = point.y; }
        if (point.y > maxY) { maxY = point.y; }
        return point;
      }),
    };
  });
  
  // Add a fake series to expand the bounds a bit, which makes the chart look nicer when the timescale is small (within a day or so)
  filteredDatasets.push({
      data: [{x: minX - 1000 * 60 * 60 * 24, y: minY}, {x: maxX + 1000 * 60 * 60 * 24, y: maxY}],
      strokeColor: "rgba(0, 0, 0, 0)",
      pointColor: "rgba(0, 0, 0, 0)",
      pointStrokeColor: "rgba(0, 0, 0, 0)",
  });
  
  // Plot the data using Chartjs
  if (gCurrentHistogramEvolutionPlots !== null) {
    gCurrentHistogramEvolutionPlots.destroy();
  }
  var ctx = document.getElementById("evolution").getContext("2d");
  Chart.defaults.global.responsive = true;
  Chart.defaults.global.animation = false;
  Chart.defaults.global.maintainAspectRatio = false;
  gCurrentHistogramEvolutionPlots = new Chart(ctx).Scatter(filteredDatasets, {
    animation: false,
    scaleType: "date",
    useUtc: false, // All our dates are in the local timezone
    scaleLabel: function(valuesObject) { return fmt(valuesObject.value); },
    tooltipFontSize: 10,
    tooltipTemplate: function(valuesObject) {
      if (valuesObject.datasetLabel === null) { return "Endpoint: " + moment(valuesObject.arg).format("MMM D, YYYY"); }
      return valuesObject.datasetLabel + " - " + valuesObject.valueLabel + " on " + moment(valuesObject.arg).format("MMM D, YYYY");
    },
    multiTooltipTemplate: function(valuesObject) {
      if (valuesObject.datasetLabel === null) { return "Endpoint: " + moment(valuesObject.arg).format("MMM D, YYYY"); }
      return valuesObject.datasetLabel + " - " + valuesObject.valueLabel + " on " + moment(valuesObject.arg).format("MMM D, YYYY");
    },
    bezierCurve: false,
    pointDotStrokeWidth: 0,
    pointDotRadius: 3,
  });
}

var gPreviousBlobUrl = null;
// Generate download on mousedown
$('#export-link').mousedown(function () {
  if (gPreviousBlobUrl) {
    URL.revokeObjectURL(gPreviousBlobUrl);
    gPreviousBlobUrl = null;
  }
  var csv = "start,\tend,\tcount\n";
  csv += gCurrentHistogram.map(function (count, start, end, index) {
    return [start, end, count].join(",\t");
  }).join("\n");

  gPreviousBlobUrl = URL.createObjectURL(new Blob([csv]));
  $('#export-link')[0].href = gPreviousBlobUrl;
  $('#export-link')[0].download = gCurrentHistogram.measure() + ".csv";
  event('click', 'download csv', 'download csv');
});

var gHasReportedDateRangeSelectorUsedInThisSession = false;
var gDrawTimer = null;
var gUserSelectedRange = false;
var gUserMovingRange = false;
var gLastTimeoutID = null;
function updateRendering(hgramEvo, lines, start, end) {
  // Normalize the start and end intervals into unix millisecond timestamps
  var startMoment = moment(start), endMoment = moment(end);
  start = startMoment.toDate().getTime();
  end = endMoment.toDate().getTime();

  // Update the start and end range and update the selection if necessary
  var picker = $("#dateRange").data("daterangepicker");
  picker.setOptions({
    format: "YYYY/MM/DD",
    minDate: startMoment,
    maxDate: endMoment,
    showDropdowns: true,
    ranges: {
       "All": [startMoment, endMoment],
       "Last 30 Days": [endMoment.clone().subtract(30, "days"), endMoment],
       "Last 7 Days": [endMoment.clone().subtract(6, 'days'), endMoment],
    },
  }, function(chosenStart, chosenEnd, label) {
    // Report it the first time the date-range selector is used in a session
    if (!gHasReportedDateRangeSelectorUsedInThisSession) {
     gHasReportedDateRangeSelectorUsedInThisSession = true;
     event('report', 'date-range-selector', 'used-in-session', 1);
    }
    gUserSelectedRange = true;
    updateRendering(hgramEvo, lines, startMoment, endMoment);
    gUserSelectedRange = false;
  });
  if (picker.startDate.isAfter(endMoment) || picker.endDate.isBefore(startMoment)) {
    gUserSelectedRange = false;
  }
  if (!gUserSelectedRange) {
    picker.setStartDate(startMoment);
    picker.setEndDate(endMoment);
  }
  var minDate = picker.startDate.toDate().getTime(), maxDate = picker.endDate.toDate().getTime();
  
  // Rebuild rangebar if it was changed by something other than the user
  if (!gUserMovingRange) {
    gRangeBarControl = RangeBar({
      min: startMoment, max: endMoment.clone().add(1, "days"),
      maxRanges: 1,
      valueFormat: function(ts) { return ts; },
      valueParse: function(date) { return moment(date).valueOf(); },
      label: function(a) {
        var days = (a[1] - a[0]) / 86400000;
        return days < 5 ? days : moment(a[1]).from(a[0], true);
      },
      snap: 1000 * 60 * 60 * 24, minSize: 1000 * 60 * 60 * 24, bgLabels: 0,
    }).on("changing", function(ev, ranges, changed) {
      if (gLastTimeoutID !== null) { clearTimeout(gLastTimeoutID); }
      var range = ranges[0];
      gLastTimeoutID = setTimeout(function() {
        picker.setStartDate(moment(range[0]));
        picker.setEndDate(moment(range[1]).subtract(1, "days"));
        gUserSelectedRange = true;
        gUserMovingRange = true;
        updateRendering(hgramEvo, lines, start, end);
        gUserMovingRange = false;
        gUserSelectedRange = false;
      }, 200);
    });
    $("#range-bar").empty().append(gRangeBarControl.$el);
    var dateControls = $("#date-range-controls");
    $("#range-bar").outerWidth(dateControls.parent().outerWidth() - dateControls.outerWidth() - 10);
    gRangeBarControl.val([[moment(minDate), moment(maxDate)]]);
  }
  
  var hgram;
  hgram = hgramEvo.range(new Date(minDate), new Date(maxDate));
  gCurrentHistogram = hgram;
  
  // Update summary for the first histogram evolution
  var dates = hgramEvo.dates().filter(function(date) { return minDate <= date.getTime() && date.getTime() <= maxDate; });
  $('#prop-kind').text(hgram.kind());
  $('#prop-dates').text(fmt(dates.length));
  $('#prop-date-range').text(moment(dates[0]).format("YYYY/MM/DD") + ((dates.length == 1) ?
    "" : " to " + moment(dates[dates.length - 1]).format("YYYY/MM/DD")));
  Telemetry.doAsync("Histogram_precompute", hgram, [], function(hgram) {
    $('#prop-submissions').text(fmt(hgram.submissions()));
    $('#prop-count').text(fmt(hgram.count()));
    if (hgram.kind() == 'linear') {
      $('#prop-mean').text(fmt(hgram.mean()));
      $('#prop-standardDeviation').text(fmt(hgram.standardDeviation()));
    }
    else if (hgram.kind() == 'exponential') {
      $('#prop-mean2').text(fmt(hgram.mean()));
      $('#prop-geometricMean').text(fmt(hgram.geometricMean()));
      $('#prop-geometricStandardDeviation').text(fmt(hgram.geometricStandardDeviation()));
    }
    if (hgram.kind() == 'linear' || hgram.kind() == 'exponential') {
      $('#prop-p5').text(fmt(hgram.percentile(5)));
      $('#prop-p25').text(fmt(hgram.percentile(25)));
      $('#prop-p50').text(fmt(hgram.percentile(50)));
      $('#prop-p75').text(fmt(hgram.percentile(75)));
      $('#prop-p95').text(fmt(hgram.percentile(95)));
    }
  });
  
  // Schedule redraw of histogram for the first histogram evolution
  if (gDrawTimer) {
    clearTimeout(gDrawTimer);
  }
  gDrawTimer = setTimeout(function () {
    renderHistogramEvolution(lines, minDate, maxDate);
    var renderType = $('input[name=render-type]:radio:checked').val();
    if (renderType == 'Table') {
      renderHistogramTable(hgram);
    } else {
      renderHistogramGraph(hgram);
    }
  }, 100);
}

var gLastHistogramEvos = null;
var gLineColors = {};
var gGoodColors = ["aqua", "orange", "purple", "red", "teal", "fuchsia", "gray", "green", "lime", "maroon", "navy", "olive", "silver", "black", "blue"];
var gGoodColorIndex = 0;
function update(hgramEvos) {
  // Obtain a list of histogram evolutions (histogram series)
  var evosVals = [];
  $.each(hgramEvos, function (key, value) {
    evosVals.push(value);
  });
  var hgramEvo = evosVals[0];
  if (hgramEvos === undefined || hgramEvos === []) {
    return;
  }
  if (!hgramEvos) {
    hgramEvos = gLastHistogramEvos;
  }
  gLastHistogramEvos = hgramEvos;

  // Compute list of each individual series and bucket labels
  var lines = [];
  var labels = [];
  var start = null, end = null;
  $.each(hgramEvos, function (state, evo) {
    var series = prepareData(state, evo);
    for (var x in series) {
      labels.push(series[x].key);
    }

    // Create new series with updated fields for each entry
    var futureCutoff = moment().add(1, "years").valueOf();
    series = $.map(series, function(entry, i) {
      var key = formatState(state) + ": " +  entry.key;
    
      // Update the bounds properly
      entry.values.forEach(function(point) {
        if (point.x >= futureCutoff) {
          console.log("Bad point; timestamp is far into the future: " + point.x + " (from series " + key + ")");
        } else {
          if (start === null || point.x < start) {
            start = point.x;
          }
          if (end === null || point.x > end) {
            end = point.x;
          }
        }
      });
      
      // Add extra fields to the lines such as their cached color
      if (gLineColors[state + "\n" + entry.key] === undefined) {
        gGoodColorIndex = (gGoodColorIndex + 1) % gGoodColors.length;
        gLineColors[state + "\n" + entry.key] = gGoodColors[gGoodColorIndex];
      }
      return $.extend({}, entry, {
        color: gLineColors[state + "\n" + entry.key],
        fullState: state,
        title: entry.key,
        key: key,
      });
    });

    $.merge(lines, series);
  });
  labels = unique(labels);
  start = new Date(start);
  end = new Date(end);

  // Select the required aggregates in the data
  function updateDisabledAggregates() {
    var toBeSelected = $("#aggregateSelector").multiselect("getSelected").val();
    if (toBeSelected === undefined) {
      return;
    }
    if (toBeSelected === null) {
      toBeSelected = [];
    }
    var linesAreSelected = false;
    lines.forEach(function(line) {
      if (toBeSelected.indexOf(line.title) !== -1) {
        linesAreSelected = true;
      }
    });
    if (!linesAreSelected) {
      toBeSelected = [lines[0].title];
      $("#aggregateSelector").children().removeAttr("selected");
      $("#aggregateSelector").multiselect("select", toBeSelected);
    }
    lines.forEach(function(line) {
      line.disabled = toBeSelected.indexOf(line.title) === -1 || toBeSelected.length === 0;
    });
  }

  // Add a show-<kind> class to #content
  $("#content").removeClass('show-linear show-exponential');
  $("#content").removeClass('show-flag show-boolean show-enumerated');
  $("#content").addClass('show-' + hgramEvo.kind());
  
  // Select just the median if available, otherwise select all the available options
  var prevOptions = [];
  $("#aggregateSelector option").each(function() { prevOptions.push($(this).val()); });
  var selector;
  if (!multisetEqual(prevOptions, labels)) {
    selector = $("<select multiple id=aggregateSelector class='selectorPadding'>");
    $('#multipercentile').empty().append(selector);
    labels.forEach(function(option) { selector.append($("<option>", {text: option, value: option})); });
    event('click', 'aggregates_options', labels.join('/'));
  } else { selector = $("#aggregateSelector"); }

  selector.multiselect({
    includeSelectAllOption: true,
    onChange : function(option, checked) {
      selector.multiselect("updateSelectAll");
      if(option.is(':selected')) { event('click', 'aggregates_options', labels.join('/')); }
      updateDisabledAggregates();
      updateRendering(hgramEvo, lines, start, end);
      updateUrlHashIfNeeded();
    }
  });
  var selected = urlHashToPageState(window.location.hash).aggregates || ["median"];
  selector.val(selected).multiselect("rebuild");
  
  updateDisabledAggregates();
  updateRendering(hgramEvo, lines, start, end);
  updateUrlHashIfNeeded();
}
