/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// utility functions
var $ = (selector) => document.querySelector(selector);

var createOption = (parent, value, text = value, selected = false) => {
  var option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  option.selected = selected;
  parent.appendChild(option);
};

var removeAllChildren = (el) => {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
};

window.addEventListener('load', function () {
  var _versions; // {channel: [versions (sorted)], ...}
  var _dash = []; // ordered list of plots for your dash

  const VERSIONS_OFF_NIGHTLY = {
    'nightly': 0,
    'aurora': 1,
    'beta': 2,
    'release': 3,
  };

  Telemetry.init(() => {

    // versions are static across the session, so stash 'em
    _versions = {};
    Telemetry.getVersions()
      .map(versionString => {
        var [channel, version] = versionString.split('/');
        if (!_versions[channel]) {
          _versions[channel] = [version];
        } else {
          _versions[channel].push(version);
        }
      });
    // aggregates.t.m.o doesn't sanitize its versions well
    _versions['nightly'].sort((a, b) => b - a);
    for (var channel in _versions) {
      if (channel == 'nightly') {
        continue;
      }
      var maxVer = _versions['nightly'][0] - VERSIONS_OFF_NIGHTLY[channel];
      _versions[channel] = _versions[channel]
        .filter(ver => ver <= maxVer)
        .sort((a, b) => b - a);
    }

    $('#channel').addEventListener('change', updateVersions);
    $('#version').addEventListener('change', updateMetricsAndComparesAndAppsAndOS);
    updateChannels();
    updateVersions();
    updateMetricsAndComparesAndAppsAndOS();
    updateE10s();

    $('#compare').addEventListener('change', () =>
      $('#sensible-compare').disabled = !$('#compare').selectedOptions[0].value);

    $('#add').addEventListener('click', addPlotToDash);

    loadPlotsFromLocation();
  });

  function addPlotToDash() {
    var plotParams = {
      channel: $('#channel').selectedOptions[0].value,
      version: $('#version').selectedOptions[0].value,
      metric: $('#metric').value,
      useSubmissionDate: $('#use-submission-date').checked,
      sanitize: $('#sanitize').checked,
      trim: $('#trim').checked,
      compare: $('#compare').selectedOptions[0].value,
      sensibleCompare: $('#sensible-compare').checked,
      evoVersions: $('#evo-radio').checked ? $('#evo-versions').value : 0,
      filters: undefined,
    };

    // now to add the filters
    if ($('#show-filters').checked) {
      var filters = {};
      if ($('#application').selectedOptions[0].value) {
        filters.application = $('#application').selectedOptions[0].value;
      }
      if ($('#os').selectedOptions[0].value) {
        filters.os = $('#os').selectedOptions[0].value;
      }
      var e10sFilters = E10S_OPTIONS[$('#e10s').selectedOptions[0].value];
      if (e10sFilters) {
        for (var filterName in e10sFilters) {
          filters[filterName] = e10sFilters[filterName];
        }
      }
      plotParams.filters = filters;
    }

    _dash.push(plotParams);

    addPlotToTable(plotParams);

    updatePostData();
  }

  function addPlotToTable(plotParams) {
    // put the params in the table so there are no surprises for the user
    var tr = document.createElement('tr');
    Object.keys(plotParams) // better hope it preserved order
      .forEach(param => {
        var td = document.createElement('td');
        if (typeof plotParams[param] == 'object') {
          td.textContent = JSON.stringify(plotParams[param]);
        } else if (param == 'version' && !plotParams[param]) {
          td.textContent = '-Latest-';
        } else {
          td.textContent = plotParams[param];
        }
        tr.appendChild(td);
      });

    var rmTd = document.createElement('td');
    var rmButton = document.createElement('button');
    rmButton.className = 'rm-button';
    rmButton.textContent = '-';
    rmButton.addEventListener('click', () => {
      var plotIndex = Array.prototype.indexOf.call(tr.parentElement.children, tr);
      _dash.splice(plotIndex, 1);
      updatePostData();
      tr.parentElement.removeChild(tr);
    });
    rmTd.appendChild(rmButton);
    tr.appendChild(rmTd);

    $('.dashboard-plots-body').appendChild(tr);

    // now that the dash spec has a plot, user can generate a dash
    $('#generate').removeAttribute('disabled');
  }

  function updateChannels() {
    // unlike the other update*(), this one ought only to be called once

    Object.keys(_versions)
      .forEach(channel => {
        createOption($('#channel'), channel, channel, channel == 'nightly');
      });
  }

  const E10S_OPTIONS = {
    'E10s Both Processes': {e10sEnabled: true},
    'E10s Parent-only': {e10sEnabled: true, child: false},
    'E10s Child-only': {e10sEnabled: true, child: true},
    'Single Process': {e10sEnabled: false, child: false},
  };
  function updateE10s() {
    // well, okay, this one ought only to be called once, too

    createOption($('#e10s'), '', '-No Filter-');
    for (op in E10S_OPTIONS) {
      createOption($('#e10s'), op);
    }
  }

  function updateVersions() {
    removeAllChildren($('#version'));

    createOption($('#version'), '', '-Latest-');
    _versions[$('#channel').selectedOptions[0].value]
      .forEach(version => createOption($('#version'), version));
  }

  function updateMetricsAndComparesAndAppsAndOS() {
    removeAllChildren($('#metrics'));
    removeAllChildren($('#compare'));
    removeAllChildren($('#application'));
    removeAllChildren($('#os'));

    var channel = $('#channel').selectedOptions[0].value;
    var version = $('#version').selectedOptions[0].value;
    if (!version) {
      version = _versions[channel][0];
    }

    Telemetry.getFilterOptions(
      channel,
      version,
      filterOptions => {

        filterOptions['metric']
          .forEach(metric => createOption($('#metrics'), metric));

        createOption($('#compare'), '', 'None');
        Object.keys(filterOptions)
          .forEach(filterName => createOption($('#compare'), filterName));

        // Only use the Uppercased app names, as they are the relevant ones
        createOption($('#application'), '', '-No Filter-');
        filterOptions['application']
          .filter(appName => appName[0] >= 'A' && appName[0] <= 'Z')
          .forEach(appName => createOption($('#application'), appName));

        // OS has only three useful families: Windows, Linux, OSX
        // so as long as they're all in filterOptions, they all get displayed
        createOption($('#os'), '', '-No Filter-');
        var OSes = {
          'Darwin': 'OSX',
          'Linux': 'Linux',
          'Windows_NT': 'Windows',
        };
        for (var family in OSes) {
          if (filterOptions['os'].some(osName => osName.startsWith(family))) {
            createOption($('#os'), family, OSes[family]);
          }
        }

        $('#metrics').dispatchEvent(new Event('change'));
        $('#compare').dispatchEvent(new Event('change'));
      });
  }

  function loadPlotsFromLocation() {
    var params = {};
    var start = 1;
    while (start < window.location.search.length) {
      var end = window.location.search.indexOf('&', start);
      if (end == -1) {
        end = window.location.search.length;
      }
      var [name, value] = window.location.search.substring(start, end).split('=');
      params[name] = value.split(';');
      params[name] = params[name].map(value =>
        window.decodeURIComponent(value.replace(/\+/g, ' ')));
      start = end + 1;
    }

    if (!('channel' in params)) {
      return; // no params to load
    }

    // params is in {name: [value1, value2, ..], ...} format
    // we need [{name: value1,...}, {name: value2,...}, ...]
    var plots = [];
    params['channel'] // channel is always present
      .forEach((channel, i) => {
        var plot = {
          channel: channel,
          version: params['version'][i],
          metric: params['metric'][i],
          useSubmissionDate: params['useSubmissionDate'][i],
          sanitize: params['sanitize'][i],
          trim: params['trim'][i],
          compare: params['compare'][i],
          sensibleCompare: params['sensibleCompare'][i],
          evoVersions: params['evoVersions'][i],
          filters: params['filters'][i] ? JSON.parse(params['filters'][i]) : '',
        };
        _dash.push(plot);
        addPlotToTable(plot);
      });
    updatePostData();
  }

  function getGeneratorUrl() {
    var channels = [];
    var versions = [];
    var metrics = [];
    var useSubmissionDates = [];
    var sanitizes = [];
    var trims = [];
    var compares = [];
    var sensibleCompares = [];
    var evoVersionses = [];
    var filterses = [];
    _dash.forEach(plot => {
      channels.push(plot.channel);
      versions.push(plot.version || '');
      metrics.push(plot.metric);
      useSubmissionDates.push(plot.useSubmissionDate || false);
      sanitizes.push(plot.sanitize || false);
      trims.push(plot.trim || false);
      compares.push(plot.compare || '');
      sensibleCompares.push(plot.sensibleCompare || false);
      evoVersionses.push(plot.evoVersions || 0);
      filterses.push(plot.filters ? JSON.stringify(plot.filters) : '');
    });

    var queryString = '?' +
      `channel=${channels.join(';')}&version=${versions.join(';')}` +
      `&metric=${metrics.join(';')}&useSubmissionDate=${useSubmissionDates.join(';')}` +
      `&sanitize=${sanitizes.join(';')}&trim=${trims.join(';')}` +
      `&compare=${compares.join(';')}&sensibleCompare=${sensibleCompares.join(';')}` +
      `&evoVersions=${evoVersionses.join(';')}&filters=${filterses.join(';')}`;

    if (!window.location.search) {
      return window.location.href + queryString;
    } else {
      return window.location.href.replace(window.location.search, queryString);
    }
  }

  function updatePostData() {
    const BASE_URL = 'https://telemetry.mozilla.org/';

    const EXTERNAL_CSS = '' +
      BASE_URL + 'new-pipeline/style/metricsgraphics.css;' +
      BASE_URL + 'wrapper/telemetry-wrapper.css';

    const EXTERNAL_JS = '' +
      'https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js;' +
      'https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js;' +
      BASE_URL + 'new-pipeline/lib/metricsgraphics.js;' +
      BASE_URL + 'new-pipeline/lib/d3pie.min.js;' +
      BASE_URL + 'v2/telemetry.js;' +
      BASE_URL + 'wrapper/telemetry-wrapper.js';

    const HTML = '' +
`<!-- To customize your generated dashboard, edit the styles in the CSS window.
   - To share or export your dashboard, first click 'Save' to solidify this pen.
   - Then, you can share the url for collaboration or hit 'Export' to grab the
   - sources so you can self-host.
 -->
`;

    const CSS = '' +
`body {
  display: flex;
  flex-flow: row wrap;
}
.graph-container {
  width: 45vw;
}
.graph-title {
  text-decoration: underline;
}
`;

    const JS = '' +
`var plots = ${JSON.stringify(_dash, null, '  ')};

/* The generator that created this dash can be found at:
 * ${getGeneratorUrl()}
 */

window.addEventListener('load', () => {
  for (plot of plots) {
    TelemetryWrapper.go(plot, document.body);
  }
});
`;
    var postData = {
      title: 'Generated Dashboard',
      editors: '111',
      css: CSS,
      html: HTML,
      js: JS,
      head: "<meta name='viewport' content='width=device-width'>",
      css_external: EXTERNAL_CSS,
      js_external: EXTERNAL_JS,
    };

    // Need to escape quotes carefully in the post data
    var postString = JSON.stringify(postData)
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");

    $('#post-data').value = postString
  }

});
