Telemetry Dashboard
===================
Telemetry dashboard is a presentation of histogram and simple measure aggregates
of telemetry submissions. The default dashboard developed in this repository is
hosted at [telemetry.mozilla.com](http://telemetry.mozilla.com).

But the aggregated data is also available for consumption by third-party
applications, so you don't need to do the aggregation on your own.

Consuming Telemetry Aggregations
--------------------------------
Include into your code `http://telemetry.mozilla.com/v1/telemetry.js` feel free
to use the other modules too. Don't go about reading the raw JSON files,
they are not designed for human consumption!

We recommend that you include `telemetry.js` from
`http://telemetry.mozilla.com/v1/telemetry.js`, this file is used to access all
the generated aggregates. We will undertake reasonable effort to ensure that it
remains backwards compatible and continously updated with new aggregates.

Please refer to the [official documentation](http://telemetry.mozilla.org/docs.html)
for `telemetry.js` for instructions on how to use this library.

  * [telemetry.js documentation](http://telemetry.mozilla.org/docs.html)

Hacking Telemetry Dashboard
---------------------------
If you want to improve the user-interface for telemetry dashboard, clone this
repository, hack and push the master branch to your own `gh-pages` branch.
Now you can share your dashboard with others.

If you want to add new aggregations, or improve upon existing aggregations, ie.
anything that provides data not already provided by `telemetry.js` then you
should look in the [telemetry-aggregator](https://github.com/mozilla/telemetry-aggregator)
repository.

Essentially, the dashboard is split in two repositories, the web-face features
in this repository. And the server-side analysis job aggregating data in the
[telemetry-aggregator](https://github.com/mozilla/telemetry-aggregator)
repository. The reasoning behind this is to make it easy to fork this repository
improve the visual representations of the aggregates and create a custom dashboard
hosted on github pages.

