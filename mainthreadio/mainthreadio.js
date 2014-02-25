/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 7);

// Monday is 1, so we adjust offset accordingly
var dowOffset = (yesterday.getUTCDay() - 1) % 7;
var thisWeekStart = new Date(yesterday);
var thisWeekEnd = new Date(yesterday);
thisWeekStart.setDate(thisWeekStart.getDate() - dowOffset);
thisWeekEnd.setDate(thisWeekStart.getDate() + 6);

var lastWeekStart = new Date(thisWeekStart);
lastWeekStart.setDate(lastWeekStart.getDate() - 7);
var lastWeekEnd = new Date(thisWeekEnd);
lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

var version_filters = [];

var fileio_data = {};

// Filename, Frequency, Ping Count, Mean Acc. Time, Median Acc. Time, Application, Channel, Version
var FREQ_COLUMN             = 0;
var SUBMISSION_COUNT_COLUMN = 1;
var MEDIAN_TIME_COLUMN      = 2;
var MEDIAN_COUNT_COLUMN     = 3;
var FILENAME_COLUMN         = 4;
var APP_COLUMN              = 5;
var CHAN_COLUMN             = 6;
var VER_COLUMN              = 7;

function zpad(aNum) {
  return (aNum < 10 ? "0" : "") + aNum;
}

function yyyymmdd(aDate) {
  var year = aDate.getUTCFullYear();
  var month = aDate.getUTCMonth() + 1;
  var day = aDate.getUTCDate();
  return "" + year + zpad(month) + zpad(day);
}

function clean_version(ver) {
  var m = ver.match(/^([0-9]+).*$/);
  if (m) {
    return m[1];
  }
  return ver;
}

function update_version_filter(key) {
  if (version_filters.length == 0) {
    var vermap = {};
    for (var i = 0; i < fileio_data[key].length; i++) {
      vermap[clean_version(fileio_data[key][i][VER_COLUMN])] = 1;
    }
    version_filters = Object.keys(vermap);
    version_filters.sort(function(a, b) {
      // Sort descending
      return parseInt(b) - parseInt(a);
    });
    // Populate the filter list:
    var version_select = $('#filter_version');
    for (var j = 0; j < version_filters.length; j++) {
      version_select.append($('<option>', {text: version_filters[j]}));
    }
  }
}

function fetch_data(key, cb) {
  if (fileio_data[key]) {
    cb(key);
    return;
  }

  console.log("Fetching: " + key);
  var xhr = new XMLHttpRequest();
  var url = "https://s3-us-west-2.amazonaws.com/telemetry-public-analysis/mainthreadio/data/weekly_" + key + ".csv.gz";

  console.log("Fetching url: " + url);
  xhr.open("GET", url, true);
  xhr.onload = function() {
    console.log("onload:" + xhr.status);
    if (xhr.status != 200 && xhr.status != 0) {
      console.log("Failed to load " + url);
      fileio_data[key] = []
    } else {
      console.log("Got the data for " + url + ", processing");
      fileio_data[key] = $.csv.toArrays(xhr.responseText).slice(1);
      update_version_filter(key);
      console.log("done processing for " + key + ", got " + fileio_data[key].length + " rows");
    }
    cb(key);
  };
  xhr.onerror = function(e) {
    console.log("Failed to fetch: " + url);
    fileio_data[key] = []
    cb(key);
  };
  try {
    xhr.send(null);
  } catch(e) {
    console.log("Failed to fetch: " + url);
    fileio_data[key] = []
    cb(key);
  }
}

function populate_table(table_id, key, label) {
  var tbody = $('#' + table_id + ' > tbody');
  var filter_app = $('#filter_application').find(":selected").val();
  var filter_channel = $('#filter_channel').find(":selected").val();
  var filter_version = $('#filter_version').find(":selected").val();

  console.log("Populating " + table_id + " table");
  tbody.empty();

  if (!fileio_data[key] || fileio_data[key].length == 0) {
    var trow = $('<tr>', {id: label + "1"});

    trow.append($('<td>', {colspan: "6", id: label + "1rank", text: "No Data for " + key}));
    tbody.append(trow);
  } else {
    var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
    var rank = 1;

    for (var i = 0; i < fileio_data[key].length; i++) {
      if (rank > maxRows)
        break;

      var drow = fileio_data[key][i];
      if (drow[APP_COLUMN] === filter_app &&
          clean_version(drow[VER_COLUMN]) === filter_version &&
          drow[CHAN_COLUMN] === filter_channel) {
        var trow = $('<tr>', {id: label + rank});

        trow.append($('<td>', {id: label + rank + "rank", text: rank}));
        trow.append($('<td>', {id: label + rank + "q", text: drow[FILENAME_COLUMN]}));

        for (var j = FREQ_COLUMN; j < FILENAME_COLUMN; j++)
          trow.append($('<td>', {text: drow[j]}));

        tbody.append(trow);
        rank++;
      }
    }
  }
}

