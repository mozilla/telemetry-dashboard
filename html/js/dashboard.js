var selHistogram = document.getElementById("selHistogram")
var _filter_set = Set()

function get(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onload = function (e) {
    if (e.target.status == 200)
      handler.apply(this, [e])
    else
      console.log("Code "+e.target.status+" while loading "+url)
  }

  // deal with caching issues
  var debug = ""
  //debug += new Date()
  xhr.open("get", url+"?" + debug, true);
  xhr.send(null);
}

function nukeChildren(parent) {
  while (parent.hasChildNodes()) {
    parent.removeChild(parent.lastChild);
  }
}

function drawChart(hgrams) {
  const FILTERID = 1
  const ENTRY_COUNT = 2
  const SUM = 3

  if (!hgrams)
    hgrams = window._hgrams

  if (!hgrams)
    return

  window._hgrams = hgrams
  var builds = Object.keys(hgrams.values).sort()
  var p50 = []
  var ls = []
  var countls = []
  var total_histogram = undefined
  for each (var b in builds) {
    var count = 0;
    for each(var data in hgrams.values[b]) {
      filter = data[data.length - FILTERID]
      if (!_filter_set.has(filter))
        continue

      if (!total_histogram) {
        total_histogram = data.slice()
        continue
      }
      for(var i = 0;i<total_histogram.length;i++) {
        total_histogram[i] += data[i]
      }
    }
    if (total_histogram)
      for (var i = 0;i<hgrams.buckets.length;i++)
        count += total_histogram[i];
    if (count) {
      var i = ls.length;
      var unixTime =  new Date(b.substr(0,4) + "/" + b.substr(4,2) + "/"+ b.substr(6,2)) - 0
      var sum = total_histogram[total_histogram.length - SUM]
      ls.push([unixTime,sum/count
               //,count
              ])
      countls.push([unixTime, total_histogram[total_histogram.length - ENTRY_COUNT]])
    }
    // Sum histograms for b (date)
    if (total_histogram) {
      var tothistg = undefined;
      for each(var data in hgrams.values[b]) {
        filter = data[data.length - FILTERID]
        if (!_filter_set.has(filter)) {
          continue;
        }
        if (!tothistg) {
          tothistg = data.slice();
          continue;
        }
        for(var i = 0; i < tothistg.length; i++) {
          tothistg[i] += data[i];
        }
      }
      var ps = estimatePercentile(hgrams.buckets, tothistg, total_histogram[hgrams.buckets.length - SUM] / total_histogram[hgrams.buckets.length - ENTRY_COUNT], 50);
      var ts =  new Date(b.substr(0,4) + "/" + b.substr(4,2) + "/"+ b.substr(6,2)) - 0;
      p50.push([ts, ps]);
    }
  }

  var entry_count = 0;
  if (total_histogram) {
    entry_count = total_histogram[total_histogram.length - ENTRY_COUNT]
  }

  var node = document.getElementById("divInfo")
  nukeChildren(node);
  node.appendChild(document.createTextNode(selHistogram.options[selHistogram.selectedIndex].value + " (" + entry_count + " submissions)"))

  plots['main_chart'] = $.plot(
    $("#main_chart"),
    [
      {label: 'Average', data: ls},
      {label: 'Daily Submissions', data: countls, yaxis:2},
      {label: 'Median', data: p50}
    ],
    {
      grid: {
        hoverable: true
      },
      series: {
        lines: { show: true },
        points: { show: true },
      },
      xaxes: [{ mode:"time", timeformat: "%y%0m%0d"}],
      yaxes: [{min: 0}, {min:0, position:"right"}],
    });

  var bar_div = document.getElementById('histogram');
  if (!entry_count) {
    nukeChildren(bar_div);
    return;
  }

  var p50 = estimatePercentile(
    hgrams.buckets, total_histogram,
    total_histogram[hgrams.buckets.length - SUM] / entry_count, 50);
  var p50tick = null;
  var barls = []
  var ticks = []
  for (var i = 0;i<hgrams.buckets.length;i++) {
    var x = hgrams.buckets[i]
    var y = total_histogram[i]
    if (!y)
      continue
    barls.push([i, y])
    ticks.push([i, x])
    if(p50tick === null && i + 1 != hgrams.buckets.length && hgrams.buckets[i+1] > p50) {
      // Estimate tick for median
      p50tick = i + (p50 - hgrams.buckets[i]) / (hgrams.buckets[i+1] - hgrams.buckets[i]);
    }
  }
  // TODO: Handle case for last bucket better...
  if(p50tick === null)
    p50tick = hgrams.buckets.length - 1;

  plots['histogram'] = $.plot($("#histogram"),
         [{data:barls, bars:{show:true}}],
         {
          "xaxis":{"ticks": ticks},
          "grid":{
            "hoverable": true,
            "markings": [
            {xaxis: {from: p50tick, to: p50tick}, color: "#0000bb"}
            ]
          }
        }
  )
}

