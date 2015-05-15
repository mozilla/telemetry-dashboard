importScripts("telemetry.js", "big.js")

var gActions = {
  Histogram_count: function() {
    // Make a shallow copy of the input object that is also a Telemetry.Histogram instance
    var histogram = new Telemetry.Histogram(this._measure, this._filter_path, this._buckets, this._dataset, this._filter_tree, this._spec);
    for (var key in this) {
      if (this.hasOwnProperty(key)) {
        histogram[key] = this[key];
      }
    }
    
    var result = histogram.count();
    
    // Copy all the fields back into the input object
    for (var key in histogram) {
      if (histogram.hasOwnProperty(key)) {
        this[key] = histogram[key];
      }
    }
    return result;
  },
  Histogram_precompute: function() {
    // Make a shallow copy of the input object that is also a Telemetry.Histogram instance
    var histogram = new Telemetry.Histogram(this._measure, this._filter_path, this._buckets, this._dataset, this._filter_tree, this._spec);
    for (var key in this) {
      if (this.hasOwnProperty(key)) {
        histogram[key] = this[key];
      }
    }
    
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.LOG_SUM);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.LOG_SUM_SQ);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM_SQ_LO);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM_SQ_HI);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.SUBMISSIONS);
    histogram.precomputeAggregateQuantity(Telemetry.DataOffsets.FILTER_ID);
    var n = histogram._buckets.length;
    for (var i = 0; i < n; i++) {
      histogram.precomputeAggregateQuantity(i);
    }
    
    // Copy all the fields back into the input object
    for (var key in histogram) {
      if (histogram.hasOwnProperty(key)) {
        this[key] = histogram[key];
      }
    }
  },
}

onmessage = function(e) {
  var payload = e.data;
  if (payload.action in gActions) {
    var result = gActions[payload.action].apply(payload.thisValue, payload.args);
    postMessage({"thisValue": payload.thisValue, "result": result });
  } else {
    postMessage(null);
  }
  close();
}