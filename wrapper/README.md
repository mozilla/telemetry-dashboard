# telemetry-wrapper.js - for High-Performance Plots

## Dependencies
* mediagraphics
* d3pie
* and their dependencies

## API
```javascript
window.TelemetryWrapper.go(params, parentEl);
```
Where `params` is:
* `channel` - A string as per Telemetry.getEvolution (default: `"nightly"`)
* `version` - A string as per Telemetry.getEvolution (default: whatever the latest nightly is reported by Telemetry.getVersions())
* `metric` - A string as per Telemetry.getEvolution (default: `"GC_MS"`)
* `filters` - A JSON string for parsing into something that Telemetry.getEvolution can use (default: `"{}"`)
* `useSubmissionDate` - A boolean as per Telemetry.getEvolution (default: `false`)
* `sanitize` - A boolean as per someEvolutionInstance.sanitized() (default: `true`)
* `trim` - A boolean dictating whether or not you want your histograms to have data under 0.0001% ignored from both ends of your data (default: `true`)
* `compare` - A string filter name over which we will enumerate all values and plot on the same graph so you can compare the histograms (default: `undefined`)
* `sensibleCompare` - A boolean dictating whether or not you want to reduce the compared values to just the ones that you are likely to care about (default: `true`)
* `keyLimit` - a positive integer limiting the number of a keyed measure's measures to be plotted, ordered by number of submissions (default: `4`)
* `evoVersions` - A number telling us how many versions back to look. If > 0, we will ignore trim, compare, and sensibleCompare and show an evolution instead of a histogram (default: `0`)
* `percentile` - A number telling us the value below which a given percentage of measurements may be found. This is only valid when evoVersions > 0 (default: `50`)
* `evoBucketIndex` - The index denoting which bucket index to used to view an evolution for enumerated histograms. (default:0)

Where `parentEl` is:
* The parent element you want the wrapper to render its plots into.

## Simple Usage
```html
<!DOCTYPE html>
<html>
<head>
<title>Simple Example</title>
<link rel="stylesheet" href="https://telemetry.mozilla.org/new-pipeline/style/metricsgraphics.css"/>
<link rel="stylesheet" href="https://telemetry.mozilla.org/wrapper/telemetry-wrapper.css"/>
</head>
<body>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.5/d3.min.js"></script>
  <script src="https://telemetry.mozilla.org/new-pipeline/lib/metricsgraphics.min.js"></script>
  <script src="https://telemetry.mozilla.org/new-pipeline/lib/d3pie.min.js"></script>
  <script src="https://telemetry.mozilla.org/v2/telemetry.js"></script>
  <script src="https://telemetry.mozilla.org/wrapper/telemetry-wrapper.js"></script>
  <script>
    window.TelemetryWrapper.go({}, document.body);
  </script>
</body>
</html>
```
