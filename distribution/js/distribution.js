google.load("visualization", "1.1", {packages:["wordtree"]});
google.setOnLoadCallback(loadData);

Array.prototype.chunk = function(chunkSize) {
  var array=this;
  return [].concat.apply([],
                         array.map(function(elem,i) {
                           return i%chunkSize ? [] : [array.slice(i,i+chunkSize)];
                         })
                        );
}

function loadData() {
  $.ajax("https://s3-us-west-2.amazonaws.com/telemetry-public-analysis/Population%20Segmentation/data/distribution.csv").done(function(input) {
    input = input.split("\n");

    for(var i = 0; i < input.length; i++) {
      input[i] = input[i].split(",");
    }

    input = input.slice(0, -1);

    for(var i = 0; i < input.length; i++) {
      input[i][1] = parseFloat(input[i][1]);
    }

    input = [["Phrases", "value"]].concat(input);

    data = google.visualization.arrayToDataTable(input);
    drawChart(data)
  });
}

function drawChart(data) {
  var options = {
    wordtree: {
      format: 'implicit',
      word: 'Firefox'
    }
  };

  var chart = new google.visualization.WordTree(document.getElementById('wordtree_basic'));
  chart.draw(data, options);
}
