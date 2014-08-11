/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

var BUCKET = "https://s3-us-west-2.amazonaws.com/telemetry-public-analysis/addon_perf/data/";
var COMPRESSED = ".gz"
// var BUCKET = "";
// var COMPRESSED = "";

var yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 7);
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

function populate_table(table_id, key, label) {
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
        missing_data_warning(tbody, label, "No data for " + key);
    } else {
        var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
        var rank = 1;
        var is_empty = true;
        // sort highest-lowest based on the chosen numeric column
        addon_data[key].sort((a, b) => (parseFloat(b[sort_col]) - parseFloat(a[sort_col])));
        for (var i = 0; i < addon_data[key].length; i++) {
            if (rank > maxRows) break;
            var drow = addon_data[key][i];
            if ((filter_app == "ALL" || drow[APP_COLUMN] === filter_app) &&
                (filter_platform == "ALL" || drow[PLATFORM_COLUMN] === filter_platform) &&
                (filter_measure == "ALL" || drow[MEASURE_COLUMN] === filter_measure)) {
                var trow = $('<tr>', {id: label + rank});
                is_empty = false;
                trow.append($('<td>', {id: label + rank + "rank", text: rank}));
                for (var j = 0; j < LAST_COLUMN; j++) {
                    trow.append($('<td>', {text: drow[j]}));
                }
                trow.append($('<td>', {id: label + rank + "q", text: drow[LAST_COLUMN]}));
                tbody.append(trow);
                rank++;
            // } else {
            //    console.log("skipping row " + [drow[APP_COLUMN], drow[PLATFORM_COLUMN], drow[MEASURE_COLUMN]].join(", "));
            }
        }
        is_empty && missing_data_warning(tbody, label, "No data found with the requested filtering criteria.")
    }
}

function missing_data_warning(tbody, label, message) {
  var trow = $('<tr>', {id: label + "1"});
  // Add one for Rank column, one for zero-based column numbering
  trow.append($('<td>', {colspan: LAST_COLUMN + 2, id: label + "1rank", text: message}));
  tbody.append(trow);
}

function update_week_over_week(lastWeekKey, thisWeekKey) {
    var thisWeekQueryRank = {};
    var lastWeekQueryRank = {};
    var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
    for (var i = 1; i <= maxRows; i++) {
        var query = $('#tw' + i + 'q').text();
        //console.log("This week's rank " + i + " is " + query);
        if (query) {
            thisWeekQueryRank[query] = i;
        }
        query = $('#lw' + i + 'q').text();
        if (query) {
            lastWeekQueryRank[query] = i;
        }
    }

    var lastWeekKeys = Object.keys(lastWeekQueryRank);
    var thisWeekKeys = Object.keys(thisWeekQueryRank);
    for (var i = 0; i < lastWeekKeys.length; i++) {
        var key = lastWeekKeys[i];
        //console.log("Checking " + key);
        if (!thisWeekQueryRank[key]) {
            //console.log("missing in this week: " + key);
            $('#lw' + lastWeekQueryRank[key] + "> td").addClass("missing");
        } else if (thisWeekQueryRank[key] != lastWeekQueryRank[key]) {
            if(thisWeekQueryRank[key] < lastWeekQueryRank[key]) {
                //console.log("moved up this week: " + key);
                $('#tw' + thisWeekQueryRank[key] + "> td").addClass("up");

            } else if(thisWeekQueryRank[key] > lastWeekQueryRank[key]) {
                //console.log("moved down this week: " + key);
                $('#tw' + thisWeekQueryRank[key] + "> td").addClass("down");
            }
            var thisrank = thisWeekQueryRank[key];
            var lastrank = lastWeekQueryRank[key];
            var ranktext = thisrank + " (was " + lastrank + ")";
            $('#tw' + thisWeekQueryRank[key] + "rank").html(ranktext);
        //} else {
        //    console.log("no change: " + key);
        }
    }

    console.log("Looking for new queries this week");
    thisWeekKeys.forEach(function(key, idx, arr) {
        if (!lastWeekQueryRank[key]) {
            //console.log("new this week: " + key);
            $('#tw' + thisWeekQueryRank[key] + "> td").addClass("new");
        }
    });
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
            populate_table("current_data_table", thisWeekKey, "tw");
            populate_table("previous_data_table", lastWeekKey, "lw");
            update_week_over_week(lastWeekKey, thisWeekKey);
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
