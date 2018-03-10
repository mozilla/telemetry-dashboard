/* -*- js-indent-level: 2; indent-tabs-mode: nil -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var ANALYSIS_URI = "https://analysis-output.telemetry.mozilla.org/probe-scraper/data-rest/";

var gChannelInfo = null;
var gGeneralData = null;
var gRevisionsData = null;
var gProbeData = null;
var gEnvironmentData = null;
var gSimpleMeasurementsData = null;
var gDatasetMappings = null;

var gView = null;
var gDetailViewId = null;

function mark(marker) {
  if (performance.mark) {
    performance.mark(marker);
  }
  console.timeStamp(marker);
}

function promiseGetJSON(file, base_uri = ANALYSIS_URI) {
  return new Promise((resolve, reject) => {
    $.ajax({
      url: base_uri + file,
      cache: true,
      dataType: "json",
      complete: data => {
        mark("loaded " + file);
        resolve(data);
      },
    });
  });
}

function makeDelay(ms) {
  var timer = 0;
  return (callback) => {
    clearTimeout(timer);
    timer = setTimeout(callback, ms);
  };
};

$(document).ready(function() {
  mark("document ready");

  var loads = [
    promiseGetJSON("firefox/general"),
    promiseGetJSON("firefox/revisions"),
    promiseGetJSON("firefox/all/main/all_probes"),
    promiseGetJSON("environment.json", ""),
    promiseGetJSON("other_fields.json", ""),
    promiseGetJSON("datasets.json", ""),
  ];

  Promise.all(loads).then(values => {
    mark("all json loaded");
    [gGeneralData, gRevisionsData, gProbeData, gEnvironmentData, gSimpleMeasurementsData, gDatasetMappings] = values;

    extractChannelInfo();
    processOtherFieldData(gEnvironmentData);
    processOtherFieldData(gSimpleMeasurementsData);
    renderVersions();
    loadURIData();
    update();

    mark("updated site");

    // Tab change events.
    $('a[data-toggle="tab"]').on('show.bs.tab', tabChange);
    $('a[data-toggle="tab"]').on('shown.bs.tab', updateSearchParams);

    // Search view events.
    $("#select_constraint").change(update);
    $("#select_version").change(update);
    $("#select_version").keyup(update);
    $("#select_channel").change(update);
    $("#optout").change(update);
    $("#search_constraint").change(update);
    $(window).on('popstate', loadURIData);

    var delaySearch = makeDelay(50);
    $("#text_search").keyup(() => delaySearch(update));

    // Add detail view events.
    $(document).keyup(e => {
      // Catch Escape key presses.
      if ((e.which == 27) && gDetailViewId) {
        hideDetailView();
      }
    });
    $("#close-detail-view").click(() => {
      hideDetailView();
    });

    // Add when the data was last updated.
    let date = new Date(gGeneralData.lastUpdate);
    $("#last-updated-date").text(date.toDateString());

    $("#loading-overlay").addClass("hidden");
    mark("done");
  }, e => {
    console.log("caught", e);
  });
});

function extractChannelInfo() {
  var result = {};
  gChannelInfo = {
    "any": {
      versions: {}
    }
  };

  $.each(gRevisionsData, (channel, revs) => {
    $.each(revs, (rev, details) => {
      if (!(channel in gChannelInfo)) {
        gChannelInfo[channel] = {versions: {}};
      }
      gChannelInfo[channel].versions[details.version] = rev;
    });
  });
}

function processOtherFieldData(otherData) {
  $.each(otherData, (id, data) => {
    // Explode data that's common between all channels.
    if ("all" in data.history) {
      for (let channel of ["release", "beta", "nightly"]) {
        data.history[channel] = data.history["all"];
      }
      delete data.history["all"];
    }

    gProbeData[id] = data;
  });
}

function update() {
  updateUI();

  if ($("#search-results-view").hasClass("active")) {
    renderProbeSearch();
    showSearchOnlyFilters(true);
  } else if ($("#stats-view").hasClass("active")) {
    renderProbeStats();
    showSearchOnlyFilters(false);
  }

  updateSearchParams();
}

function tabChange(target, relatedTarget) {
  switch (target.currentTarget.hash) {
    case "#stats-view":
      showSearchOnlyFilters(false);
      renderProbeStats();
      break;
    case "#search-results-view":
      showSearchOnlyFilters(true);
      renderProbeSearch();
      break;
  }
}

function showSearchOnlyFilters(show) {
  let searchOnlyElements = [
    "#version-selection-element",
    "#optout-selection-element",
    "#text-search-element",
    "#select_channel option[value=any]"
  ];

  if (show) {
    for (let id of searchOnlyElements) {
      $(id).removeClass("hidden");
    }
  } else {
    for (let id of searchOnlyElements) {
      $(id).addClass("hidden");
    }

    var channel = $("#select_channel").val();
    if (!["release", "beta", "nightly", "any"].includes(channel)) {
      $("#select_channel").val("any");
    }
  }
}

function updateUI() {
  var last = array => array[array.length - 1];

  var channel = $("#select_channel").val();
  var version = $("#select_version").val();
  var channelInfo = gChannelInfo[channel];

  // Pre-release measurements were never valuable for the release channel.
  // Avoid mistakes by defaulting to only showing release probes.
  const isRelease = channel == "release";
  $("#optout").prop("disabled", isRelease);
  if (isRelease) {
    $("#optout").prop("checked", true);
  }

  // Show only versions available for this channel.
  $("#select_version > option").each(function() {
    $(this).toggle((this.value == "any") || (this.value in channelInfo.versions));
  });

  if (version == "any") {
    return;
  }

  // Use the closest valid version if an unavailable one was selected.
  if (!(version in channelInfo.versions)) {
    var versions = Object.keys(channelInfo.versions).sort();
    if (parseInt(version) < parseInt(versions[0])) {
      version = versions[0];
    }
    if (parseInt(version) > parseInt(last(versions))) {
      version = last(versions);
    }
  }

  $("#select_version").val(version);
}

function getVersionRange(channel, revisionsRange) {
  var range = {
    first: null,
    last: null,
  };

  if (revisionsRange.first) {
    range.first = parseInt(gRevisionsData[channel][revisionsRange.first].version);
  } else {
    range.first = parseInt(revisionsRange.firstVersion);
  }

  var last = revisionsRange.last;
  if (last == "latest") {
    range.last = Math.max.apply(null, Object.keys(gChannelInfo[channel].versions));
  } else {
    range.last = parseInt(gRevisionsData[channel][revisionsRange.last].version);
  }

  return range;
}

function renderProbeSearch() {
  var filtered = filterMeasurements();
  renderMeasurements(filtered);
  renderSearchStats(filtered);
}

function filterMeasurements() {
  var version_constraint = $("#select_constraint").val();
  var optout = $("#optout").prop("checked");
  var version = $("#select_version").val();
  var selected_channel = $("#select_channel").val();
  var text_search = $("#text_search").val();
  var text_constraint = $("#search_constraint").val();
  var measurements = gProbeData;

  // Filter out by selected criteria.
  var filtered = {};
  var channels = [selected_channel];
  if (selected_channel == "any") {
    channels = ["nightly", "beta", "release"];
  }

  $.each(measurements, (id, data) => {
    for (let channel of channels) {
      if (!(channel in data.history)) {
        return;
      }
      var history = data.history[channel];

      // Filter by optout.
      if (optout) {
        history = history.filter(m => m.optout);
      }

      // Filter for version constraint.
      if (version != "any") {
        var versionNum = parseInt(version);
        history = history.filter(m => {
          switch (version_constraint) {
            case "is_in":
              var versions = getVersionRange(channel, m.revisions);
              var expires = m.expiry_version;
              return (versions.first <= versionNum) && (versions.last >= versionNum) &&
                     ((expires == "never") || (parseInt(expires) >= versionNum));
            case "new_in":
              var versions = getVersionRange(channel, m.revisions);
              return versions.first == versionNum;
            case "is_expired":
              var versions = getVersionRange(channel, m.revisions);
              var expires = m.expiry_version;
              return (versions.first <= versionNum) && (versions.last >= versionNum) &&
                     (expires != "never") && (parseInt(expires) <= versionNum);
            default:
              throw "Yuck, unknown selector.";
          }
        });
      } else if (version_constraint == "is_expired") {
        history = history.filter(m => m.expiry_version != "never");
      }

      // Filter for text search.
      if (text_search != "") {
        var s = text_search.toLowerCase();
        var test = (str) => str.toLowerCase().includes(s);
        history = history.filter(h => {
          switch (text_constraint) {
            case "in_name": return test(data.name);
            case "in_description": return test(h.description);
            case "in_any": return test(data.name) || test(h.description);
            default: throw "Yuck, unsupported text search constraint.";
          }
        });
      }

      // Extract properties
      if (history.length > 0) {
        filtered[id] = {};
        for (var p of Object.keys(measurements[id])) {
          filtered[id][p] = measurements[id][p];
        }
        filtered[id]["history"][channel] = history;
      }
    }
  });

  return filtered;
}

function renderVersions() {
  var select = $("#select_version");
  var current_channel = $("#select_channel").val();
  var versions = new Set();

  $.each(gRevisionsData, (channel, revs) => {
    $.each(gRevisionsData[channel], (rev, details) => {
      versions.add(details.version);
    });
  });

  versions = [...versions.values()].sort().reverse();

  for (var version of versions) {
    select.append("<option value=\""+version+"\" >"+version+"</option>");
  }
}

function getTelemetryDashboardURL(dashType, name, type, channel, min_version="null", max_version="null") {
  if (!['dist', 'evo'].includes(dashType)) {
    console.log.error('wrong dashType');
    return "";
  }

  if (!["histogram", "scalar", "simpleMeasurements"].includes(type)) {
    return "";
  }

  // The aggregator/TMO data uses different naming schemes for non-histograms probes.
  if (type == "scalar") {
    name = 'SCALARS_' + name.toUpperCase();
  } else if (type == "simpleMeasurements") {
    name = 'SIMPLE_MEASURES_' + name.toUpperCase();
  }

  return `https://telemetry.mozilla.org/new-pipeline/${dashType}.html#!` +
          `max_channel_version=${channel}%252F${max_version}&`+
          `min_channel_version=${channel}%252F${min_version}&` +
          `measure=${name}` +
          `&product=Firefox`;
}

function escapeHtml(text) {
  return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function shortVersion(v) {
  return v.split(".")[0];
}

function friendlyRecordingRange(firstVersion, expiry) {
  if (expiry == "never") {
    return `from ${firstVersion}`;
  }
  return `${firstVersion} to ${parseInt(shortVersion(expiry)) - 1}`;
}

function friendlyRecordingRangeForState(state, channel) {
  const firstVersion = getVersionRange(channel, state["revisions"]).first;
  const expiry = state.expiry_version;
  return friendlyRecordingRange(firstVersion, expiry);
}

function friendlyRecordingRangeForHistory(history, channel) {
  const last = array => array[array.length - 1];
  const firstVersion = getVersionRange(channel, history[0]["revisions"]).first;
  const expiry = last(history).expiry_version;
  return friendlyRecordingRange(firstVersion, expiry);
}

// https://stackoverflow.com/questions/19158559/how-to-fix-a-header-on-scroll Used this to learn scroll

function makeSticky() {
  $(window).scroll(function(){
    var sticky = $('.sticky'),
        scroll = $(window).scrollTop(),
        stickyTop = sticky.offset().top;

    if (scroll >= stickyTop) sticky.addClass('fixed');
    else sticky.removeClass('fixed');
    // console.log("sticky top: ", stickyTop);
    // console.log("scroll top: ", scroll);
  });
}

function renderMeasurements(measurements) {
  var selected_channel = $("#select_channel").val();
  var container = $("#measurements");
  var items = [];

  var rawColumns = [
    ["", (d, h, c) => '<span class="btn btn-outline-secondary btn-sm">+<span>'],
    ["name", (d, h, c) => d.name],
    ["type", (d, h, c) => d.type],
    ["population", (d, h, c) => h.optout ? "release" : "prerelease"],
    ["recorded", (d, h, c, history) => friendlyRecordingRangeForHistory(history, c)],
    // TODO: overflow should cut off
    ["description", (d, h, c) => escapeHtml(h.description)],
  ];

  var columns = new Map(rawColumns);

  var table = '<table id="search-results-table">';
  table += ("<tr class='search-results-header sticky'><th>" + [...columns.keys()].join("</th><th>") + "</th></tr>");

  var name = probeId => probeId.split("/")[1];
  var sortedProbeKeys = Object.keys(measurements)
                              .sort((a, b) => name(a).toLowerCase().localeCompare(name(b).toLowerCase()));
  sortedProbeKeys.forEach(id => {
    var data = measurements[id];
    for (let [channel, history] of Object.entries(data.history)) {
      // TODO: Why do we include the following in the filtering stage? Fix this.
      // Only show channels that we should show now.
      if ((selected_channel !== "any") && (channel !== selected_channel)) {
        continue;
      }
      if (channel == "aurora") {
        continue;
      }
      // When not filtering by channel, it's confusing to show multiple rows for each probe (one for each channel).
      // The short-term hack here to improve this is to only show the release channel state.
      // TODO: solve this better.
      if ((selected_channel === "any") && (channel !== "release")) {
        continue;
      }
      // Don't show pre-release measurements for the release channel.
      if (!history[0].optout && (channel == "release") && (selected_channel !== "any")) {
        continue;
      }

      var cells = [...columns.entries()].map(([field, fn]) => {
        var d = fn(data, history[0], channel, history);
        return `<td class="search-results-field-${field}">${d}</td>`;
      });
      table += `<tr onclick="showDetailView(this); return false;" probeid="${id}" channel="${channel}">`;
      table += cells.join("");
      table += `</tr>`;
    }
  });

  table += "</table>";
  items.push(table);

  container.empty();
  container.append(items.join(""));

  makeSticky();
}

function renderSearchStats(filtered) {
  var count = Object.keys(filtered).length;
  $("#stats").text("Found " + count + " probes.");
}

function loadURIData() {
  let url = new URL(window.location.href.replace(/\/$/, ""));
  let params = url.searchParams;

  if (params.has("search")) {
    $("#text_search").val(params.get("search"));
  }

  if (params.has("view")) {
    //$("#" + params.get("view")).tab("show");
    $('a[href="#' + params.get("view") + '"]').tab("show");
  }

  if (params.has("searchtype")) {
    let val = params.get("searchtype");
    if (["in_name", "in_description", "in_any"].includes(val)) {
      $("#search_constraint").val(val);
    }
  }

  if (params.has("optout")) {
    let optout = params.get("optout");
    if (["true", "false"].includes(optout)) {
      $("#optout").prop("checked", optout == "true");
    }
  }

  if (params.has("channel")) {
    let channel = params.get("channel");
    if (["release", "beta", "aurora", "nightly", "any"].includes(channel)) {
      $("#select_channel").val(channel);
    }
  }

  if (params.has("constraint")) {
    let val = params.get("constraint");
    if (["is_in", "new_in", "is_expired"].includes(val)) {
      $("#select_constraint").val(val);
    }
  }

  if (params.has("version")) {
    let val = params.get("version");
    if (val == "any" || val.match(/^[0-9]+$/)) {
      $("#select_version").val(val);
    }
  }

  if (params.has("detailView")) {
    let val = params.get("detailView");
    let id = findProbeIdFromCaseInsensitive(val);
    let channel = params.has("channel") ? params.get("channel") : undefined;
    if (id) {
      showDetailViewForId(id, channel);
    }
  } else {
    hideDetailView();
  }
}

function updateSearchParams(pushState = false) {
  let params = {
    search: $("#text_search").val(),
    searchtype: $("#search_constraint").val(),
    optout: $("#optout").prop("checked"),
    channel: $("#select_channel").val(),
    constraint: $("#select_constraint").val(),
    version: $("#select_version").val(),
    view: $("#main-tab-holder div.active").attr("id"),
  };

  if (gDetailViewId) {
    params.detailView = gDetailViewId;
  }

  if (!pushState) {
    window.history.replaceState("", "", "?" + $.param(params));
  } else {
    window.history.pushState("", "", "?" + $.param(params));
  }
}

function showDetailView(obj) {
  const probeId = obj.getAttribute('probeid');
  const channel = obj.getAttribute('channel');
  gDetailViewId = probeId;
  updateSearchParams(true);
  showDetailViewForId(probeId, channel);
}

function linkedProbeType(type) {
  const sourceDocs = "https://firefox-source-docs.mozilla.org/toolkit/components/telemetry/telemetry/";
  const links = {
    environment: sourceDocs + "data/environment.html",
    histogram: sourceDocs + "collection/histograms.html",
    scalar: sourceDocs + "collection/scalars.html",
    event: sourceDocs + "collection/events.html",
  };

  if (type in links) {
    return `<a href="${links[type]}">${type}</a>`;
  }
  return type;
}

function findProbeIdFromCaseInsensitive(probeid) {
  for (var id of Object.keys(gProbeData)) {
    if (probeid.toLowerCase() == id.toLowerCase()) {
      return id;
    }
  }
  return null;
}

function getDatasetInfos(probeId, channel, state) {
  // Available documentation.
  const dataDocs = {
    "longitudinal": "https://docs.telemetry.mozilla.org/concepts/choosing_a_dataset.html#longitudinal",
    "main_summary": "https://docs.telemetry.mozilla.org/concepts/choosing_a_dataset.html#mainsummary",
    "events": "https://docs.telemetry.mozilla.org/datasets/batch_view/events/reference.html",
  };
  // Helper for code markup.
  var code = s => `<span class="code">${s}</span>`;

  const stmoLink = `<a href="https://sql.telemetry.mozilla.org">STMO</a>`;
  const probe = gProbeData[probeId];
  var datasetInfos = [];

  // TMO dashboard links.
  if (["histogram", "scalar"].includes(probe.type) ||
      (probe.type == "simpleMeasurements" && ["number", "bool"].includes(state.details.kind))) {
    var versions = getVersionRange(channel, state.revisions);
    const distURL = getTelemetryDashboardURL('dist', probe.name, probe.type, channel, versions.first, versions.last);
    const evoURL = getTelemetryDashboardURL('evo', probe.name, probe.type, channel, versions.first, versions.last);
    datasetInfos.push("TMO dashboard: "
                      + `<a href="${distURL}" target="_blank">distribution</a>`
                      + ", "
                      + `<a href="${evoURL}" target="_blank">evolution</a>`);
  }

  // Use counter dashboard links.
  if ((probe.type == "histogram") && probe.name.startsWith("USE_COUNTER2_")) {
    const base = "https://georgf.github.io/usecounters/";
    const params = {
      "group": probe.name.split("_")[2],
      "kind": last(probe.name.split("_")).toLowerCase(),
    };
    const url = base + "#" + $.param(params);
    datasetInfos.push(`<a href="${url}" target="_blank">Use counter dashboard</a>`);
  }

  // Link to the hardware report for all hardware & OS related probes.
  if (probeId.startsWith("environment/system.")) {
    const url = "https://hardware.metrics.mozilla.com/";
    datasetInfos.push(`<a href="${url}">hardware report</a> - view what hardware and operating systems Firefox users have.`);
  }

  // Lookup in mappings from datasets.json.
  if (probeId in gDatasetMappings) {
    $.each(gDatasetMappings[probeId], (dataset, name) => {
      var datasetText = dataset;
      if (dataset in dataDocs) {
        datasetText = `${stmoLink}: in <a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
      }
      datasetInfos.push(`${datasetText} as ${code(name)}`);
    });
  }

  // Longitudinal includes all release parent process scalars.
  if (probe.type == "scalar" && state.optout && state.details.record_in_processes.includes("main")) {
    var dataset = "longitudinal";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    var name = "scalar_parent_" + probe.name.toLowerCase().replace(/\./g, '_');
    datasetInfos.push(`${stmoLink}: in ${datasetText} as ${code(name)}`);
  }

  // Longitudinal includes all release histograms.
  if (probe.type == "histogram" && state.optout) {
    var dataset = "longitudinal";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    var name = probe.name.toLowerCase().replace(/\./g, '_');
    var names = code(name) + ", " + code(name + "_<i>&lt;process&gt;</i>");
    datasetInfos.push(`${stmoLink}: in ${datasetText} as ${names}`);
  }

  // All events are available in main_summary and the events table.
  if (probe.type == "event") {
    var dataset = "main_summary";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    datasetInfos.push(`${stmoLink}: in ${datasetText} in the ${code("events")} column`);
  }

  if (probe.type == "event") {
    var dataset = "events";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    datasetInfos.push(`${stmoLink}: in the ${code(datasetText)} table`);
  }

  // main_summary includes all scalars.
  if (probe.type == "scalar") {
    var dataset = "main_summary";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    var name = code("scalar_<i>&lt;process&gt;</i>_" + probe.name.toLowerCase().replace(/\./g, '_'));
    datasetInfos.push(`${stmoLink}: in ${datasetText} as ${name}`);
  }

  // main_summary includes a whitelist of histograms dynamically.
  const mainSummaryHistogramWhitelist = [
    "A11Y_INSTANTIATED_FLAG",
    "A11Y_CONSUMERS",
    "CERT_VALIDATION_SUCCESS_BY_CA",
    "CYCLE_COLLECTOR_MAX_PAUSE",
    "FX_SEARCHBAR_SELECTED_RESULT_METHOD",
    "FX_URLBAR_SELECTED_RESULT_INDEX",
    "FX_URLBAR_SELECTED_RESULT_INDEX_BY_TYPE",
    "FX_URLBAR_SELECTED_RESULT_METHOD",
    "FX_URLBAR_SELECTED_RESULT_TYPE",
    "GC_MAX_PAUSE_MS",
    "GC_MAX_PAUSE_MS_2",
    "GHOST_WINDOWS",
    "HTTP_CHANNEL_DISPOSITION",
    "HTTP_PAGELOAD_IS_SSL",
    "INPUT_EVENT_RESPONSE_COALESCED_MS",
    "SEARCH_RESET_RESULT",
    "SSL_HANDSHAKE_RESULT",
    "SSL_HANDSHAKE_VERSION",
    "SSL_TLS12_INTOLERANCE_REASON_PRE",
    "SSL_TLS13_INTOLERANCE_REASON_PRE",
    "TIME_TO_DOM_COMPLETE_MS",
    "TIME_TO_DOM_CONTENT_LOADED_END_MS",
    "TIME_TO_DOM_CONTENT_LOADED_START_MS",
    "TIME_TO_DOM_INTERACTIVE_MS",
    "TIME_TO_DOM_LOADING_MS",
    "TIME_TO_FIRST_CLICK_MS",
    "TIME_TO_FIRST_INTERACTION_MS",
    "TIME_TO_FIRST_KEY_INPUT_MS",
    "TIME_TO_FIRST_MOUSE_MOVE_MS",
    "TIME_TO_FIRST_SCROLL_MS",
    "TIME_TO_LOAD_EVENT_END_MS",
    "TIME_TO_LOAD_EVENT_START_MS",
    "TIME_TO_NON_BLANK_PAINT_MS",
    "TIME_TO_RESPONSE_START_MS",
    "TOUCH_ENABLED_DEVICE",
    "TRACKING_PROTECTION_ENABLED",
    "UPTAKE_REMOTE_CONTENT_RESULT_1",
    "WEBVR_TIME_SPENT_VIEWING_IN_2D",
    "WEBVR_TIME_SPENT_VIEWING_IN_OCULUS",
    "WEBVR_TIME_SPENT_VIEWING_IN_OPENVR",
    "WEBVR_USERS_VIEW_IN",
  ];

  if ((probe.type == "histogram") && mainSummaryHistogramWhitelist.includes(probe.name)) {
    var dataset = "main_summary";
    var datasetText = dataset;
    if (dataset in dataDocs) {
      datasetText = `<a href="${dataDocs[dataset]}" target="_blank">${dataset}</a>`;
    }
    var name = code("histogram_<i>&lt;process&gt;</i>_" + probe.name.toLowerCase());
    datasetInfos.push(datasetText + ` as ${name}`);
  }

  return datasetInfos;
}

function showDetailViewForId(probeId, channel=$("#select_channel").val()) {
  const last = array => array[array.length - 1];

  const probe = gProbeData[probeId];
  if (channel == "any") {
    // Default to showing the most current probe description.
    channel = "nightly";
  }

  // Core probe data.
  $('#detail-probe-name').text(probe.name);
  $('#detail-probe-type').html(linkedProbeType(probe.type));
  const state = probe.history[channel][0];
  $('#detail-recording-type').text(state.optout ? "release" : "prerelease");
  $('#detail-description').text(state.description);

  // Recording range
  let rangeText = [];
  for (let [ch, history] of Object.entries(probe.history)) {
    if ((!history[0].optout && (ch == "release")) || (ch == "aurora")) {
      continue;
    }
    rangeText.push(`${ch} ${friendlyRecordingRangeForHistory(history, ch)}`);
  }
  $('#detail-recording-range').html(rangeText.join("<br/>"));

  // Apply dataset infos.
  var datasetInfos = getDatasetInfos(probeId, channel, state);
  var datasetsRow = document.getElementById("detail-datasets-row");
  if (datasetInfos.length == 0) {
    datasetsRow.classList.add("hidden");
  } else {
    $("#detail-datasets-content").empty();
    $("#detail-datasets-content").append(datasetInfos.join("<br>"));
    datasetsRow.classList.remove("hidden");
  }

  // Bug numbers.
  $('#detail-bug-numbers').empty();
  var bugs = state['bug_numbers'] || [];
  var bugLinks = bugs.map(bugNo => {
    var uri = `https://bugzilla.mozilla.org/show_bug.cgi?id=${bugNo}`;
    return `<a href="${uri}">bug ${bugNo}</a>`;
  }).join(", ");
  $('#detail-bug-numbers').append(bugLinks);

  // Other probe details.
  const detailsList = [
    ['kind', 'detail-kind', ['histogram', 'scalar', 'environment', 'info', 'simpleMeasurements']],
    ['keyed', 'detail-keyed', ['histogram', 'scalar']],
    ['record_in_processes', 'detail-processes', ['scalar', 'event']],
    ['cpp_guard', 'detail-cpp-guard', ['histogram', 'scalar', 'event']],

    ['low', 'detail-histogram-low', ['histogram']],
    ['high', 'detail-histogram-high', ['histogram']],
    ['n_buckets', 'detail-histogram-bucket-count', ['histogram']],

    ['extra_keys', 'detail-event-methods', ['event']],
    ['methods', 'detail-event-objects', ['event']],
    ['objects', 'detail-event-extra-keys', ['event']],
  ];

  var pretty = (prop) => {
    if (prop === undefined) {
      return "";
    }
    if (Array.isArray(prop)) {
      return prop.join(", ");
    }
    return new String(prop);
  };

  for (let [property, id, types] of detailsList) {
    const parent = document.getElementById(id).parentElement;
    if (types.includes('all') || types.includes(probe.type)) {
      var prop = pretty(state.details[property]);
      $('#' + id).text(pretty(prop));
      document.getElementById(id).parentElement.classList.remove("hidden");
    } else {
      $('#' + id).text("");
      document.getElementById(id).parentElement.classList.add("hidden");
    }
  }

  document.getElementById("probe-detail-view").classList.remove("hidden");
  document.getElementById("main-tab-holder").classList.add("hidden");
  document.getElementById("search-view").classList.add("hidden");
}

function hideDetailView() {
  document.getElementById("probe-detail-view").classList.add("hidden");
  document.getElementById("main-tab-holder").classList.remove("hidden");
  document.getElementById("search-view").classList.remove("hidden");
  gDetailViewId = null;
  updateSearchParams();
}


function getMeasurementCountsPerVersion() {
  let first = array => array[0];
  let last = array => array[array.length - 1];

  let channel = $("#select_channel").val();
  let version_constraint = $("#select_constraint").val();

  let perVersionCounts = {};
  for (let v of Object.keys(gChannelInfo[channel].versions)) {
    perVersionCounts[v] = {
      optin: 0,
      optout: 0,
      total: 0,
    };
  }

  $.each(gProbeData, (id, data) => {
    let history = data.history[channel];
    if (!history) {
      return;
    }

    switch (version_constraint) {
      case "new_in": {
        let oldest = last(history);
        let versions = getVersionRange(channel, oldest.revisions);
        let k = oldest.optout ? "optout" : "optin";
        perVersionCounts[versions.first][k] += 1;
        break;
      }
      case "is_in":
      {
        $.each(perVersionCounts, (version, data) => {
          // Is this measurement recording for this revision?
          let recording = history.find(h => {
            let ver = parseInt(version);
            let versions = getVersionRange(channel, h.revisions);
            let expires = h.expiry_version;
            return ((ver >= versions.first) && (ver <= versions.last) &&
                    ((expires == "never") || (parseInt(expires) >= ver)));
          });
          // If so, increase the count.
          if (recording) {
            let k = recording.optout ? "optout" : "optin";
            data[k] += 1;
          }
        });
        break;
      }
      case "is_expired":
        $.each(perVersionCounts, (version, data) => {
          let newest = first(history);
          let versions = getVersionRange(channel, newest.revisions);
          let expires = newest.expiry_version;
          let versionNum = parseInt(version);
          if ((versions.first <= versionNum) && (versions.last >= versionNum) &&
              (expires != "never") && (parseInt(expires) <= versionNum)) {
            let k = newest.optout ? "optout" : "optin";
            data[k] += 1;
          }
        });
        break;
      default:
          throw "Yuck, unknown selector.";
    }
  });

  let counts = [];
  $.each(perVersionCounts, (version, data) => {
    data.total = data.optin + data.optout;
    data.version = version;
    counts.push(data);
  });

  return counts;
}

function renderProbeStats() {
  var data = getMeasurementCountsPerVersion();

  let last = array => array[array.length - 1];
  let version_constraint = $("#select_constraint").val();

  // Prepare data.
  var columns = ["optin", "optout"];
  data.sort(function(a, b) { return parseInt(a.version) - parseInt(b.version); });

  // Remove leading & trailing 0 entries.
  while (data[0].total == 0) {
    data = data.slice(1);
  }
  while (last(data).total == 0) {
    data = data.slice(0, -1);
  }

  // Remove the first non-0 entry. All probes would be new in that first version,
  // which changes the scale of the diagram significantly.
  data = data.slice(1);

  // Render.
  var svg = d3.select("#stats-content");
  svg.selectAll("*").remove();

  var margin = {top: 20, right: 20, bottom: 30, left: 40};
  var width = +svg.attr("width") - margin.left - margin.right;
  var height = +svg.attr("height") - margin.top - margin.bottom;
  var g = svg.append("g").attr("transform", "translate(" + margin.left + "," + margin.top + ")");

  var x = d3.scaleBand()
      .rangeRound([0, width])
      .padding(0.1)
      .align(0.1);

  var y = d3.scaleLinear()
      .rangeRound([height, 0]);

  var z = d3.scaleOrdinal()
      .range(["#98abc5", "#d0743c"]);

  var stack = d3.stack();

  x.domain(data.map(function(d) { return d.version; }));
  y.domain([0, d3.max(data, function(d) { return d.total; })]).nice();
  z.domain(columns);

  g.selectAll(".serie")
    .data(stack.keys(columns)(data))
    .enter().append("g")
      .attr("class", "serie")
      .attr("fill", function(d) { return z(d.key); })
    .selectAll("rect")
    .data(function(d) { return d; })
    .enter().append("rect")
      .attr("x", function(d) { return x(d.data.version); })
      .attr("y", function(d) { return y(d[1]); })
      .attr("height", function(d) { return y(d[0]) - y(d[1]); })
      .attr("width", x.bandwidth());

  g.append("g")
      .attr("class", "axis axis--x")
      .attr("transform", "translate(0," + height + ")")
      .call(d3.axisBottom(x));

  var constraintText;
  switch (version_constraint) {
    case "new_in": constraintText = "new"; break;
    case "is_in": constraintText = "recorded"; break;
    case "is_expired": constraintText = "expired"; break;
    default: throw "Yuck, unknown constraint.";
  }

  g.append("g")
      .attr("class", "axis axis--y")
      .call(d3.axisLeft(y).ticks(10, "s"))
    .append("text")
      .attr("x", 2)
      .attr("y", y(y.ticks(10).pop()))
      .attr("dy", "0.35em")
      .attr("text-anchor", "start")
      .attr("fill", "#000")
      .text("Count of " + constraintText + " probes");

  var legend = g.selectAll(".legend")
    .data(columns.reverse())
    .enter().append("g")
      .attr("class", "legend")
      .attr("transform", function(d, i) { return "translate(0," + i * 20 + ")"; })
      .style("font", "10px sans-serif");

  legend.append("rect")
      .attr("x", width - 18)
      .attr("width", 18)
      .attr("height", 18)
      .attr("fill", z);

  legend.append("text")
      .attr("x", width - 24)
      .attr("y", 9)
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .text(function(d) { return d; });
}
