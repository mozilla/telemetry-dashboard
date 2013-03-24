var selHistogram = document.getElementById("selHistogram")
var _filter_set = Set()

function get(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onload = handler
  
  xhr.open("get", url, true);
  xhr.send(null);
}

function clone_object(obj) {
  var copy = {}
  for (var f in obj) {
    var v = obj[f]
    var t = typeof v
    switch(t) {
      case 'number':
      copy[f] = v;
      break;
      case 'object':
      copy[f] = clone_object(v);  
      break
      default:
      throw new Error("Unknown histogram field type "+t+" for " + f)
    }
  }
  return copy
}

function nukeChildren(parent) {
  while (parent.hasChildNodes()) {
    parent.removeChild(parent.lastChild);
  }

}

function drawChart(hgrams) {
  if (!hgrams)
    hgrams = window._hgrams
  if (!hgrams)
    return
  window._hgrams = hgrams
  var builds = Object.keys(hgrams).sort()
  var ls = []
  var countls = []
  var total_histogram = undefined
  var x_axis_builds = []
  for each (var b in builds) {
    var count = 0;
    var sum = 0;
    for (var filter in hgrams[b]) {
      if (!_filter_set.has(filter))
        continue
      var hgram = hgrams[b][filter]
      if (!total_histogram) {
        total_histogram = clone_object(hgram)
        continue
      }
      for (var x in hgram.values) {
        var y = hgram.values[x]
        // hack: += non-existent value returns a NaN
        if (isNaN(total_histogram.values[x] += y)) {
          total_histogram.values[x] = y
        }
        count += y
      }
      sum += hgram.sum;
      total_histogram.entry_count += hgram.entry_count
    }
    if (count) {
      var i = ls.length;
      var unixTime =  new Date(b.substr(0,4) + "/" + b.substr(4,2) + "/"+ b.substr(6,2)) - 0
      ls.push([unixTime,sum/count
               //,count
              ])
      countls.push([unixTime, total_histogram.entry_count])
    }
  }
  title = [ls.length, countls.length]  
  var entry_count = 0;
  if (total_histogram) {
    entry_count = total_histogram.entry_count
  }

  var node = document.getElementById("divInfo")
  nukeChildren(node);
  node.appendChild(document.createTextNode(selHistogram.options[selHistogram.selectedIndex].value + " (" + entry_count + " submissions)"))

  $.plot($("#main_div"),
         [{label: 'Average', data: ls}, {label: 'Daily Submissions', data: countls, yaxis:2}],
        {SERIES: {lines: { show: true }, points: { show: true }},
         xaxes: [{ mode:"time", timeformat: "%y%0m%0d"}],
         yaxes: [{}, {position:"right"}],
        })

  var bar_div = document.getElementById('bar_div');
  if (!entry_count) {
    nukeChildren(bar_div);
    return;
  }

  keys = Object.keys(total_histogram.values).sort(function(a, b) {
                                                    return a - b;
                                                  });
  var barls = []
  var ticks = []
  for each(var x in keys) {
    var y = total_histogram.values[x]
    if (!y)
      continue
    var i = barls.length
    barls.push([i, y])
    ticks.push([i, x])
  }
  $.plot($("#bar_div"),
         [{data:barls, bars:{show:true}}],
         {"xaxis":{"ticks": ticks}}
        )
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

function onchange() {
  var hgram = selHistogram.options[selHistogram.selectedIndex].value
  get("data/"+hgram+".json", function() {drawChart(JSON.parse(this.responseText))})
  updateDescription();
}

function stuffLoaded() {
  if (!window._histograms)
    return;

  for each (var h in window._histograms) {
    var o = document.createElement("option")
    o.text = h
    selHistogram.add(o)
  }
  onchange()
}

function applyFilter(filter) {
  function getleafkeys(tree, set) {
    var id = tree['_id']
    if (id == undefined)
      return
    //TODO:fix this to be a string in import script
    if (Object.keys(tree).length == 1)
      set.add((id).toString())

    for each(var subtree in tree) {
      getleafkeys(subtree, set)
    }
    return set
  }

  _filter_set = getleafkeys(filter, Set())
  drawChart()
//  console.log([v for (v of _filter_set)])
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
  for (var opts in filter_tree) {
    if (opts == '_id' || opts == 'name')
      continue;
    var o = document.createElement("option");  
    o.text = opts;                               
    s.add(o)
  }  
  if (id == 0)
    filterChange.apply(s);
}

selHistogram.addEventListener("change", onchange)
get("data/histograms.json", function() {window._histograms = Object.keys(JSON.parse(this.responseText)).sort()
                                       stuffLoaded()
                                      });
get("data/filter.json", function() {initFilter(JSON.parse(this.responseText))});
get("data/histogram_descriptions.json", function() {updateDescription(JSON.parse(this.responseText))});