/**
 * Estimate a percentile
 * Given list of bucket start values, histogram values and mean value
 */
function estimatePercentile(buckets, values, mean, percentile) {
  var i;
  // First count number occurences
  var count = 0;
  for(i = 0; i < buckets.length; i++) {
    count += values[i];
  }

  // Number of occurences to count before we have the median
  to_count = count * (percentile / 100)

  // Now, find bucket containing the percentile by counting up
  var counted = 0;
  for(i = 0; i < buckets.length; i++) {
    if(counted + values[i] > to_count) {
      break;
    }
    counted += values[i];
  }

  // Bucket i start at buckets[i]
  var start = buckets[i];

  // However, the end of bucket i is a little be more tricky
  var end;
  if(i < buckets.length) {
    // If there's a next bucket, then obviously that's the end
    end = buckets[i + 1];
  } else {
    // If there is no next bucket, then we sum the values of all buckets below
    // the end bucket (bucket i). We use the middle bucket value as an estimate
    // for each of the occurrences.
    var sum = 0;
    for(var j = 0; j < buckets.length - 1; j++) {
      sum += values[j] * (buckets[j] + (buckets[j] - buckets[j+1]) / 2);
    }
    var sum_of_end_bucket = (mean * count) - (sum / counted);
    // We estimate the end as 2 times mean of values in the end bucket
    end = 2 * (sum_of_end_bucket / values[i]);
  }

  // Interpolate median assuming a uniform distribution between start and end.
  return start + (end - start) * ((to_count - counted) / (values[i] + 1));
}


function updateDescription(descriptions) {
  var node = document.getElementById("divDescription")
  nukeChildren(node);

  if (descriptions)
    window._descriptions = descriptions

  if (!window._descriptions)
    return

  var hgram = selHistogram.options[selHistogram.selectedIndex].value
  var d = window._descriptions[hgram]
  if (!d)
    return
  var text = document.createTextNode(d.description)
  node.appendChild(text)
}

function onhistogramchange() {
  var hgram = selHistogram.options[selHistogram.selectedIndex].value
  get(window._path+"/"+hgram+".json?", function() {drawChart(JSON.parse(this.responseText))})
  updateDescription();
  updateURL();
}

function applySelection() {
  if (window._appliedSelection)
    return false;
  window._appliedSelection = true;

  var l = location.href
  var i = l.indexOf('#')

  if (i == -1)
    return false
  var path = decodeURIComponent(l.substr(i+1)).split('/')

  var parent = selHistogram.parentNode
  var optionI = 0;
  // hack to skip channel
  var skipped = 0;
  for each (var p in path) {
    var select = null;
    for (;optionI < parent.childNodes.length;optionI++) {
      select = parent.childNodes[optionI]
      if (select.tagName == "SELECT")
        break
    }
    if (optionI == parent.childNodes.length) {
      console.log("Ran out of SELECTs in applySelection");
      return false;
    }
    var select_id = select.id
    var i = 0;
    for (;i<select.options.length;i++) {
      var o = select.options[i]
      if (o.text == p) {
        if (skipped = 0 && select.selectedIndex == i) {
          console.log(p + " is already selected")
          skipped++;
          break;
        }
        //dom should get updated
        if (!select.onChange) {
          console.log("no select handler to apply " + p)
          return false
        } else {
          select.selectedIndex = i;
          select.onChange();
          console.log("selected " + p)
        }
        break;
      }
    }
    if (i == select.options.length) {
      console.log("Could not find '"+p+"' in select "+select_id);
      return false;
    }
    optionI++;
  }
  console.log(path)
  return true
}

function stuffLoaded() {
  if (!window._histograms || !window._filtersLoaded)
    return;

  for each (var h in window._histograms) {
    var o = document.createElement("option")
    o.text = h
    selHistogram.add(o)
  }
  if (!applySelection()) {
    console.log("applySelection said there is nothing to do, doing the default");
    onhistogramchange()
  }
  window._stuffLoaded = true;
}

function applyFilter(filter) {
  function getleafkeys(tree, set) {
    var id = tree['_id']
    if (id == undefined)
      return

    if (Object.keys(tree).length == 1)
      set.add(id)

    for each(var subtree in tree) {
      getleafkeys(subtree, set)
    }
    return set
  }

  _filter_set = getleafkeys(filter, Set())
  drawChart()
//  console.log([v for (v of _filter_set)])
}

function updateURL() {
  // do not mess with url while loading page
  if (!window._stuffLoaded)
    return;
  var p = selHistogram.parentNode
  var path = []
  for (var i = 0;i < p.childNodes.length;i++) {
    var c = p.childNodes[i]
    if (c.tagName != "SELECT")
      continue;
    if (c.selectedIndex == -1)
      break;
    path.push(c.options[c.selectedIndex].text);
  }
  location.href = "#" + path.join("/")
}

