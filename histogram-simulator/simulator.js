var gDataEditor = null;
var gSampleCount = 20000;
var gCurrentBuckets = null;
var gIgnoreGeneration = false;

$(function() {
  // Load state from URL hash
  var url = window.location.hash[0] === "#" ? window.location.hash.slice(1) : window.location.hash;
  var pageState = {};
  url.split("&").forEach(function(fragment, i) {
    var parts = fragment.split("=");
    if (parts.length != 2) return;
    pageState[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1]);
  });
  if (pageState.low) { $("input[name=histogram-lower]").val(pageState.low); }
  if (pageState.high) { $("input[name=histogram-upper]").val(pageState.high); }
  if (pageState.n_buckets) { $("input[name=histogram-bucket-count]").val(pageState.n_buckets); }
  if (pageState.kind) { $("#histogram-kind").val(pageState.kind); }
  if (pageState.generate) { $("#generate-" + pageState.generate).click(); }

  gDataEditor = CodeMirror.fromTextArea($("#data-editor").get(0), {
    mode: "javascript",
    lineNumbers: true,
  });

  // Set up the change callback
  var currentUpdateTimeout = null;
  var deferredUpdate = function() {
    clearTimeout(currentUpdateTimeout);
    currentUpdateTimeout = setTimeout(update, 100);
  };
  $("input[name=histogram-lower], input[name=histogram-upper], input[name=histogram-bucket-count]").on("input", deferredUpdate);
  $("#histogram-kind").change(deferredUpdate);
  gDataEditor.on("changes", function() {
    if (gIgnoreGeneration) { return; }
    $("input[name=histogram-lower]").trigger("input");
  });
  
  $("#generate-normal, #generate-log-normal, #generate-uniform").click(function(e) {
    $("#data-editor").next().hide();
    var lower = gCurrentBuckets[0], upper = gCurrentBuckets[gCurrentBuckets.length - 1];
    var values = [];
    switch ($(e.target).attr("id")) {
      case "generate-normal": // Generate normally-distributed values using box-muller transform
        values = normalRandoms((lower + upper) / 2, (upper - lower) / 8, gSampleCount)
          .map(function(value) { return value >= 0 ? value : 0; });
        break;
      case "generate-log-normal":
        values = logNormalRandoms(Math.sqrt(Math.max(lower, 1) * upper), Math.pow(upper / Math.max(lower, 1), 1 / 8), gSampleCount)
          .map(function(value) { return value >= 0 ? value : 0; });
        break;
      case "generate-uniform":
        for (var i = 0; i < gSampleCount; i ++) { values.push(Math.random() * (upper - lower) + lower); }
        break;
    }
    var result = "[\n  " + values.sort(function(a, b) { return a - b; }).join(",\n  ") + "\n]"
    gDataEditor.setValue(result);
  });
  $("#generate-custom").click(function(e) {
    $("#data-editor").next().show();
    gDataEditor.setValue(gDataEditor.getValue());
  });

  gCurrentBuckets = linearBuckets(1, 2, 3);
  update();
});

function update() {
  var lower = parseInt($("input[name=histogram-lower]").val());
  var upper = parseInt($("input[name=histogram-upper]").val());
  var bucketCount = parseInt($("input[name=histogram-bucket-count]").val());
  if (!isFinite(lower) || !isFinite(upper) || lower < 0 || lower >= upper) {
    $("#data-status").text("Lower bound should be finite, positive, and less than upper bound");
    displayHistogram();
    return;
  }
  if (!isFinite(bucketCount) || bucketCount < 3) {
    $("#data-status").text("Bucket count must be finite and at least 3");
    displayHistogram();
    return;
  }
  if (bucketCount > upper - lower + 2) { // There are 2 additional buckets - one for underflow, and one for overflow
    $("#data-status").text("Bucket count must be at most number of distinct integers in range");
    displayHistogram();
    return;
  }
  
  var kind = $("#histogram-kind").val();
  $("input[name=histogram-lower], input[name=histogram-upper], input[name=histogram-bucket-count]").prop("disabled", true);
  switch (kind) {
    case "flag": case "boolean":
      gCurrentBuckets = linearBuckets(1, 2, 3);
      break;
    case "enumerated":
      gCurrentBuckets = linearBuckets(1, bucketCount, bucketCount + 1);
      $("input[name=histogram-bucket-count]").prop("disabled", false);
      break;
    case "linear":
      gCurrentBuckets = linearBuckets(lower, upper, bucketCount);
      $("input[name=histogram-lower], input[name=histogram-upper], input[name=histogram-bucket-count]").prop("disabled", false);
      break
    case "exponential":
      gCurrentBuckets = exponentialBuckets(lower, upper, bucketCount);
      $("input[name=histogram-lower], input[name=histogram-upper], input[name=histogram-bucket-count]").prop("disabled", false);
      break;
  }
  
  // Regenerate the data if necessary
  gIgnoreGeneration = true;
  if ($("input[name=generate]:checked").attr("id") !== "generate-custom") {
    $("input[name=generate]:checked").click();
  }
  gIgnoreGeneration = false;
  
  var values = [];
  try {
    values = JSON.parse(gDataEditor.getValue());
    if (!$.isArray(values) || values.length === 0) { throw "Values must be array of numbers"; }
    values.forEach(function(value) {
      if (typeof value !== "number" || value < 0) { throw "Values must be array of non-negative numbers"; }
    });
  } catch(e) {
    $("#data-status").text(e)
    displayHistogram();
    return;
  }
  $("#data-status").text("");
  
  if (kind === "linear" && bucketCount == upper - lower + 2) {
    $("#data-status").text("Consider using enumerated histograms when using individual buckets for each integer.");
  }
  
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
  saveStateToURL();
}

