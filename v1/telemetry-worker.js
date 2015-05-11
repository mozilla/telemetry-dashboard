importScripts("telemetry.js", "big.js")

var gActions = {
  "Histogram-count": function() {
    this.__proto__ = Telemetry.Histogram.prototype;
    return this.count();
  },
  "Histogram-precompute": function() {
    this.__proto__ = Telemetry.Histogram.prototype;
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.LOG_SUM);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.LOG_SUM_SQ);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM_SQ_LO);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.SUM_SQ_HI);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.SUBMISSIONS);
    this.precomputeAggregateQuantity(Telemetry.DataOffsets.FILTER_ID);
    var n = this._buckets.length;
    for (var i = 0; i < n; i++) {
      this.precomputeAggregateQuantity(i);
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