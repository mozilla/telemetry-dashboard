var gData = crossfilter();
var gChannelDimension = gData.dimension((d) => d.channel);
var gBuildIDDimension = gData.dimension((d) => d.buildid);
var gDateDimension = gData.dimension((d) => d.subsessiondate);

var MS_PER_DAY = 1000 * 60 * 60 * 24;
var kBuildIDFormat = d3.time.format.utc('%Y%m%d%H%M%S');
var kYYYYMMDDFormat = d3.time.format.utc('%Y%m%d');
var kCommaFormat = d3.format(",f");
var k2Format = d3.format(",.2f");
var kPctFormat = d3.format("%");

var gPending = 0;
var gTotal = 0;

var gChannel = "nightly";
var gSort = "buildid";

function update_status() {
  if (gPending) {
    indicate("Loading...", gPending / gTotal * 100);
  } else {
    indicate();
  }
}

var gMinDate = new Date();

function load_date(date) {
  ++gPending;
  ++gTotal;
  update_status();

  if (date < gMinDate) {
    gMinDate = date;
  }

  let date_str = d3.time.format('%Y%m%d')(date);
  let url = d3.time.format('http://analysis-output.telemetry.mozilla.org/stability-rollups/%Y/%Y%m%d-summary.json.gz')(date);
  d3.json(url)
    .on("load", function(data) {
      for (let d of data) {
        d.subsessiondate = date_str;
      }
      gData.add(data);
      --gPending;
      if (gPending == 0) {
        graph_it();
      }
      update_status();
    })
    .on("error", function(err) {
      console.error("Error loading data", url, err);
      --gPending;
      if (gPending == 0) {
        graph_it();
      }
      update_status();
    })
    .get();
}

var kProperties = [
  ['abortedsessioncount', null],
  ['subsessionlengths', (v) => (v / 360)],
  ['abortsplugin', null],
  ['abortscontent', null],
  ['abortsgmplugin', null],
  ['crashesdetectedmain', null],
  ['crashesdetectedplugin', null],
  ['pluginhangs', null],
  ['crashesdetectedcontent', null],
  ['crashesdetectedgmplugin', null],
  ['crashsubmitattemptmain', null],
  ['crashsubmitattemptcontent', null],
  ['crashsubmitattemptplugin', null],
  ['crashsubmitsuccessmain', null],
  ['crashsubmitsuccesscontent', null],
  ['crashsubmitsuccessplugin', null]];

