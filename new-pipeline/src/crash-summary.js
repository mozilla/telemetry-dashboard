var gData = crossfilter();
var gChannelDimension = gData.dimension((d) => d.channel);
var gBuildIDDimension = gData.dimension((d) => d.buildid);
var gDateDimension = gData.dimension((d) => d.subsessiondate);

var MS_PER_DAY = 1000 * 60 * 60 * 24;
var kBuildIDFormat = d3.time.format.utc('%Y%m%d%H%M%S');
var kYYYYMMDDFormat = d3.time.format.utc('%Y%m%d');
var kCommaFormat = d3.format(",f");
var k2Format = d3.format(",.2f");

var gMinDate = new Date();

var gPending = 0;
var gTotal = 0;

function update_status() {
  if (gPending) {
    indicate("Loading...", gPending / gTotal);
  } else {
    indicate();
  }
}

function load_date(date) {
  ++gPending; ++gTotal;
  update_status();

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
function BuildData(d) {
  if (!(this instanceof BuildData)) {
    return new BuildData(d);
  }
  this.buildid = d.key;
  this.date = kBuildIDFormat.parse(this.buildid);

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
    this.crashesdetectedmain / this.abortedsessioncount;
  this.main_crash_submit_rate =
    this.crashsubmitattemptmain / this.crashesdetectedmain;
  this.main_crash_submit_error_rate =
    (this.crashsubmitattemptmain - this.crashsubmitsuccessmain) / this.crashsubmitattemptmain;

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

var gGraphData;

function graph_it() {
  gPending = false;
  gChannelDimension.filter("nightly");
  let raw = gBuildIDDimension.group().reduce(counts_add, counts_sub, counts_initial)
    .orderNatural().all();

  let data = raw.map(BuildData).filter((d) => (d.subsessionlengths > 500000));
  gGraphData = data;

  // HOURS

  MG.data_graphic({
    title: "Usage Hours",
    description: "Total usage hours.",
    data: data,
    full_width: true,
    height: 200,
    target: '#hours-nightly',
    x_accessor: 'date',
    y_accessor: 'subsessionlengths',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    mouseover: function(d) {
      d3.select('#hours-nightly .mg-active-datapoint').text("BuildID: " + d.buildid + " Hours: " + kCommaFormat(d.subsessionlengths));
    },
    interpolate: 'step',
    linked: true,
    aggregate_rollover: true,
  });

  // MAIN CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Total counts of aborted sessions and detected crashes.",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortedsessioncount', 'crashesdetectedmain'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    mouseover: function(d) {
      d3.select('#maincrashes-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Aborted sessions: " + d.abortedsessioncount +
        " Crashes detected: " + d.crashesdetectedmain);
    },
    right: 85,
    legend: ['aborted-sessions', 'crashreporter'],
    interpolate: 'step',
    linked: true,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Main-process crash rate (per 1000 hours)",
    description: "The number of aborted sessions (non-clean shutdowns) and crashes per 1,000 hours of usage.",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['main_aborts_per_khour', 'main_crashes_per_khour'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    mouseover: function(d) {
      d3.select('#maincrashrate-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " aborted-session rate: " + k2Format(d.main_aborts_per_khour) +
        " crashreporter rate: " + k2Format(d.main_crashes_per_khour));
    },
    linked: true,
    interpolate: 'step',
    legend: ['aborted-sessions', 'crashreporter'],
    right: 85,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of aborted sessions (non-clean shutdowns) triggered the crashreporter?",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: 'main_crash_detect_rate',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    mouseover: function(d) {
      d3.select('#maincrashdetect-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Detection rate: " + d3.format('%')(d.main_crash_submit_rate));
    },
    linked: true,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected main-process crashes are submitted via the crashreporter?",
    data: data,
    full_width: true,
    height: 200,
    target: '#maincrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'main_crash_submit_rate',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    mouseover: function(d) {
      d3.select('#maincrashsubmit-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Submission rate: " + d3.format('.1%')(d.main_crash_submit_rate));
    },
    linked: true,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
    aggregate_rollover: true,
  });

  // PLUGIN CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Total counts of plugin aborts and detected crashes. This includes both NPAPI plugins and Gecko Media Plugins (GMP).",
    data: data,
    full_width: true,
    height: 325,
    target: '#plugincrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortsplugin', 'abortsgmplugin', 'crashesdetectedplugin', 'crashesdetectedgmplugin', 'pluginhangs'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*
    mouseover: function(d) {
      d3.select('#plugincrashes-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Aborted sessions: " + d.abortedsessioncount +
        " Crashes detected: " + d.crashesdetectedmain);
    },*/
    right: 85,
    legend: ['NPAPI aborts', 'GMP aborts', 'NPAPI crashes', 'GMP crashes', 'NPAPI hangs'],
    interpolate: 'step',
    linked: true,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Plugin crash rate (per 1000 hours)",
    description: "The number of aborted plugins and detected crashes per 1,000 hours of usage.",
    data: data,
    full_width: true,
    height: 325,
    target: '#plugincrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['npapi_aborts_per_khour', 'gmp_aborts_per_khour',
                 'npapi_crashes_per_khour', 'gmp_crashes_per_khour',
                 'npapi_hangs_per_khour'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#plugincrashrate-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " aborted-session rate: " + k2Format(d.main_aborts_per_khour) +
        " crashreporter rate: " + k2Format(d.main_crashes_per_khour));
    },*/
    linked: true,
    interpolate: 'step',
    legend: ['NPAPI aborts', 'GMP aborts',
             'NPAPI crashes', 'GMP crashes',
             'NPAPI hangs'],
    right: 85,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of plugin aborts triggered the crashreporter? (NPAPI and GMP separately)",
    data: data,
    full_width: true,
    height: 200,
    target: '#plugincrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: ['npapi_crash_detect_rate', 'gmp_crash_detect_rate'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#maincrashdetect-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Detection rate: " + d3.format('%')(d.main_crash_submit_rate));
    },*/
    linked: true,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    legend: ['NPAPI', 'GMP'],
    format: 'percentage',
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected plugins crashes are submitted via the crashreporter? (NPAPI and GMP combined)",
    data: data,
    full_width: true,
    height: 200,
    target: '#plugincrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'plugin_crash_submit_rate',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#maincrashsubmit-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Submission rate: " + d3.format('.1%')(d.main_crash_submit_rate));
    },*/
    linked: true,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
    aggregate_rollover: true,
  });

  // CONTENT CRASHES

  MG.data_graphic({
    title: "Crash counts",
    description: "Total counts of content aborts and detected crashes.",
    data: data,
    full_width: true,
    height: 325,
    target: '#contentcrashes-nightly',
    x_accessor: 'date',
    y_accessor: ['abortscontent', 'crashesdetectedcontent'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*
    mouseover: function(d) {
      d3.select('#plugincrashes-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Aborted sessions: " + d.abortedsessioncount +
        " Crashes detected: " + d.crashesdetectedmain);
    },*/
    right: 85,
    legend: ['aborts', 'crashes'],
    interpolate: 'step',
    linked: true,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Content crash rate (per 1000 hours)",
    description: "The number of content aborts and detected crashes per 1,000 hours of usage.",
    data: data,
    full_width: true,
    height: 325,
    target: '#contentcrashrate-nightly',
    x_accessor: 'date',
    y_accessor: ['content_aborts_per_khour', 'content_crashes_per_khour'],
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#plugincrashrate-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " aborted-session rate: " + k2Format(d.main_aborts_per_khour) +
        " crashreporter rate: " + k2Format(d.main_crashes_per_khour));
    },*/
    linked: true,
    interpolate: 'step',
    legend: ['aborts', 'crashes'],
    right: 85,
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Crash Detection Rate",
    description: "What percent of content aborts triggered the crashreporter?",
    data: data,
    full_width: true,
    height: 200,
    target: '#contentcrashdetect-nightly',
    x_accessor: 'date',
    y_accessor: 'content_crash_detect_rate',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#maincrashdetect-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Detection rate: " + d3.format('%')(d.main_crash_submit_rate));
    },*/
    linked: true,
    interpolate: 'step',
    // max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    // format: 'percentage',
    aggregate_rollover: true,
  });

  MG.data_graphic({
    title: "Submission rate",
    description: "What percent of detected content crashes are submitted via the crashreporter?",
    data: data,
    full_width: true,
    height: 200,
    target: '#contentcrashsubmit-nightly',
    x_accessor: 'date',
    y_accessor: 'content_crash_submit_rate',
    max_x: new Date(),
    min_x: new Date(Date.now() - MS_PER_DAY * 90),
    utc_time: true,
    /*mouseover: function(d) {
      d3.select('#maincrashsubmit-nightly .mg-active-datapoint').text(
        "BuildID: " + d.buildid +
        " Submission rate: " + d3.format('.1%')(d.main_crash_submit_rate));
    },*/
    linked: true,
    interpolate: 'step',
    max_y: 1,
    yax_format: d3.format('%'),
    yax_count: 5,
    format: 'percentage',
    aggregate_rollover: true,
  });
}

$(function() {
  let now = Date.now();
  for (let i = 0; i < 45; ++i) {
    let d = new Date(now - MS_PER_DAY * i);
    load_date(d);
  }
});

$(window).resize(function() {
  if (gPending == 0) {
    graph_it();
  }
});