function update_week_over_week(lastWeekKey, thisWeekKey) {
  var thisWeekRank = {};
  var lastWeekRank = {};
  var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
  for (var i = 1; i <= maxRows; i++) {
    var entry = $('#tw' + i + 'q').text();
    //console.log("This week's rank " + i + " is " + entry);
    if (entry) {
      thisWeekRank[entry] = i;
    }
    entry = $('#lw' + i + 'q').text();
    if (entry) {
      lastWeekRank[entry] = i;
    }
  }

  var lastWeekKeys = Object.keys(lastWeekRank);
  var thisWeekKeys = Object.keys(thisWeekRank);
  for (var i = 0; i < lastWeekKeys.length; i++) {
    var key = lastWeekKeys[i];
    //console.log("Checking " + key);
    if (!thisWeekRank[key]) {
      //console.log("missing in this week: " + key);
      $('#lw' + lastWeekRank[key] + "> td").addClass("missing");
    } else if (thisWeekRank[key] != lastWeekRank[key]) {
      if(thisWeekRank[key] < lastWeekRank[key]) {
        //console.log("moved up this week: " + key);
        $('#tw' + thisWeekRank[key] + "> td").addClass("up");

      } else if(thisWeekRank[key] > lastWeekRank[key]) {
        //console.log("moved down this week: " + key);
        $('#tw' + thisWeekRank[key] + "> td").addClass("down");
      }
      var thisrank = thisWeekRank[key];
      var lastrank = lastWeekRank[key];
      var ranktext = thisrank + " (was " + lastrank + ")";
      $('#tw' + thisWeekRank[key] + "rank").html(ranktext);
      //} else {
      //    console.log("no change: " + key);
    }
  }

  console.log("Looking for new filenames this week");
  thisWeekKeys.forEach(function(key, idx, arr) {
    if (!lastWeekRank[key]) {
      //console.log("new this week: " + key);
      $('#tw' + thisWeekRank[key] + "> td").addClass("new");
    }
  });
}

function get_mainthreadio_type() {
  return $('input[name=mainthreadio_type]:radio:checked').val();
}

function get_key(start, end) {
  return get_mainthreadio_type() + "_" + yyyymmdd(start) + "-" + yyyymmdd(end);
}

function update_data() {
  $('#current_data_header').html("Main-thread IO for the week of " + yyyymmdd(thisWeekStart) + " to " + yyyymmdd(thisWeekEnd));
  // Update last week's header:
  $('#previous_data_header').html("Compared with the week of " + yyyymmdd(lastWeekStart) + " to " + yyyymmdd(lastWeekEnd));

  $('#fileio_data').fadeOut(500);
  $('#throbber').fadeIn(500);

  // Update this week's data if need be:
  var thisWeekKey = get_key(thisWeekStart, thisWeekEnd);
  var lastWeekKey = get_key(lastWeekStart, lastWeekEnd);
  // Load the requested data
  fetch_data(thisWeekKey, function(){
    fetch_data(lastWeekKey, function() {
      populate_table("current_data_table", thisWeekKey, "tw");
      populate_table("previous_data_table", lastWeekKey, "lw");
      update_week_over_week(lastWeekKey, thisWeekKey);
      $('#throbber').fadeOut(500);
      $('#fileio_data').fadeIn(500);
    });
  });
}

$(function () {
  $('#previous_week').click(function() {
    thisWeekStart.setDate(thisWeekStart.getDate() - 7);
    thisWeekEnd.setDate(thisWeekEnd.getDate() - 7);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
    update_data();
  });
  $('#next_week').click(function() {
    thisWeekStart.setDate(thisWeekStart.getDate() + 7);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
    lastWeekStart.setDate(lastWeekStart.getDate() + 7);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
    update_data();
  });
  $('#filter_application').change(update_data);
  $('#filter_channel').change(update_data);
  $('#filter_rowcount').change(update_data);
  $('#filter_version').change(update_data);
  $('input[name=mainthreadio_type]').change(update_data);

  update_data();
  $(document).tooltip({delay: 1000});
});
