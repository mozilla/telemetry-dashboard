var selHistogram = document.getElementById("selHistogram")
function get(url, handler) {
  var xhr = new XMLHttpRequest();
  xhr.onload = handler
  
  xhr.open("get", url, true);
  xhr.send(null);
}

function drawChart(hgrams) {
  var builds = Object.keys(hgrams).sort()
  var ls = []
  var countls = [["Build Id", "Bucket Count"]]
  for each (var b in builds) {
//    console.log(hgrams[b])
    var count = 0;
    var sum = 0;
    for (var filter in hgrams[b]) {
      var hgram = hgrams[b][filter]
      for each(var c in hgram.values) {
        count += c
      }
      sum += hgram.sum;
    }
    ls.push([b,sum/count
             //,count
            ])
    countls.push([b, count])
  }
    console.log(ls)
  var data = new google.visualization.DataTable();
  data.addColumn('string', 'build id'); // Implicit domain label col.
  data.addColumn('number', 'Average'); // Implicit series 1 data col.
//  data.addColumn({type:'number', role:'annotation'}); 
  data.addRows(ls)

  var chart = new google.visualization.LineChart(document.getElementById('main_div'));
  chart.draw(data, {
    title: selHistogram.options[selHistogram.selectedIndex].value
        });


  var chart = new google.visualization.LineChart(document.getElementById('count_div'));
  chart.draw(google.visualization.arrayToDataTable(countls),
             {title: 'Bucket Count'}
            );
}

function onchange() {
  var hgram = selHistogram.options[selHistogram.selectedIndex].value
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