function counts_initial() {
  let r = {};
  for (let [prop, idfunc] of kProperties) {
    r[prop] = 0;
  }
  return r;
}
function counts_add(c, d) {
  let r = {};
  for (let [prop, idfunc] of kProperties) {
    r[prop] = c[prop] + d[prop];
  }
  return r;
}
function counts_sub(c, d) {
  let r = {};
  for (let [prop, idfunc] of kProperties) {
    r[prop] = c[prop] - d[prop];
  }
  return r;
}
function BuildData(d, by_buildid) {
  if (!(this instanceof BuildData)) {
    return new BuildData(d);
  }
  if (by_buildid) {
    this.buildid = d.key;
    this.date = kBuildIDFormat.parse(this.buildid);
  } else {
    this.subsessiondate = d.key;
    this.date = kYYYYMMDDFormat.parse(this.subsessiondate);
  }

  for (let [prop, idfunc] of kProperties) {
    let v = d.value[prop];
    if (idfunc) {
      v = idfunc(v);
    }
    this[prop] = v;
  }

  // These should be getters on the prototype, but MetricsGraphics won't
  // render those. I don't know why.
  this.main_aborts_per_khour =
    this.abortedsessioncount / this.subsessionlengths * 1000;
  this.main_crashes_per_khour =
    this.crashesdetectedmain / this.subsessionlengths * 1000;
  this.main_crash_detect_rate =
    this.crashesdetectedmain / this.abortedsessioncount || 0;
  this.main_crash_submit_rate =
    this.crashsubmitattemptmain / this.crashesdetectedmain || 0;
  this.main_crash_submit_error_rate =
    (this.crashsubmitattemptmain - this.crashsubmitsuccessmain) / this.crashsubmitattemptmain || 0;

  this.npapi_aborts_per_khour =
    this.abortsplugin / this.subsessionlengths * 1000;
  this.gmp_aborts_per_khour =
    this.abortsgmplugin / this.subsessionlengths * 1000;
  this.npapi_crashes_per_khour =
    this.crashesdetectedplugin / this.subsessionlengths * 1000;
  this.gmp_crashes_per_khour =
    this.crashesdetectedgmplugin / this.subsessionlengths * 1000;
  this.npapi_hangs_per_khour =
    this.pluginhangs / this.subsessionlengths * 1000;

  this.npapi_crash_detect_rate =
    (this.crashesdetectedplugin + this.pluginhangs) / this.abortsplugin || 0;
  this.gmp_crash_detect_rate =
    this.crashesdetectedgmplugin / this.abortsgmplugin || 0;
  this.plugin_crash_submit_rate =
    this.crashsubmitattemptplugin / (this.crashesdetectedplugin + this.pluginhangs + this.crashesdetectedgmplugin) || 0;

  this.content_aborts_per_khour =
    this.abortscontent / this.subsessionlengths * 1000;
  this.content_crashes_per_khour =
    this.crashesdetectedcontent / this.subsessionlengths * 1000;
  this.content_crash_detect_rate =
    this.crashesdetectedcontent / this.abortscontent;
  this.content_crash_submit_rate =
    this.crashsubmitattemptcontent / this.crashesdetectedcontent;
}

function do_mouseover(d) {
  if (gSort == "buildid") {
    d3.select("#detail-sort-label").text("Build ID");
    d3.select("#detail-sort-value").text(d.buildid);
  } else {
    d3.select("#detail-sort-label").text("Date");
    d3.select("#detail-sort-value").text(d3.time.format("%a %Y-%d-%m")(d.date));
  }
  d3.select("#detail-hours").text(kCommaFormat(d.subsessionlengths));
  d3.select("#detail-mainaborts").text(kCommaFormat(d.abortedsessioncount));
  d3.select("#detail-mainaborts-rate").text(k2Format(d.main_aborts_per_khour));
  d3.select("#detail-maincrashes").text(kCommaFormat(d.crashesdetectedmain));
  d3.select("#detail-maincrashes-rate").text(k2Format(d.main_crashes_per_khour));
  d3.select("#detail-main-detection-rate").text(kPctFormat(d.main_crash_detect_rate));
  d3.select("#detail-main-submission-rate").text(kPctFormat(d.main_crash_submit_rate));
  d3.select("#detail-pluginaborts").text(kCommaFormat(d.abortsplugin));
  d3.select("#detail-pluginaborts-rate").text(k2Format(d.npapi_aborts_per_khour));
  d3.select("#detail-plugincrashes").text(kCommaFormat(d.crashesdetectedplugin));
  d3.select("#detail-plugincrash-rate").text(k2Format(d.npapi_crashes_per_khour));
  d3.select("#detail-plugin-detection-rate").text(kPctFormat(d.npapi_crash_detect_rate));
  d3.select("#detail-pluginhangs").text(kCommaFormat(d.pluginhangs));
  d3.select("#detail-pluginhang-rate").text(k2Format(d.npapi_hangs_per_khour));
  d3.select("#detail-gmpluginaborts").text(kCommaFormat(d.abortsgmplugin));
  d3.select("#detail-gmpluginaborts-rate").text(k2Format(d.gmp_aborts_per_khour));
  d3.select("#detail-gmpluginaborts").text(kCommaFormat(d.abortscontent));
  d3.select("#detail-gmplugincrashes").text(kCommaFormat(d.crashesdetectedcontent));
  d3.select("#detail-gmpluginaborts-rate").text(k2Format(d.content_aborts_per_khour));
  d3.select("#detail-gmplugincrash-rate").text(k2Format(d.content_crashes_per_khour));
  d3.select("#detail-plugin-submission-rate").text(d3.format(".2%")(d.plugin_crash_submit_rate));

  d3.select("#detail-contentaborts").text(kCommaFormat(d.abortscontent));
  d3.select("#detail-contentcrashes").text(kCommaFormat(d.crashesdetectedcontent));
  d3.select("#detail-contentaborts-rate").text(k2Format(d.content_aborts_per_khour));
  d3.select("#detail-contentcrashes-rate").text(k2Format(d.content_crashes_per_khour));
  d3.select("#detail-content-detection-rate").text(kPctFormat(d.content_crash_detect_rate));
  d3.select("#detail-content-submission-rate").text(kPctFormat(d.content_crash_submit_rate));

  let details = $("#hover-details");
  let width = parseInt(details.css("width"));
  let height = parseInt(details.css("height"));

  let [x, y] = d3.mouse(document.documentElement);
  let position = { left: x - width - 5, top: y - height - 5 };
  if (position.left < 5) {
    position.left = x + 5;
  }
  if (position.top < 5) {
    position.top = y + 5;
  }
  details.offset(position).toggleClass("invisible", false);
}
function do_mouseout() {
  d3.select("#hover-details").classed("invisible", true);
}

