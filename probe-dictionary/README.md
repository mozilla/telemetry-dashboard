## probe-dictionary
A tool that makes the Telemetry probe data in Firefox more discoverable and searchable.

This front-end allows answering questions like 
* *"do we have any probes in Firefox 55 that tell us about [tab usage](https://telemetry.mozilla.org/probe-dictionary/?search=tab&searchtype=in_name&optout=true&channel=release&constraint=is_in&version=55)?"*
* *"which Firefox versions is this probe in anyway?"*

To achieve this, it uses data extracted by the [probe-scraper](https://github.com/mozilla/probe-scraper) project.
This pulls probe registry files (`Histograms.json`, `Scalars.yaml`, `Events.yaml`) from different Firefox versions together into one dataset.
Also, probes outside of `Histograms.json` - like the CSS use counters - are included in the output data.

Currently this supports:
* release, beta & nightly channels
* major releases only
* all probes registered in separate files (histograms, scalars, events)
* some select environment data points (more to come)
