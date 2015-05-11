importScripts("../v1/telemetry.js")

var gActions = {
  "Histogram-count": Telemetry.Histogram.prototype.count,
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