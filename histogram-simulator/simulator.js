var gDataEditor = null;
var gSampleCount = 20000;
var gCurrentBuckets = null;

$(function() {
  gDataEditor = CodeMirror.fromTextArea($("#data-editor").get(0), {
    mode: "javascript",
    lineNumbers: true,
  });

  var currentUpdateTimeout = null;
  
  $("input[name=histogram-lower], input[name=histogram-upper], #histogram-kind").change(function() {
    clearTimeout(currentUpdateTimeout);
    currentUpdateTimeout = setTimeout(update, 100);
  });
  gDataEditor.on("changes", function() {
    $("input[name=histogram-lower]").trigger("change");
  });
  
  $("#generate-normal").click(function() {
    var lower = gCurrentBuckets[0], upper = gCurrentBuckets[gCurrentBuckets.length - 1];
    
    // Generate normally-distributed values using box-muller transform
    var values = normalRandoms((lower + upper) / 2, (upper - lower) / 8, gSampleCount)
      .map(function(value) { return value >= 0 ? value : 0; });
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });
  $("#generate-log-normal").click(function() {
    var lower = gCurrentBuckets[0], upper = gCurrentBuckets[gCurrentBuckets.length - 1];
    
    // Generate normally-distributed values using box-muller transform
    var values = logNormalRandoms(Math.sqrt(Math.max(lower, 1) * upper), Math.pow(upper / Math.max(lower, 1), 1 / 8), gSampleCount)
      .map(function(value) { return value >= 0 ? value : 0; });
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });
  $("#generate-uniform").click(function() {
    var lower = gCurrentBuckets[0], upper = gCurrentBuckets[gCurrentBuckets.length - 1];
    
    var values = [];
    for (var i = 0; i < gSampleCount; i ++) { values.push(Math.random() * (upper - lower) + lower); }
    var result = "[\n  " + values.join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
    return false;
  });

  update();
  $("#generate-normal").click();
});

function normalRandoms(mu, sigma, count) { // Box-Muller transform in polar form
  var values = [];
  var z0, z1, value;
  for (var i = 0; values.length < count; i ++) {
    if (i % 2 === 0) {
      var x1, x2;
      do {
        x1 = 2 * Math.random() - 1;
        x2 = 2 * Math.random() - 1;
        w = x1 * x1 + x2 * x2;
      } while (w >= 1);
      w = Math.sqrt((-2 * Math.log(w)) / w)
      z0 = x1 * w; z1 = x2 * w;
      value = z0;
    } else {
      value = z1;
    }
    value = value * sigma + mu;
    if (value < 0) continue; // Discard the current value if it is negative
    
    values.push(value);
  }
  return values;
}

function logNormalRandoms(mu, sigma, count) { // Box-Muller transform in polar form for log-normal distributions
  var values = [];
  var z0, z1, value;
  for (var i = 0; i < count; i ++) {
    if (i % 2 === 0) {
      var x1, x2;
      do {
        x1 = 2 * Math.random() - 1;
        x2 = 2 * Math.random() - 1;
        w = x1 * x1 + x2 * x2;
      } while (w >= 1);
      w = Math.sqrt((-2 * Math.log(w)) / w)
      z0 = x1 * w; z1 = x2 * w;
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
    result.push(Math.round(linearRange));
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
    var nextValue = Math.round(Math.exp(logNext));
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
  
  var kind = $("#histogram-kind").val();
  switch (kind) {
    case "flag": case "boolean":
      gCurrentBuckets = linearBuckets(1, 2, 3);
      break;
    case "enumerated":
      gCurrentBuckets = linearBuckets(1, upper, upper + 1);
      break;
    case "linear":
      gCurrentBuckets = linearBuckets(lower, upper, bucketCount);
      break
    case "exponential":
      gCurrentBuckets = exponentialBuckets(lower, upper, bucketCount);
  }
  var values = [];
  try {
    values = JSON.parse(gDataEditor.getValue());
    if (!$.isArray(values) || values.length === 0) { throw "Values must be array of numbers"; }
    values.forEach(function(value) {
      if (typeof value !== "number" || value < 0) { throw "Values must be array of non-negative numbers"; }
    });
  } catch(e) {
    $("#data-status").text(e)
    return;
  }
  $("#data-status").text("");
  
  var histogram = new Telemetry.Histogram(gCurrentBuckets, gCurrentBuckets, kind, values.length, "Test Histogram");
  var counts = histogram.map(function(count, start, end, i) {
    var hitCount = 0;
    if (i === gCurrentBuckets.length - 1) { // Last bucket, no upper bound
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

  MG.data_graphic({
    data: values,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 800,
    left: 150, right: ($("#distribution").width() - 100) / values.length + 150,
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
      var legend = d3.select("#distribution .mg-active-datapoint").text(label).attr("transform", offset)
        .attr("x", barWidth / 2).attr("y", "0").attr("dy", "-10").attr("text-anchor", "middle").style("fill", "white");
      var bbox = legend[0][0].getBBox();
      var padding = 5;
      
      // Add background
      d3.select("#distribution .active-datapoint-background").remove(); // Remove old background
      d3.select("#distribution svg").insert("rect", ".mg-active-datapoint").classed("active-datapoint-background", true)
        .attr("x", bbox.x - padding).attr("y", bbox.y - padding).attr("transform", offset)
        .attr("width", bbox.width + padding * 2).attr("height", bbox.height + padding * 2)
        .attr("rx", "3").attr("ry", "3").style("fill", "#333");
    },
    mouseout: function(d, i) {
      d3.select("#distribution .active-datapoint-background").remove(); // Remove old background
    },
  });
  
    // Reposition and resize text
  $(".mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $(".mg-x-axis .label").attr("dy", "1.2em");
  $(".mg-x-axis text:not(.label)").each(function(i, text) { // Axis tick labels
    if ($(text).text() === "NaN") { text.parentNode.removeChild(text); } // Remove "NaN" labels resulting from interpolation in histogram labels
    $(text).attr("dx", "0.3em").attr("dy", "0").attr("text-anchor", "start");
  });
  $(".mg-x-axis line").each(function(i, tick) { // Extend axis ticks to 15 pixels
    $(tick).attr("y2", parseInt($(tick).attr("y1")) + 12);
  });
  $(".mg-y-axis .label").attr("y", "55").attr("dy", "0");
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