function displayHistogram(counts, starts, ends) {
  if (!counts) {
    MG.data_graphic({
      data: values,
      chart_type: "missing-data",
      full_width: true, height: 800,
      target: "#distribution",
    });
    $("#distribution").css("border", "1px solid gray")
    $(".mg-missing-pane").remove();
    return;
  }
  
  var maxWidth = starts[starts.length - 1] - starts[starts.length - 2];
  $("#bucket-width").text("The widest bucket's width is " + maxWidth + ".");

  var totalCount = counts.reduce(function(previous, count) { return previous + count; }, 0);
  var values = counts.map(function(count, i) { return {value: i, count: (count / totalCount) * 100}; });
  
  MG.data_graphic({
    data: values,
    binned: true,
    chart_type: "histogram",
    full_width: true, height: 800,
    left: 150, right: $("#distribution").width() / (values.length + 1) + 150, bottom: 90,
    transition_on_update: false,
    target: "#distribution",
    x_label: "Buckets", y_label: "Percentage of Samples",
    xax_count: values.length, xax_tick_length: 0.5,
    y_extended_ticks: true,
    x_accessor: "value", y_accessor: "count",
    xax_format: function(index) { return formatNumber(starts[index]); },
    yax_format: function(value) { return value + "%"; },
    mouseover: function(d, i) {
      var count = formatNumber(counts[d.x]), percentage = Math.round(d.y * 100) / 100 + "%";
      var label;
      if (starts[d.x] === 0) {
        label = count + " samples (" + percentage + ") where sample value < " + formatNumber(ends[d.x]) + " (underflow)";
      } else if (ends[d.x] === Infinity) {
        label = count + " samples (" + percentage + ") where sample value \u2265 " + formatNumber(starts[d.x]) + " (overflow)";
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
  $("#distribution .mg-x-axis text, .mg-y-axis text, .mg-histogram .axis text, .mg-baselines text, .mg-active-datapoint").css("font-size", "12px");
  $("#distribution .mg-x-axis .label").attr("dy", "2.5em");
  $("#distribution .mg-x-axis text:not(.label)").each(function(i, text) { // Axis tick labels
    if ($(text).text() === "NaN") { text.parentNode.removeChild(text); } // Remove "NaN" labels resulting from interpolation in histogram labels
    var y = text.getAttribute("y");
    text.setAttribute("y", "-" + text.getAttribute("x"));
    text.setAttribute("x", y);
    text.setAttribute("dx", "12");
    text.setAttribute("dy", "-1");
    text.setAttribute("text-anchor", "start");
    text.setAttribute("transform", "rotate(90)");
  });
  $("#distribution .mg-x-axis line").each(function(i, tick) { // Extend axis ticks to 15 pixels
    $(tick).attr("y2", parseInt($(tick).attr("y1")) + 12);
  });
  $("#distribution .mg-y-axis .label").attr("y", "55").attr("dy", "0");
  $("#distribution").css("border", "1px solid gray")
  
  // Extend the Y axis ticks to cover the last bucket
  var barWidth = parseFloat($("#distribution .mg-rollover-rects:last-child rect").attr("width"))
  $("#distribution .mg-extended-y-ticks").each(function(i, yTick) {
    var x2 = parseFloat(yTick.attributes.x2.value) + barWidth;
    yTick.setAttribute("x2", x2);
  });
}

function saveStateToURL() {
  var hashState = "#low=" + encodeURIComponent($("input[name=histogram-lower]").val()) +
                  "&high=" + encodeURIComponent($("input[name=histogram-upper]").val()) +
                  "&n_buckets=" + encodeURIComponent($("input[name=histogram-bucket-count]").val()) +
                  "&kind=" + encodeURIComponent($("#histogram-kind").val()) +
                  "&generate=" + encodeURIComponent($("input[name=generate]:checked").val());
  window.location.replace(window.location.origin + window.location.pathname + hashState);
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
