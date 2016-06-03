var gWidth;
var gHeight;

function graph_error(target, err) {
  MG.data_graphic({
    width: gWidth,
    height: gHeight,
    target: target,
    chart_type: "missing-data",
    error: err,
    missing_text: "Failed to load data.",
  });
}

document.addEventListener("DOMContentLoaded", function() {
  var s = d3.select("#beta-graph");
  gWidth = parseInt(s.style("width"));
  gHeight = parseInt(s.style("height"));

  get_beta_bydate().then(
    function(data) {
      setup_channel_graph(data, "beta");
    },
    graph_error.bind(undefined, "#beta-graph")
  );
  get_aurora_bydate().then(
    function(data) {
      setup_channel_graph(data, "aurora");
    },
    graph_error.bind(undefined, "#aurora-graph")
  );
  get_nightly_bydate().then(
    function(data) {
      setup_channel_graph(data, "nightly");
    },
    graph_error.bind(undefined, "#nightly-graph")
  );
  get_crashes(326, "d2f89374fbb282f44b299e1267f9c99771f59773").then(
    function(data) {
      setup_e10s_graph(data);
    },
    graph_error.bind(undefined, "#e10s-graph")
  );
});

function setup_channel_graph(data, channel) {
  var last_version = null;
  var markers = [];

  var rows = data.query_result.data.rows.filter(function(row) {
    return row.activity_date.getTime() < Date.now() - MS_PER_DAY * 2;
  });
  rows.forEach(function(row) {
    if (row.leading_version != last_version) {
      last_version = row.leading_version;
      markers.push({activity_date: row.activity_date, label: row.leading_version});
    }
  });

  MG.data_graphic({
    data: rows,
    width: gWidth,
    height: gHeight,
    target: "#" + channel + "-graph",
    x_accessor: 'activity_date',
    y_accessor: ['app_crash_rate', 'plugin_crash_rate'],
    legend: ["App crashes - main+content", "Plugin crashes - NPAPI+GMP"],
    legend_target: "#legend",
    // baselines: [{value: 10, label: "max app-crash rate"}, {value: 7.5, label: "max plugin-crash rate"}],
    markers: markers,
    interpolate: "linear",
    area: false,
    left: 60,
    buffer: 0,
    right: 0,
    max_y: 40,
    top: 12,
    bottom: 20,
    // show_rollover_text: false,
  });
}

function setup_e10s_graph(data) {
  var last_version = null;
  var markers = [];
  var rows = data.query_result.data.rows.filter(function(row) {
    return row.activity_date.getTime() < Date.now() - MS_PER_DAY * 2;
  });
  rows.forEach(function(row) {
    if (row.leading_version != last_version) {
      last_version = row.leading_version;
      markers.push({activity_date: row.activity_date, label: row.leading_version});
    }
  });

  var data_map = new Map();
  var processed = rows.filter(function(row) {
    return row.e10s_cohort == 'control';
  });
  processed.forEach(function(row) {
    data_map.set(row.activity_date_str, row);
  });
  data.query_result.data.rows.forEach(function(row) {
    if (['test', 'control_without_xp', 'test_without_xp'].includes(row.e10s_cohort)) {
      var base_row = data_map.get(row.activity_date_str);
      if (!base_row) {
        base_row = {
          activity_date: row.activity_date,
          activity_date_str: row.activity_date_str,
        };
        data_map.set(row.activity_date_str, base_row);
      }
      base_row[row.e10s_cohort + "_rate"] = row.app_crash_rate;
    }
  });
  MG.data_graphic({
    data: processed,
    width: gWidth,
    height: gHeight / 2,
    target: "#e10s-graph1",
    x_accessor: 'activity_date',
    y_accessor: ['app_crash_rate', 'test_rate'],
    markers: markers,
    interpolate: "linear",
    area: false,
    left: 85,
    buffer: 0,
    right: 0,
    max_y: 40,
    top: 12,
    bottom: 20,
    // show_rollover_text: false,
    missing_is_hidden: true,
    colors: ['purple', 'red'],
    legend: ['non-e10s', 'e10s'],
    legend_target: "#e10s-legend1",
    y_label: "With WinXP",
  });
  MG.data_graphic({
    data: processed,
    width: gWidth,
    height: gHeight / 2,
    target: "#e10s-graph2",
    x_accessor: 'activity_date',
    y_accessor: ['control_without_xp_rate', 'test_without_xp_rate'],
    markers: markers,
    interpolate: "linear",
    area: false,
    left: 85,
    buffer: 0,
    right: 0,
    max_y: 40,
    top: 12,
    bottom: 20,
    // show_rollover_text: false,
    missing_is_hidden: true,
    colors: ['purple', 'red'],
    legend: ['non-e10s', 'e10s'],
    legend_target: "#e10s-legend2",
    y_label: "Without WinXP",
  });
}
