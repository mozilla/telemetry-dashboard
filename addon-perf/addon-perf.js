/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var BUCKET = "https://s3-us-west-2.amazonaws.com/telemetry-public-analysis/addon_perf/data/";
var COMPRESSED = ".gz"
// var BUCKET = "";
// var COMPRESSED = "";

var yesterday = new Date();
// Telemetry extract lags by about 1.5 days
yesterday.setDate(yesterday.getDate() - 2);
//console.log("Set yesterday to " + yyyymmdd(yesterday));

// Monday is 1, so we adjust offset accordingly
var dowOffset = (yesterday.getUTCDay() - 1) % 7;
var thisWeekStart = new Date(yesterday);
thisWeekStart.setDate(thisWeekStart.getDate() - dowOffset);
var thisWeekEnd = new Date(thisWeekStart);
thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);

var lastWeekStart = new Date(thisWeekStart);
lastWeekStart.setDate(lastWeekStart.getDate() - 7);
var lastWeekEnd = new Date(thisWeekEnd);
lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);

var version_filters = [];

var addon_data = {};

// app_name,platform,addon ID,version,name,measure,% Sessions with this add-on,Impact (popularity * median time),Median time (ms),75% time,95% time
var APP_COLUMN          = 0;
var PLATFORM_COLUMN     = 1;
var ID_COLUMN           = 2;
var VERSION_COLUMN      = 3;
var NAME_COLUMN         = 4;
var MEASURE_COLUMN      = 5;
var POPULARITY_COLUMN   = 6;
var IMPACT_COLUMN       = 7;
var MEDIAN_COLUMN       = 8;
var P75_COLUMN          = 9;
var P95_COLUMN          = 10;
var LAST_COLUMN = P95_COLUMN;

function zpad(aNum) {
    return (aNum < 10 ? "0" : "") + aNum;
}

function yyyymmdd(aDate) {
    var year = aDate.getUTCFullYear();
    var month = aDate.getUTCMonth() + 1;
    var day = aDate.getUTCDate();
    return "" + year + zpad(month) + zpad(day);
}

function fetch_data(key, cb) {
    if (addon_data[key]) {
        cb(key);
        return;
    }

    $('#addon_data').fadeOut(500);
    $('#throbber').fadeIn(500);
    console.log("Fetching: " + key);
    var xhr = new XMLHttpRequest();
    var url = BUCKET + "weekly_addons_" + key + ".csv" + COMPRESSED;
    console.log("Fetching url: " + url);
    xhr.open("GET", url, true);
    xhr.overrideMimeType("text/csv; charset=UTF-8");
    xhr.responseType = "text";
    xhr.onload = function() {
        console.log("onload:" + xhr.status);
        if (xhr.status != 200 && xhr.status != 0) {
            console.log("Failed to load " + url);
            addon_data[key] = []
        } else {
            console.log("Got the data for " + url + ", processing");
            try {
              addon_data[key] = $.csv.toArrays(xhr.responseText);
              // Delete the header row from the CSV
              addon_data[key].shift();
              console.log("done processing for " + key + ", got " + addon_data[key].length + " rows");
            }
            catch(e) {
              console.log("CSV parse failed for " + url + ": " + e);
              addon_data[key] = [];
              cb(key);
            }
        }
        //$('#throbber').fadeOut(500);
        //$('#addon_data').fadeIn(500);
        cb(key);
    };
    xhr.onerror = function(e) {
        //throw new Error("failed to retrieve file:" + e);
        console.log("Failed to fetch: " + url);
        //$('#throbber').fadeOut(500);
        //$('#addon_data').fadeIn(500);
        addon_data[key] = [];
        cb(key);
    };
    try {
        xhr.send(null);
    } catch(e) {
        console.log("Failed to fetch: " + url);
        //$('#throbber').fadeOut(500);
        //$('#addon_data').fadeIn(500);
        addon_data[key] = []
        cb(key);
    }
}

// map ao_type to table column for sorting
var key_columns = {
  'Impact': IMPACT_COLUMN,
  'Popularity': POPULARITY_COLUMN,
  'Median': MEDIAN_COLUMN,
  '75 %': P75_COLUMN
};

var KEY_COLUMNS = [APP_COLUMN, PLATFORM_COLUMN, ID_COLUMN, VERSION_COLUMN, MEASURE_COLUMN];

/*
 * Return an Object map of key => {rank, tableRow} for each row added to the table
 */
