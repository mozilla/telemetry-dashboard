var gDataEditor = null;

$(function() {
  gDataEditor = CodeMirror.fromTextArea($("#data-editor").get(0), {
    mode: "javascript",
    lineNumbers: true,
  });

  var currentUpdateTimeout = null;
  
  $("input[name=histogram-lower], input[name=histogram-upper], input[name=histogram-bucket-count], #histogram-bucket-type").change(function() {
    clearTimeout(currentUpdateTimeout);
    currentUpdateTimeout = setTimeout(update, 100);
  });
  gDataEditor.on("changes", function() {
    $("input[name=histogram-lower]").trigger("change");
  });
  
  $("#generate-normal").click(function() {
    var lower = parseInt($("input[name=histogram-lower]").val());
    var upper = parseInt($("input[name=histogram-upper]").val());
    if (lower < 0 || lower >= upper) {
      $("#data-status").text("Invalid bounds");
      return;
    }
    
    // Generate normally-distributed values using box-muller transform
    var values = normalRandoms((lower + upper) / 2, (upper - lower) / 4, 10000)
      .map(function(value) { return value >= 0 ? value : 0; });
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });
  $("#generate-log-normal").click(function() {
    var lower = parseInt($("input[name=histogram-lower]").val());
    var upper = parseInt($("input[name=histogram-upper]").val());
    if (lower < 0 || lower >= upper) {
      $("#data-status").text("Invalid bounds");
      return;
    }
    
    // Generate normally-distributed values using box-muller transform
    var values = logNormalRandoms(Math.sqrt(Math.max(lower, 1) * upper), Math.pow(upper / Math.max(lower, 1), 1 / 4), 10000)
      .map(function(value) { return value >= 0 ? value : 0; });
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });
  $("#generate-uniform").click(function() {
    var lower = parseInt($("input[name=histogram-lower]").val());
    var upper = parseInt($("input[name=histogram-upper]").val());
    if (lower < 0 || lower >= upper) {
      $("#data-status").text("Invalid bounds");
      return;
    }
    
    var values = [];
    for (var i = 0; i < 10000; i ++) { values.push(Math.random() * (upper - lower) + lower); }
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });

  $("#generate-normal").click();
  update();
});

function normalRandoms(mu, sigma, count) { // Box-Muller transform
  var values = [];
  var z0 = 0, z1 = 0;
  var value;
  for (var i = 0; i < count; i ++) {
    if (i % 2 === 0) {
      var u1, u2;
      do {
        u1 = Math.random();
        u2 = Math.random();
      } while (u1 <= 0.00001);
      z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      value = z0;
    } else {
      value = z1;
    }
    value = value * sigma + mu;
    values.push(value);
  }
  return values;
}

function logNormalRandoms(mu, sigma, count) { // Box-Muller transform for log-normal distributions
  var values = [];
  var z0 = 0, z1 = 0;
  var value;
  for (var i = 0; i < count; i ++) {
    if (i % 2 == 0) {
      var u1, u2;
      do {
        u1 = Math.random();
        u2 = Math.random();
      } while (u1 <= 0.00001);
      z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      z1 = Math.sqrt(-2 * Math.log(u1)) * Math.sin(2 * Math.PI * u2);
      value = z0;
    } else {
      value = z1;
    }
    value = Math.exp(value * Math.log(sigma) + Math.log(mu));
    values.push(value);
  }
  return values;
}

function linearBuckets(min, max, count) {
  var result = [0];
  for (var i = 1; i < count; i ++) {
    var linearRange = (min * (count - 1 - i) + max * (i - 1)) / (count - 2);
    result.push(linearRange + 0.5);
  }
  return result;
}

function exponentialBuckets(min, max, count) {
  var logMax = Math.log(max);
  var bucketIndex = 2;
  var result = [0];
  var current = min;
  if (current === 0) { current = 1; } // If starting from 0, the second bucket should be 1 rather than 0
  result.push(current);
  for (var i = 2; i < count; i ++) {
    var logCurrent = Math.log(current);
    var logRatio = (logMax - logCurrent) / (count - i);
    var logNext = logCurrent + logRatio;
    var nextValue = Math.floor(Math.exp(logNext) + 0.5);
    current = nextValue > current ? nextValue : current + 1;
    result.push(current);
  }
  return result;
}

