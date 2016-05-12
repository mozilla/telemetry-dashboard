function fetch_result(result_id, api_key) {
  var url = "https://sql.telemetry.mozilla.org/api/queries/" + result_id + "/results.json?api_key=" + api_key;
  // LOCAL TESTING var url = result_id + ".json";

  return d3.json(url).get();
}

function get_crashes(result_id, api_key) {
  return new Promise(function(resolve, reject) {
    fetch_result(result_id, api_key).on("error", function(e) {
      console.error("Failed to load result set.", result_id, e);
      reject(e);
    }).on("load", function(r) {
      r.query_result.data.rows.forEach(function(row) {
        row.activity_date_str = row.activity_date;
        row.activity_date = d3.time.format("%Y-%m-%d").parse(row.activity_date);
        row.app_crash_rate = (row.main_crashes + row.content_crashes) / row.usage_khours;
        row.plugin_crash_rate = (row.npapi_plugin_crashes + row.media_plugin_crashes) / row.usage_khours;
      });
      resolve(r);
    });
  });
}

function get_beta_bydate() {
  return get_crashes(322, "82551524acb38eb45f20d203b0004831b54c9696");
}
function get_aurora_bydate() {
  return get_crashes(199, "705e86e3e080611aa21e693ba0187190af902c8b");
}
function get_nightly_bydate() {
  return get_crashes(200, "b6e185e0535b32b5c6da5272ae59d8f5e08da1c4");
}