function populate_table(table_id, key) {
    console.log("Populating " + table_id + " table");
    var tbody = $('#' + table_id + ' > tbody');
    var filter_app = $('#filter_application').find(":selected").val();
    var filter_platform = $('#filter_platform').find(":selected").val();
    var filter_measure = $('#filter_measure').find(":selected").val();
    var ao_type = $('input[name=ao_type]:radio:checked').val();
    console.log("Filter/sort: "
                + [filter_app, filter_platform, filter_measure, ao_type].join(", "));
    var sort_col = key_columns[ao_type];

    tbody.empty();
    if (!addon_data[key] || addon_data[key].length == 0) {
        missing_data_warning(tbody, "No data for " + key);
        return {};
    }
    var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
    var rank = 1;
    var ranks = {};
    var is_empty = true;
    // sort highest-lowest based on the chosen numeric column
    addon_data[key].sort((a, b) => (parseFloat(b[sort_col]) - parseFloat(a[sort_col])));
    for (var i = 0; i < addon_data[key].length; i++) {
        if (rank > maxRows) break;
        var drow = addon_data[key][i];
        if ((filter_app == "ALL" || drow[APP_COLUMN] === filter_app) &&
            (filter_platform == "ALL" || drow[PLATFORM_COLUMN] === filter_platform) &&
            (filter_measure == "ALL" || drow[MEASURE_COLUMN] === filter_measure)) {
            var trow = $('<tr>');
            is_empty = false;
            trow.append($('<td>', {text: rank}));
            for (var j = 0; j <= LAST_COLUMN; j++) {
              trow.append($('<td>', {text: drow[j]}));
            }
            tbody.append(trow);
            var rowKey = "";
            KEY_COLUMNS.forEach(function(column) {
              rowKey += drow[column] + ":";
            });
            ranks[rowKey] = {rank: rank, tableRow: trow};
            rank++;
        // } else {
        //    console.log("skipping row " + [drow[APP_COLUMN], drow[PLATFORM_COLUMN], drow[MEASURE_COLUMN]].join(", "));
        }
    }
    if (is_empty) {
      missing_data_warning(tbody, "No data found with the requested filtering criteria.");
    }
    return ranks;
}

function missing_data_warning(tbody, message) {
  var trow = $('<tr>');
  // Add one for Rank column, one for zero-based column numbering
  trow.append($('<td>', {colspan: LAST_COLUMN + 2, text: message}));
  tbody.append(trow);
}

function update_week_over_week(lastRanks, thisRanks) {
  // go through this week's entries and see where they were last week
  for (var thisKey in thisRanks) {
    var thisRow = thisRanks[thisKey];
    if (!(thisKey in lastRanks)) {
      // it wasn't in last week, so it's new
      thisRow.tableRow.addClass("new");
      continue;
    }
    var lastRow = lastRanks[thisKey];
    delete lastRanks[thisKey];
    if (thisRow.rank == lastRow.rank) {
      continue;
    }
    var rank = thisRow.tableRow.children().first();
    rank.text(rank.text() + " (was " + lastRow.rank + ")");
    if (thisRow.rank < lastRow.rank) {
      thisRow.tableRow.addClass("up");
    } else if (thisRow.rank > lastRow.rank) {
      thisRow.tableRow.addClass("down");
    }
  }
  // Anything left in last week's data was missing this week
  for (var lastKey in lastRanks) {
    lastRanks[lastKey].tableRow.addClass("missing");
  }
}

function get_key(start) {
    return yyyymmdd(start);
}

function update_data() {
    $('#current_data_header').html("Add-on bootstrap times for the week of " + yyyymmdd(thisWeekStart) + " to " + yyyymmdd(thisWeekEnd));
    // Update last week's header:
    $('#previous_data_header').html("Compared with the week of " + yyyymmdd(lastWeekStart) + " to " + yyyymmdd(lastWeekEnd));

    // Update this week's data if need be:
    var thisWeekKey = get_key(thisWeekStart);
    var lastWeekKey = get_key(lastWeekStart);
    // Load the requested data
    fetch_data(thisWeekKey, function(){
        fetch_data(lastWeekKey, function() {
            var thisRanks = populate_table("current_data_table", thisWeekKey);
            var lastRanks = populate_table("previous_data_table", lastWeekKey);
            update_week_over_week(lastRanks, thisRanks);
            $('#throbber').fadeOut(500);
            $('#addon_data').fadeIn(500);
        });
    });
}

$(function () {
    $('#previous_week').click(function() {
        console.log("previous week");
        thisWeekStart.setDate(thisWeekStart.getDate() - 7);
        thisWeekEnd.setDate(thisWeekEnd.getDate() - 7);
        lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        lastWeekEnd.setDate(lastWeekEnd.getDate() - 7);
        update_data();
    });
    $('#next_week').click(function() {
        console.log("next week");
        thisWeekStart.setDate(thisWeekStart.getDate() + 7);
        thisWeekEnd.setDate(thisWeekEnd.getDate() + 7);
        lastWeekStart.setDate(lastWeekStart.getDate() + 7);
        lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
        update_data();
    });
    $('#filter_application').change(update_data);
    $('#filter_platform').change(update_data);
    $('#filter_measure').change(update_data);
    $('#filter_rowcount').change(update_data);
    $('input[name=ao_type]').change(update_data);

    update_data();
    //$('#current_data_header').html("This Week: " + yyyymmdd(thisWeekStart) + " to " + yyyymmdd(thisWeekEnd));
    //$('#previous_data_header').html("Last Week: " + yyyymmdd(lastWeekStart) + " to " + yyyymmdd(lastWeekEnd));
    $(document).tooltip({delay: 1000});

});