function filterChange() {
  //clear downstream selects once upstream one changes
  var p = selHistogram.parentNode
  for (var i = p.childNodes.length-1; i>0; i--) {
    var c = p.childNodes[i]
    if (c == this)
      break;
    p.removeChild(c)
  }
  updateURL();

  if (!this.selectedIndex) {
    applyFilter(this.filter_tree)
    return;
  }

  next_filter_tree = this.filter_tree[this.options[this.selectedIndex].text]
  applyFilter(next_filter_tree)

  // only nodes that have an _id are valid filters
  if (next_filter_tree['name'])
    initFilter(next_filter_tree)
}

function initFilter(filter_tree) {
  window._filtersLoaded = true;
  var p = selHistogram.parentNode
  var s = document.createElement("select");
  var o = document.createElement("option");
  var id = filter_tree['_id']
  s.id = "selFilter" + id
  s.filter_tree = filter_tree
  o.text = filter_tree['name'] + " *";
  s.add(o)
  p.appendChild(s);
  s.addEventListener("change", filterChange)
  s.onChange = filterChange
  for (var opts in filter_tree) {
    if (opts == '_id' || opts == 'name')
      continue;
    var o = document.createElement("option");
    o.text = opts;
    s.add(o)
  }
  if (id == 0)
    filterChange.apply(s, [true]);
}

function loadData() {
  var selHistogram = document.getElementById("selHistogram")
  var selChannel = document.getElementById("selChannel");
  var parent = selHistogram.parentNode

  // hack...if this is after pageload, then wipe url on channel change
  if (window._appliedSelection)
    location.href = "#" +selChannel.options[selChannel.selectedIndex].text + "/"

  // reset state...TODO: document state
  delete window._histograms
  delete window._filtersLoaded
  delete window._stuffLoaded
  delete window._hgrams
  delete window._appliedSelection
  delete window._descriptions
  nukeChildren(selHistogram);
  nukeChildren(parent)
  parent.appendChild(selChannel)
  parent.appendChild(selHistogram)

  window._path = "data/"+selChannel.options[selChannel.selectedIndex].value

  get(_path+"/histograms.json", function() {window._histograms = Object.keys(JSON.parse(this.responseText)).sort()
                                           stuffLoaded()
                                          });
  get(_path+"/filter.json", function() {initFilter(JSON.parse(this.responseText)); stuffLoaded()});
  get(_path+"/histogram_descriptions.json", function() {updateDescription(JSON.parse(this.responseText))});
}

function buildVersionSelects(ls) {
  // hack in order to not have to write async applySelection
  var urlChannel = /#([^/]+)/.exec(location.href),
      latestNightly = 0,
      desiredChannel;
  if (urlChannel) {
    desiredChannel = decodeURIComponent(urlChannel[1]);
  }

  for (var i=0; i < ls.length; i++) {
    var chan = ls[i].split('/'),
        channel = chan[0],
        version = chan[1];

    if (channel == "nightly") {
      if (version > latestNightly) {
        latestNightly = version;
      }
    }
  }

  desiredChannel = urlChannel || "nightly " + latestNightly;

  var selChannel = document.getElementById("selChannel");
  for (i=0; i<ls.length; i++) {
    var c = document.createElement("option");
    c.value = ls[i];
    c.text = c.value.replace('/', ' ');
    selChannel.add(c)

    if (c.text == desiredChannel) {
      selChannel.selectedIndex = i;
    }
  }

  selChannel.addEventListener("change", loadData);
  loadData();
}

var plots = {};

selHistogram.addEventListener("change", onhistogramchange)
selHistogram.onChange = onhistogramchange
get("data/versions.json", function() {buildVersionSelects(JSON.parse(this.responseText))});

var resizeTimeout;

function resizeAllPlots() {
  for (var id in plots) {
    plots[id].resize();
    plots[id].setupGrid();
    plots[id].draw();
  }
}

window.addEventListener('resize', function() {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(resizeAllPlots, 100);
});

for (var id of ["#main_chart", "#histogram"]) {
  var previousPoint;
  $(id).bind("plothover", function(event, pos, item){
    if (!item) {
      $("#tooltip").remove();
      previousPoint = null;
      return;
    }
    if (previousPoint == item.dataIndex) {
      return;
    }
    previousPoint = item.dataIndex;
    $("#tooltip").remove();
    $('<div id="tooltip">' + item.datapoint[1].toFixed(2) + '</div>')
      .css({
        top: item.pageY + 5,
        left: item.pageX + 5,
      })
      .appendTo("body").fadeIn(200);
  });
}