function graph_it() {
  gChannelDimension.filter(gChannel);

  let group;
  switch (gSort) {
  case "buildid":
    group = gBuildIDDimension.group();
    break;
  case "date":
    group = gDateDimension.group();
    break;
  default:
    throw new Error("Unexpected gSort");
  }

  let raw = group.reduce(counts_add, counts_sub, counts_initial)
    .orderNatural().all();

  let data = raw
    .map((d) => (new BuildData(d, gSort == "buildid")))
    .filter((d) => (d.date != null && d.subsessionlengths > 500000));
  window.gGraphData = data;

  // HOURS

  let max_x = new Date();

  MG.data_graphic({
    title: "Usage Hours",
    description: "Total usage hours: sum of main-pings payload.subsessionlength converted to hours",
    data: data,
    full_width: true,
    height: 200,
    target: '#hours-nightly',
    x_accessor: 'date',
    y_accessor: 'subsessionlengths',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    mouseover: do_mouseover,
    mouseout: do_mouseout,
    interpolate: 'step',
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
  });

  // MAIN CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Aborts: main pings with payload.reason = 'aborted-session'. Crashes: counts crash pings, which should be equivalent to the crash reporter being triggered.",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortedsessioncount', 'crashesdetectedmain'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    right: 85,
    legend: ['aborts', 'crashes'],
    interpolate: 'step',
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
  });

  MG.data_graphic({
    title: "Main-process crash rate (per 1000 hours)",
    description: "A calculated ratio of crashes and aborts (above) over total usage hours (also above).",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['main_aborts_per_khour', 'main_crashes_per_khour'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    legend: ['aborted-sessions', 'crashreporter'],
    right: 85,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of aborted sessions triggered the crashreporter? Calculated crashes (above) divided by aborts (above).",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: 'main_crash_detect_rate',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
  });

  data.forEach((d) => {
    if (isNaN(d.main_crash_submit_rate)) {
      console.log("Found bad submit rate", d);
    }
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected main-process crashes (above) are submitted via the crashreporter? Calculated from the PROCESS_CRASH_SUBMIT_ATTEMPT histogram for type='main' over detected crashes (above)",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'main_crash_submit_rate',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
  });

  // PLUGIN CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Total counts of plugin aborts and detected crashes. This includes both NPAPI plugins and Gecko Media Plugins (GMP). Calculated from the SUBPROCESS_ABRNORMAL_ABORT and SUBPROCESS_CRASHES_WITH_DUMP histograms.",
    data: data,
    full_width: true,
    height: 325,
    target: '#plugincrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortsplugin', 'abortsgmplugin', 'crashesdetectedplugin', 'crashesdetectedgmplugin', 'pluginhangs'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    right: 85,
    legend: ['NPAPI aborts', 'GMP aborts', 'NPAPI crashes', 'GMP crashes', 'NPAPI hangs'],
    interpolate: 'step',
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
  });

  MG.data_graphic({
    title: "Plugin crash rate (per 1000 hours)",
    description: "A calculated ratio of aborts and crashes (above) per usage hour (above).",
    data: data,
    full_width: true,
    height: 325,
    target: '#plugincrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['npapi_aborts_per_khour', 'gmp_aborts_per_khour',
                 'npapi_crashes_per_khour', 'gmp_crashes_per_khour',
                 'npapi_hangs_per_khour'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    legend: ['NPAPI aborts', 'GMP aborts',
             'NPAPI crashes', 'GMP crashes',
             'NPAPI hangs'],
    right: 85,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of plugin aborts were counted as crashes that triggered the crashreporter? (NPAPI and GMP separately). Calculated ratio of the two metrics above.",
    data: data,
    full_width: true,
    height: 200,
    target: '#plugincrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: ['npapi_crash_detect_rate', 'gmp_crash_detect_rate'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    legend: ['NPAPI', 'GMP'],
    format: 'percentage',
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected plugins crashes are submitted via the crashreporter? (NPAPI and GMP combined.) Calculated PROCESS_CRASH_SUBMIT_ATTEMPT histogram divided by total detected crashes.",
    data: data,
    full_width: true,
    height: 200,
    target: '#plugincrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'plugin_crash_submit_rate',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
  });

  // CONTENT CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Total counts of content aborts and detected crashes. Calculated from the SUBPROCESS_ABRNORMAL_ABORT and SUBPROCESS_CRASHES_WITH_DUMP histograms.",
    data: data,
    full_width: true,
    height: 325,
    target: '#contentcrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortscontent', 'crashesdetectedcontent'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    right: 85,
    legend: ['aborts', 'crashes'],
    interpolate: 'step',
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
  });

  MG.data_graphic({
    title: "Content crash rate (per 1000 hours)",
    description: "A calculated ratio of aborts and crashes (above) per usage hour (above).",
    data: data,
    full_width: true,
    height: 325,
    target: '#contentcrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['content_aborts_per_khour', 'content_crashes_per_khour'],
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    legend: ['aborts', 'crashes'],
    right: 85,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of content aborts triggered the crashreporter? Calculated ratio of the two metrics above.",
    data: data,
    full_width: true,
    height: 200,
    target: '#contentcrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: 'content_crash_detect_rate',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    // max_y: 1, THIS IS A DATA ERROR BEING FIXED SOON
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected content crashes are submitted via the crashreporter? Calculated PROCESS_CRASH_SUBMIT_ATTEMPT histogram divided by total detected crashes.",
    data: data,
    full_width: true,
    height: 200,
    target: '#contentcrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'content_crash_submit_rate',
    max_x: max_x,
    min_x: gMinDate,
    utc_time: true,
    linked: true,
    linked_format: '%Y%m%d%H%M%S',
    show_rollover_text: false,
    area: false,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
  });
}

$(function() {
  let now = Date.now();
  for (let i = 0; i < 45; ++i) {
    let d = new Date(now - MS_PER_DAY * i);
    if (d < kYYYYMMDDFormat.parse("20151011")) {
      break;
    }
    load_date(d);
  }
});

$(window).resize(function() {
  if (gPending == 0) {
    graph_it();
  }
});

$("#channel-dropdown").on("click", "a", function() {
  gChannel = $(this).attr("data-channel");
  $("#channel-value").text($(this).text());
  if (gPending == 0) {
    graph_it();
  }
});

$("#sort-dropdown").on("click", "a", function() {
  gSort = $(this).attr("data-sort");
  $("#sort-value").text($(this).text());
  if (gPending == 0) {
    graph_it();
  }
});
