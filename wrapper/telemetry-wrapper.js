/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function () {
window.TelemetryWrapper = window.TelemetryWrapper || {};

/* Render inside `element` plots configured to `params`
 * params:obj
 *  - channel as per Telemetry.getEvolution
 *  - version as per Telemetry.getEvolution
 *  - metric as per Telemetry.getEvolution
 *  - filters as per Telemetry.getEvolution, but a JSON string
 *  - useSubmissionDate as per Telemetry.getEvolution
 *  - sanitize:bool - operate on sanitized data? (see someEvolutionInstance.sanitized())
 *  - trim:bool for whether or not to trim buckets with insufficient data
 *  - compare - a filter name over which we'll enumerate the values and graph
 *  - sensibleCompare - default true. Sensibly only compare a subset of values instead of trying to graph them all
 *  - evoVersions:int - show evolutions of values over the past `evoVersions` versions in `channel` starting at `version` instead of histograms
*/
window.TelemetryWrapper.go = function (params, element) {

  Telemetry.init(function () {
    setDefaultParams(params);

    var evolutionsPromise;
    if (params.evoVersions > 0) {
      // if we're composing an evolution over many versions, we need to mux over the versions
      var versionNumbers = Telemetry.getVersions()
        .filter(version => version.startsWith(params.channel))
        .sort()
        .map(versionString => versionString.split('/')[1]);
      var anchorVersionIndex = versionNumbers.indexOf(params.version);
      versionNumbers = versionNumbers.slice(
        Math.max(0, anchorVersionIndex + 1 - params.evoVersions),
        Math.min(anchorVersionIndex + 1, versionNumbers.length));

      var evoPromises = versionNumbers.map(version => {
        return new Promise((resolve, reject) => {
          Telemetry.getEvolution(
            params.channel,
            version,
            params.metric,
            params.filters,
            params.useSubmissionDate,
            evolutionMap => {
              // Not a "compare" really, but that's what I called it before
              evolutionMap.compare = version;
              resolve(evolutionMap)
            });
        });
      });
      evolutionsPromise = Promise.all(evoPromises);
    } else if (params.compare) {
      // if we're comparing we need to get all available values and multiplex
      evolutionsPromise = new Promise((resolve, reject) => {
        Telemetry.getFilterOptions(
          params.channel,
          params.version,
          filterOptions => resolve(filterOptions));
      })
      .then(filterOptions => {
        if (params.sensibleCompare) {
          filterOptions = sensibleFilterOptions(filterOptions, params.compare);
        }
        var evoPromises = [];
        filterOptions[params.compare].forEach((filterValue, i) => {
          evoPromises.push(new Promise((resolve, reject) => {
            var newFilters = $.extend({[params.compare]: filterValue}, params.filters);
            Telemetry.getEvolution(
              params.channel,
              params.version,
              params.metric,
              newFilters,
              params.useSubmissionDate,
              evolutionMap => {
                // Watch out: maybe a keyed hist has 'compare' as a key and we'll overwrite?
                evolutionMap.compare = filterValue;
                resolve(evolutionMap);
              });
          }));
        });
        return Promise.all(evoPromises);
      });
    } else {
      // the simple case: return as a one-element array
      evolutionsPromise = new Promise((resolve, reject) => {
        Telemetry.getEvolution(
          params.channel,
          params.version,
          params.metric,
          params.filters,
          params.useSubmissionDate,
          evolutionMap => resolve([evolutionMap]));
      });
    }
    evolutionsPromise.then(evolutionMaps => {
      var compares = [];
      if (evolutionMaps[0].compare) {
        // Sort maps by `compare`|`version` to stabilize them
        // This ought to keep the line colour assignments reproducible
        evolutionMaps.sort((a, b) => b.compare < a.compare ? -1 : 1);
        compares = evolutionMaps.map(evolutionMap => evolutionMap.compare);
        evolutionMaps.forEach(evolutionMap => delete evolutionMap.compare);
      }

      // unfortunately we have these separated by `compare`|`version` then `key`
      // We want these by `key` first so that multiple lines can be on a single graph for a given `key`
      var evolutionsByKey = {}; // key -> [evolutions...]
      evolutionMaps.forEach(evolutionMap => {
        Object.keys(evolutionMap).forEach(key => {
          if (!evolutionsByKey[key]) {
            evolutionsByKey[key] = [evolutionMap[key]];
          } else {
            evolutionsByKey[key].push(evolutionMap[key]);
          }
        });
      });

      // Example evolutionsByKey = {
      //  content: [<e10s-hist>, <no-e10s-hist>],
      //  plugin: [<e10s-hist, <no-e10s-hist>],
      // ...}

      Object.keys(evolutionsByKey).forEach(key => {
        var evolutions = evolutionsByKey[key];
        if (!evolutions.length) {
          console.warn('Whoops? No histogram for key:', key);
          return;
        }
        if (params.sanitize) {
          evolutions = evolutions
            .map(evo => evo.sanitized())
            .filter(evo => !!evo);
        }
        // need some place to put this
        var graphContainerEl = document.createElement('div');
        graphContainerEl.className = 'graph-container';
        var graphTitleEl = document.createElement('h2');
        graphTitleEl.className = 'graph-title';
        var graphTitle = evolutions[0].measure;
        if (key) {
          graphTitle += ' : ' + key;
        }
        if (params.compare) {
          graphTitle += ' - with varying ' + params.compare
        }
        graphTitleEl.textContent = graphTitle;
        graphContainerEl.appendChild(graphTitleEl);
        var graphEl = document.createElement('div');
        graphEl.className = 'graph';
        var graphLegendEl = document.createElement('div');
        graphLegendEl.className = 'graph-legend';
        graphEl.appendChild(graphLegendEl);
        graphContainerEl.appendChild(graphEl);
        document.body.appendChild(graphContainerEl); // TODO: put this somewhere else?

        if (params.evoVersions > 0) {
          // This is where we leave the common path and divert to evo-only code
          graphContainerEl.classList.add('evo-graph-container');
          evoTime(params, graphEl, key, evolutions, compares);
          return;
        }

        // from now on, we're going to need histograms
        var hists = evolutions.map((evo, i) => {
          var hist = evo.histogram();
          hist.compareLabel = params.compare + '=' + compares[i]; // TODO: i18n
          return hist;
        });

        // More complicated charts require us to munge the data so MG can plot
        // Specifically, it wants a `data = [{date, value},...]` for the data
        // and a corresponding array of ticks for the x axis `starts = [bucket0Start, ...]`
        // AND we need to know the ends for the mouseover display

        // the starts, ends will be same across all of the evos in `evolutions`, so use [0]'s
        var starts = [];
        var ends = [];
        hists[0].map((count, start, end, i) => { starts.push(start); ends.push(end); });
        // the last 'end' is guessed by Telemetry, since it's a catch-all bucket. Un-guess.
        ends[ends.length - 1] = Infinity;

        // pardon my grammar fail, but I can't think of another way to represent
        // an array of data arrays ( datas = [ data0, data1, ... ] )
        var datas = hists.map(hist => hist.map((count, start, end, i) => {
          // this is the MG data format. We could choose better labels,
          // but no one'd see them but us.
          return {
            date: i,
            value: count / hist.count * 100
          };
        }));

        // We don't trim single-evo bool/flag plots
        if (evolutions.length == 1
          && (evolutions[0].kind == 'boolean' || evolutions[0].kind == 'flag')) {
          // Who likes pie (charts)?
          displayAsPie(graphEl, datas[0], starts);
          return;
        }

        // If asked for, trim low-count outer buckets from all data
        if (params.trim) {
          // Now could be a good time to ensure data integrity:
          // assert(datas.forEach(data => data.length == starts.length == ends.length));
          var [trimLeft, trimRight] = getTrims(evolutions);
          starts = starts.slice(trimLeft, starts.length - trimRight);
          ends = ends.slice(trimLeft, ends.length - trimRight);
          for (var i = 0; i < datas.length; ++i) {
            datas[i] = datas[i].slice(trimLeft, datas[i].length - trimRight);
          }
        }

        if (datas.length == 1) {
          // After all this generality about how much data we're dealing with,
          // it turns out that it's just a single histogram after all. Yeesh.
          drawAsHistogram(
            graphEl,
            starts,
            ends,
            datas[0],
            hists[0]);
        } else {
          drawAsLines(
            graphEl,
            starts,
            ends,
            datas,
            hists);
        }
      });
    });
  });

  function evoTime(params, graphEl, key, evolutions, legendLabels) {
    var dateses = evolutions.map(evo => evo.dates());
    var [kind, desc] = [evolutions[0].kind, evolutions[0].description];
    var valueses;
    var yLabel;
    var valuesArePercent = false;
    if (kind == 'enumerated' || kind == 'boolean' || kind == 'flag') {
      const BUCKET_INDEX_FOR_ENUMERATED = 0;
      if (kind == 'boolean') {
        yLabel = desc + ' % FALSE'; // TODO: i18n
      } else {
        yLabel = desc + ' - bucket ' + BUCKET_INDEX_FOR_ENUMERATED; // i18n?
      }
      valueses = evolutions.map(evo =>
        evo.map(hist => 100 * hist.values[BUCKET_INDEX_FOR_ENUMERATED] / hist.count
      ));
      valuesArePercent = true;
    } else {
      yLabel = evolutions[0].description + ' - means()'; // i18n?
      valueses = evolutions.map(evo => evo.means());
    }
    var datas = dateses.map((dates, i) => dates.map((date, j) => {
      return {
        date: date,
        value: valueses[i][j],
      };
    }));
    MG.data_graphic({
      data: datas,
      chart_type: 'line',
      full_width: true,
      full_height: true,
      top: 0,
      right: 0,
      bottom: 40,
      left: 70,
      min_y_from_data: true,
      target: graphEl,
      x_extended_ticks: true,
      x_label: params.useSubmissionDate ? 'Submission Date' : 'Built Date', // TODO: i18n
      y_label: yLabel,
      xax_format: date =>
        (date.getMonth() + 1) + '-' + date.getDate(), // TODO: i18n
      yax_format: y => valuesArePercent ? y + '%' : y,
      transition_on_update: false,
      interpolate: 'linear',
      legend: legendLabels,
      legend_target: graphEl.querySelector('.graph-legend'),
      aggregate_rollover: true,
      linked: true,
    });
  }

  function drawAsLines(graphEl, starts, ends, datas, hists) {
    // taken from dist.js. Why do we have to do this?
    // maybe so the line is in the middle of the buckets?
    datas.forEach(data => data.forEach(datum => datum.date += 0.5));
    MG.data_graphic({
      aggregate_rollover: true,
      data: datas,
      chart_type: 'line',
      interpolate: 'linear',
      full_width: true,
      full_height: true,
      legend: hists.map(hist => hist.compareLabel),
      legend_target: graphEl.querySelector('.graph-legend'),
      transition_on_update: false,
      target: graphEl,
      x_label: hists[0].description,
      y_label: 'Percentage of Samples', // TODO: i18n
      y_extended_ticks: true,
      top: 0,
      right: graphEl.clientWidth / datas[0].length + 1,
      bottom: 40,
      left: 70,
      xax_count: Math.min(starts.length, graphEl.clientWidth / 50),
      yax_count: graphEl.clientHeight / 50, // just guesses
      xax_format: index => {
        if (!starts[index % starts.length]) {
          return '';
        }
        return formatNumber(starts[index % starts.length]);
      },
      yax_format: value => value + '%',
      mouseover: (datum, index) => {
        // disable the svg tooltip text
        emptyEl(graphEl.querySelector('.mg-active-datapoint'));

        // build label text for the bucket
        var label;
        if (ends[index % starts.length] == Infinity) {
          label = ' \u2265 ' + formatNumber(starts[index % starts.length]);
        } else if (hists[0].kind == 'enumerated') {
          label = formatNumber(starts[index % starts.length]);
        } else {
          label = '[' + formatNumber(starts[index % starts.length])
                  + ', ' + formatNumber(ends[index % starts.length]) + ')';
        }

        var legend = graphEl.querySelector('.graph-legend');
        emptyEl(legend);

        var bucketLabelEl = document.createElement('div');
        bucketLabelEl.textContent = label;
        legend.appendChild(bucketLabelEl);

        hists.forEach((hist, i) => {
          var lineLabel = hist.compareLabel + ' ' + Math.round(datum.values[i].value * 100) / 100 + '%';
          var lineLabelCircle = document.createElement('span');
          lineLabelCircle.className = 'mg-line' + datum.values[i].line_id + '-legend-color graph-legend-circle';
          lineLabelCircle.textContent = '\u25CF';
          var lineLabelEl = document.createElement('div');
          lineLabelEl.appendChild(lineLabelCircle);
          lineLabelEl.appendChild(document.createTextNode(lineLabel));
          legend.appendChild(lineLabelEl);
        });
      },
      mouseout: (datum, index) => {
        // maybe clear the legend.
      },
    });
  }

  function drawAsHistogram(graphEl, starts, ends, data, hist) {
    MG.data_graphic({
      data: data,
      binned: true,
      buffer: 0,
      chart_type: 'histogram',
      full_width: true,
      full_height: true,
      transition_on_update: false,
      target: graphEl,
      x_label: hist.description,
      y_label: 'Percentage of Samples', // TODO: i18n?
      y_extended_ticks: true,
      top: 0,
      right: graphEl.clientWidth / data.length + 1,
      bottom: 40,
      left: 70,
      xax_count: Math.min(starts.length, graphEl.clientWidth / 50),
      yax_count: graphEl.clientHeight / 50, // just guesses
      xax_format: index => {
        if (!starts[index]) {
          return '';
        }
        return formatNumber(starts[index]);
      },
      yax_format: value => value + '%',
      mouseover: (datum, index) => {
        // disable the svg tooltip text
        emptyEl(graphEl.querySelector('.mg-active-datapoint'));

        // build label text for the bucket
        var label;
        if (ends[index] == Infinity) {
          label = ' \u2265 ' + formatNumber(starts[index]);
        } else if (hist.kind == 'enumerated') {
          label = formatNumber(starts[index]);
        } else {
          label = '[' + formatNumber(starts[index])
                  + ', ' + formatNumber(ends[index]) + ')';
        }

        var count = formatNumber(hist.values[datum.x]);
        var percentage = Math.round(datum.y * 100) / 100 + '%';

        var samplesLabel = count + ' samples (' + percentage + ')';

        var legend = graphEl.querySelector('.graph-legend');
        emptyEl(legend);

        var bucketLabelEl = document.createElement('div');
        var samplesLabelEl = document.createElement('div');
        bucketLabelEl.textContent = label;
        samplesLabelEl.textContent = samplesLabel;
        legend.appendChild(bucketLabelEl);
        legend.appendChild(samplesLabelEl);
      },
      mouseout: (datum, index) => {
        // maybe clear the legend.
      },
    });

    // apparently we need to futz the MG so its Y-axis ticks cover _all_ the data
    var hangingBar = graphEl.querySelector('.mg-rollover-rects:last-child rect');
    var missingWidth = window.parseFloat(hangingBar.getAttribute('width'));
    for (var tick of graphEl.querySelectorAll('.mg-extended-y-ticks')) {
      tick.setAttribute('x2', window.parseFloat(tick.getAttribute('x2')) + missingWidth);
    }
  }

  function emptyEl(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  const CUTOFF_FACTOR = 0.0001;
  const MIN_NUM_BUCKETS = 3;
  function getTrims(evos) {
    // adapted/stolen from dist.js
    // over all of the histograms, find the largest trim that:
    //  - leaves at least 3 buckets
    //  - removes no buckets in any hist that are >= CUTOFF
    var minTrimLeft = Infinity;
    var minTrimRight = Infinity;
    evos.forEach(function (evo) {
      var histogram = evo.histogram();
      var counts = histogram.map(count => count);
      var trimLeft = 0;
      var trimRight = 0;
      var cutoff = CUTOFF_FACTOR * histogram.count;
      while (counts[trimLeft] < cutoff
        && counts.length - trimLeft - trimRight > MIN_NUM_BUCKETS) {
        trimLeft++;
      }
      while (counts[counts.length - 1 - trimRight] < cutoff
        && counts.length - trimLeft - trimRight > MIN_NUM_BUCKETS) {
        trimRight++;
      }
      if (trimLeft < minTrimLeft) {
        minTrimLeft = trimLeft;
      }
      if (trimRight < minTrimRight) {
        minTrimRight = trimRight;
      }
    });
    return [minTrimLeft, minTrimRight];
  }

  const BUCKET_NAMES = ['False', 'True', 'Invalid'];
  function displayAsPie(graphEl, data, starts) {
    new d3pie(graphEl, {
      data: {
        content: data.map((count, i) => {
          return {
            label: BUCKET_NAMES[i] || starts[i],
            value: count.value,
          }
        }).filter(datum => datum.value > 0),
      },
      size: {
        canvasWidth: graphEl.clientWidth,
        canvasHeight: graphEl.clientHeight,
      },
      labels: {
        mainLabel: {
          color: 'black',
          fontSize: 18,
        },
        percentage: {
          color: 'white',
          fontSize: 18,
          decimalPlaces: 2,
        },
      },
      effects: {
        load: {
          effect: 'none',
        },
        pullOutSegmentOnClick: {
          effect: 'none',
        },
      },
      tooltips: {
        enabled: true,
        string: '{value} ({percentage}%)',
        placeholderParser: (index, data) =>
          data.value = formatNumber(data.value) + ' samples',
      },
    });
  }

  function sensibleFilterOptions(filterOptions, filterName) {
    // for a given filterName, group its options into fewer categories to make life sensible.
    if (filterName == 'os') {
      // os can be upwards of 48 that can be bucketed into 3: Linux, OSX, Windows.
      // allow for an 'other' just in case
      var OSes = {};
      filterOptions['os'].forEach(osVersion => {
        var osName = osVersion.split(',')[0];
        OSes[osName] = true;
      });
      var outputFilterOptions = {
        'os': Object.keys(OSes),
      };
      return outputFilterOptions;
    }
    if (filterName == 'application') {
      // TODO: come up with some way to bucket 'Other' values
      // A filter with all of the values doesn't work since it ANDs them
      // have to get a bunch of them and .combine() the results

      // For now, just filter to only the ones starting with uppercase letters
      return {
        'application': filterOptions['application'].filter(appName =>
          appName[0] == appName[0].toUpperCase() && isNaN(appName[0] * 1)
        ),
      };
    }
    return filterOptions;
  }

  function formatNumber(number) {
    // lifted from dist.js
    if (number == Infinity) { return 'Infinity'; } // TODO: i18n?
    if (number == -Infinity) { return '-Infinity'; } // ditto i18n
    if (window.isNaN(number)) { return 'NaN'; } // i18n

    var mag = Math.abs(number);
    var exp = Math.floor(Math.log(mag) / Math.log(10));
    var interval = Math.pow(10, Math.floor(exp / 3) * 3);
    var units = {
      [Math.pow(10, 3)]: 'k',
      [Math.pow(10, 6)]: 'M',
      [Math.pow(10, 9)]: 'B', // uh, no. G, maybe? i18n
      [Math.pow(10, 12)]: 'T',
    };
    if (interval in units) {
      return Math.round(number * 100 / interval) / 100 + units[interval];
    }
    return Math.round(number * 100) / 100;
  }

  function setDefaultParams(params) {
    if (params.evoVersions > 0) {
      // evoVersions is currently incompatible with compare and trim
      delete params.trim;
      delete params.compare;
      delete params.sensibleCompare;
    }
    if (!params.channel || !params.version) {
      var [latestChan, latestVer] = Telemetry.getVersions()
        .filter(version => version.startsWith((params.channel || 'nightly') + '/'))
        .sort()
        .pop()
        .split('/');
      params.channel = params.channel || latestChan;
      params.version = params.version || latestVer;
    }
    params.metric = params.metric || 'GC_MS';
    params.filters = params.filters ? JSON.parse(params.filters) : {};
    params.useSubmissionDate = params.useSubmissionDate || false;
    params.sanitize = params.sanitize != 'false';
    params.trim = params.trim != 'false';
    params.compare = params.compare; // default undefined
    params.sensibleCompare = params.sensibleCompare != 'false';
    params.evoVersions = params.evoVersions; // default undefined
  }

}
}());
