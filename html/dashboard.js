var selHistogram = document.getElementById("selHistogram")
function get(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onload = handler
  
  xhr.open("get", url, true);
  xhr.send(null);
}

function drawChart(hgrams) {
  var builds = Object.keys(hgrams).sort()
  var ls = [['build', 'average']]
  for each (var b in builds) {
    console.log(hgrams[b])
    var count = 0;
    var sum = 0;
    for (var filter in hgrams[b]) {
      var hgram = hgrams[b][filter]
//      console.log(hgram)
      for each(var c in hgram.values) {
        count += c
      }
      sum += hgram.sum;
    }
    ls.push([b,sum/count])
  }
  var data = google.visualization.arrayToDataTable(ls);
  
  var options = {
   // title: 'Company Performance'
        };
  
  var chart = new google.visualization.LineChart(document.getElementById('chart_div'));
  chart.draw(data, options);

}

function onchange() {
  hgram = selHistogram.options[selHistogram.selectedIndex].value
  get("data/"+hgram+".json", function() {drawChart(JSON.parse(this.responseText))})
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

google.load("visualization", "1", {packages:["corechart"]});
google.setOnLoadCallback(stuffLoaded);
selHistogram.addEventListener("change", onchange)
get("data/filter.json", function() {window._filter = this.responseText});
get("data/histograms.txt", function() {window._histograms = this.responseText.split(/\n/)
                                       stuffLoaded()
                                      });