function update() {
  var lower = parseInt($("input[name=histogram-lower]").val());
  var upper = parseInt($("input[name=histogram-upper]").val());
  var bucketCount = parseInt($("input[name=histogram-bucket-count]").val());
  if (!isFinite(lower) || !isFinite(upper) || lower < 0 || lower >= upper) {
    $("#data-status").text("Invalid bounds");
    return;
  }
  if (!isFinite(bucketCount) || bucketCount < 3) {
    $("#data-status").text("Invalid bucket count");
    return;
  }
  
  var buckets = $("#histogram-bucket-type").val() === "linear"
    ? linearBuckets(lower, upper, bucketCount) : exponentialBuckets(lower, upper, bucketCount);
  var kind = $("#histogram-bucket-type").val() === "linear" ? "linear" : "exponential";
  var values = [];
  try {
    values = JSON.parse(gDataEditor.getValue());
    if (!$.isArray(values)) { throw "Values must be array of numbers"; }
    values.forEach(function(value) {
      if (typeof value !== "number" || value < 0) { throw "Values must be array of non-negative numbers"; }
    });
  } catch(e) {
    $("#data-status").text(e)
  }
  
  var histogram = new Telemetry.Histogram(buckets, buckets, kind, 1000000, "Test Histogram");
  var counts = histogram.map(function(count, start, end, i) {
    var hitCount = 0;
    if (i === buckets.length - 1) { // Last bucket, no upper bound
      values.forEach(function(value, i) {
        if (start <= value) { hitCount ++; }
      });
    } else {
      values.forEach(function(value, i) {
        if (start <= value && value < end) { hitCount ++; }
      });
    }
    return hitCount;
  });
  var starts = histogram.map(function(count, start, end, i) { return start; });
  var ends = histogram.map(function(count, start, end, i) { return end; });
  ends[ends.length - 1] = Infinity;
  displayHistogram(counts, starts, ends);
}

function displayHistogram(counts, starts, ends) {
  var totalCount = counts.reduce(function(previous, count) { return previous + count; }, 0);
  var values = counts.map(function(count, i) { return {value: i, count: (count / totalCount) * 100}; });

  // Plot the data using MetricsGraphics
  MG.data_graphic({
    data: values,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 800,
    left: 150, right: 50,
    transition_on_update: false,
    target: "#distribution",
    x_label: "Test Histogram", y_label: "Percentage of Samples",
    xax_ticks: 20,
    y_extended_ticks: true,
    x_accessor: "value", y_accessor: "count",
    xax_format: function(index) { return formatNumber(starts[index]); },
    yax_format: function(value) { return value + "%"; },
    mouseover: function(d, i) {
      var count = formatNumber(counts[d.x]), percentage = Math.round(d.y * 100) / 100 + "%";
      var label;
      if (ends[d.x] === Infinity) {
       label = count + " samples (" + percentage + ") where sample value \u2265 " + formatNumber(starts[d.x]);
      } else {
       label = count + " samples (" + percentage + ") where " + formatNumber(starts[d.x]) + " \u2264 sample value < " + formatNumber(ends[d.x]);
      }
      var offset = $("#distribution .mg-bar:nth-child(" + (i + 1) + ")").get(0).getAttribute("transform");
      var barWidth = $("#distribution .mg-bar:nth-child(" + (i + 1) + ") rect").get(0).getAttribute("width");
      
      // Reposition element
      var legend = d3.select("#distribution .mg-active-datapoint").text(label)
    },
  });
  
  // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .label").attr("dy", "1.2em");
  $(".mg-x-axis text").each(function(i, text) { // Remove "NaN" labels
    if ($(text).text() === "NaN") { text.parentNode.removeChild(text); }
  });
  $(".mg-y-axis .label").attr("y", "50").attr("dy", "0");
  $(".mg-missing-pane").remove();
}

function formatNumber(number) {
  if (number == Infinity) return "Infinity";
  if (number == -Infinity) return "-Infinity";
  if (isNaN(number)) return "NaN";
  var mag = Math.abs(number);
  var exponent = Math.log10 !== undefined ? Math.floor(Math.log10(mag)) : Math.floor(Math.log(mag) / Math.log(10));
  var interval = Math.pow(10, Math.floor(exponent / 3) * 3);
  var units = {1000: "k", 1000000: "M", 1000000000: "B", 1000000000000: "T"};
  if (interval in units) {
    return Math.round(number * 100 / interval) / 100 + units[interval];
  }
  return Math.round(number * 100) / 100;
}
