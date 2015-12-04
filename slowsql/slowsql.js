/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

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

var slowsql_data = {};

// db_name, frequency, document_count, median_duration, total_duration, query, thread, app_name, channel, version
var DB_COLUMN          = 0;
var FREQ_COLUMN        = 1;
var COUNT_COLUMN       = 2;
var MEDIAN_DUR_COLUMN  = 3;
var TOTAL_DUR_COLUMN   = 4;
var QUERY_COLUMN       = 5;
var THREAD_COLUMN      = 6;
var APP_COLUMN         = 7;
var CHAN_COLUMN        = 8;
var VER_COLUMN         = 9;

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
        for (var i = 0; i < slowsql_data[key].length; i++) {
            vermap[clean_version(slowsql_data[key][i][VER_COLUMN])] = 1;
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
    if (slowsql_data[key]) {
        cb(key);
        return;
    }

    $('#slowsql_data').fadeOut(500);
    $('#throbber').fadeIn(500);
    console.log("Fetching: " + key);
    var xhr = new XMLHttpRequest();
    var url = "https://analysis-output.telemetry.mozilla.org/SlowSQL/data/weekly_" + key + ".csv.gz";
    //var url = "weekly_" + key + ".csv";
    console.log("Fetching url: " + url);
    xhr.open("GET", url, true);
    xhr.onload = function() {
        console.log("onload:" + xhr.status);
        if (xhr.status != 200 && xhr.status != 0) {
            console.log("Failed to load " + url);
            slowsql_data[key] = []
        } else {
            console.log("Got the data for " + url + ", processing");
            slowsql_data[key] = $.csv.toArrays(xhr.responseText);
            update_version_filter(key);
            console.log("done processing for " + key + ", got " + slowsql_data[key].length + " rows");
        }
        //$('#throbber').fadeOut(500);
        //$('#slowsql_data').fadeIn(500);
        cb(key);
    };
    xhr.onerror = function(e) {
        //throw new Error("failed to retrieve file:" + e);
        console.log("Failed to fetch: " + url);
        //$('#throbber').fadeOut(500);
        //$('#slowsql_data').fadeIn(500);
        slowsql_data[key] = []
        cb(key);
    };
    try {
        xhr.send(null);
    } catch(e) {
        console.log("Failed to fetch: " + url);
        //$('#throbber').fadeOut(500);
        //$('#slowsql_data').fadeIn(500);
        slowsql_data[key] = []
        cb(key);
    }
}

function populate_table(table_id, key, label) {
    console.log("Populating " + table_id + " table");
    var tbody = $('#' + table_id + ' > tbody');
    var filter_thread = $('#filter_thread').find(":selected").val();
    var filter_app = $('#filter_application').find(":selected").val();
    var filter_channel = $('#filter_channel').find(":selected").val();
    var filter_version = $('#filter_version').find(":selected").val();
    tbody.empty();
    if (!slowsql_data[key] || slowsql_data[key].length == 0) {
        missing_data_warning(tbody, label, "No data for " + key);
    } else {
        var maxRows = parseInt($('#filter_rowcount').find(":selected").val());
        var rank = 1;
        var is_empty = true;
        for (var i = 0; i < slowsql_data[key].length; i++) {
            if (rank > maxRows) break;
            var drow = slowsql_data[key][i];
            if (drow[THREAD_COLUMN] === filter_thread &&
                drow[APP_COLUMN] === filter_app &&
                clean_version(drow[VER_COLUMN]) === filter_version &&
                drow[CHAN_COLUMN] === filter_channel) {
                var trow = $('<tr>', {id: label + rank});
                is_empty = false;
                trow.append($('<td>', {id: label + rank + "rank", text: rank}));
                for (var j = 0; j < QUERY_COLUMN; j++) {
                    trow.append($('<td>', {text: drow[j]}));
                }
                trow.append($('<td>', {id: label + rank + "q", text: drow[QUERY_COLUMN]}));
                tbody.append(trow);
                rank++;
            //} else {
            //    console.log("skipping a row with app " + drow[5] + ", chan " + drow[6]);
            }
        }
        is_empty && missing_data_warning(tbody, label, "No data found with the requested filtering criteria.")
    }
}

function missing_data_warning(tbody, label, message) {
  var trow = $('<tr>', {id: label + "1"});
  trow.append($('<td>', {colspan: "6", id: label + "1rank", text: message}));
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

function get_slowsql_type() {
    return $('input[name=slowsql_type]:radio:checked').val();
}

function get_key(start, end) {
    return get_slowsql_type() + "_" + yyyymmdd(start) + "-" + yyyymmdd(end);
}

function update_data() {
    $('#current_data_header').html("Slow queries for the week of " + yyyymmdd(thisWeekStart) + " to " + yyyymmdd(thisWeekEnd));
    // Update last week's header:
    $('#previous_data_header').html("Compared with the week of " + yyyymmdd(lastWeekStart) + " to " + yyyymmdd(lastWeekEnd));

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
            $('#slowsql_data').fadeIn(500);
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
    $('#filter_thread').change(update_data);
    $('#filter_application').change(update_data);
    $('#filter_channel').change(update_data);
    $('#filter_rowcount').change(update_data);
    $('#filter_version').change(update_data);
    $('input[name=slowsql_type]').change(update_data);

    update_data();
    //$('#current_data_header').html("This Week: " + yyyymmdd(thisWeekStart) + " to " + yyyymmdd(thisWeekEnd));
    //$('#previous_data_header').html("Last Week: " + yyyymmdd(lastWeekStart) + " to " + yyyymmdd(lastWeekEnd));
    $(document).tooltip({delay: 1000});

});
