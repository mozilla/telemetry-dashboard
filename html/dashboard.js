var selHistogram = document.getElementById("selHistogram")
var _filter_set = Set()

function get(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onload = handler
  
  xhr.open("get", url, true);
  xhr.send(null);
}

function drawChart(hgrams) {
  if (!hgrams)
    hgrams = window._hgrams
  if (!hgrams)
    return
  window._hgrams = hgrams
  var builds = Object.keys(hgrams).sort()
  var ls = []
  var countls = [["Build Id", "Count"]]
  var total_histogram = []
  var total_count = 0
  for each (var b in builds) {
    var count = 0;
    var sum = 0;
    var entry_count = 0;
    for (var filter in hgrams[b]) {
      if (!_filter_set.has(filter))
        continue
      var hgram = hgrams[b][filter]
      for (var x in hgram.values) {
        var y = hgram.values[x]
        if (total_histogram[x] == undefined)
          total_histogram[x] = 0
        total_histogram[x] += y
        count += y
      }
      sum += hgram.sum;
      entry_count += hgram.entry_count
    }
    total_count += entry_count
    if (count) {
      ls.push([b,sum/count
               //,count
              ])
      countls.push([b, entry_count])
    }
  }
  
  var data = new google.visualization.DataTable();
  data.addColumn('string', 'build id'); // Implicit domain label col.
  data.addColumn('number', 'Average'); // Implicit series 1 data col.
//  data.addColumn({type:'number', role:'annotation'}); 
  data.addRows(ls)

  var chart = new google.visualization.LineChart(document.getElementById('main_div'));
  chart.draw(data, {
    title: selHistogram.options[selHistogram.selectedIndex].value + " (" + total_count + " submissions)"
        });


  var chart = new google.visualization.LineChart(document.getElementById('count_div'));
  chart.draw(google.visualization.arrayToDataTable(countls),
             {title: 'Daily Submissions'}
            );

  data = new google.visualization.DataTable();
  data.addColumn('string', 'x');
  data.addColumn('number', 'y');
  for(var i = 0;i < total_histogram.length;i++) {
    var y = total_histogram[i]
    if (!y)
      continue
    data.addRow([""+i, y])
  }
  var chart = new google.visualization.SteppedAreaChart(document.getElementById('bar_div'));
  chart.draw(data,
             {title: 'Histogram'}
            );

}

function updateDescription(descriptions) {
  var node = document.getElementById("divDescription")
  while (node.hasChildNodes()) {
    node.removeChild(node.lastChild);
  }
  
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
  if (!window._histograms || !google.visualization)
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
  if (!this.selectedIndex) {
    applyFilter(this.filter_tree)
    return;
  }

  //clear downstream selects once upstream one changes
  var p = selHistogram.parentNode
  for (var i = p.childNodes.length-1; i>0; i--) {
    var c = p.childNodes[i]
    if (c == this)
      break;
    p.removeChild(c)
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


google.load("visualization", "1", {packages:["corechart"]});
google.setOnLoadCallback(stuffLoaded);
selHistogram.addEventListener("change", onchange)
get("data/histograms.json", function() {window._histograms = Object.keys(JSON.parse(this.responseText)).sort()
                                       stuffLoaded()
                                      });
get("data/filter.json", function() {initFilter(JSON.parse(this.responseText))});
get("data/histogram_descriptions.json", function() {updateDescription(JSON.parse(this.responseText))});
