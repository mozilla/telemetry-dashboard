Telemetry Dashboard
===================

This repository contains the **source code for [telemetry.mozilla.org](https://telemetry.mozilla.org)**. The dashboards on this site can be used for everything from checking measure values to figuring out common causes of Firefox hangs.

The main dashboards on [telemetry.mozilla.org](https://telemetry.mozilla.org) consume data from Telemetry's backend using Telemetry.js.

The dashboards that do not use Telemetry.js generally use [scheduled analysis jobs](https://analysis.telemetry.mozilla.org/) that regularly publish data on S3. The source code for these can be found in their respective repositories.

This repository also contains the **source code for Telemetry.js**. The specific files can be found under the `v2/` directory.

Deploying Telemetry Dashboard
-----------------------------

The [telemetry.mozilla.org](https://telemetry.mozilla.org) site is hosted in [Github Pages](https://pages.github.com/), so it may also be accessed via [mozilla.github.io/telemetry-dashboard](https://mozilla.github.io/telemetry-dashboard/). In front of Github Pages, there is also the CloudFront CDN (managed by :whd).

Updates to the `gh-pages` branch (also the default branch) will be reflected on [telemetry.mozilla.org](https://telemetry.mozilla.org) after a few moments.

Using Telemetry.js
------------------

Check out the documentation!

* [Telemetry.js v2](https://github.com/mozilla/telemetry-dashboard/blob/gh-pages/v2/doc.md)

Adding Telemetry Probes
-----------------------

See this [MDN article](https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Adding_a_new_Telemetry_probe), which outlines the process and details for adding new Telemetry probes to Firefox which can be used with the dashboards.

For setting histogram properties, make sure to check out the [histogram simulator](https://telemetry.mozilla.org/histogram-simulator/), which might help with designing histograms that fit the expected data well.

Contributing to the Telemetry Dashboard
---------------------------------------

This project is entirely open source, and licensed under the MPL to boot. Contributions welcome!

### Getting started

Looking for some task to get started on? Check the list of [mentored issues](https://github.com/mozilla/telemetry-dashboard/labels/mentored). If you're unsure what to choose, just get in touch.

Communication happens mostly on Github in the comments for issues or pull requests, but we're also active in IRC in [#tmo on irc.mozilla.org](https://client00.chat.mibbit.com/?server=irc.mozilla.org&channel=%23tmo).

### Working on the dashboard

A local webserver is really helpful for running a version of the site on the same machine you're developing on.
* This can be done as follows (requires Python):

          cd /PATH_TO_REPOSITORY_ROOT
          python -m http.server
          # now visit localhost:8000 in your browser to see the page

* It can also be done with NPM:

          cd /PATH_TO_REPOSITORY_ROOT
          npm install http-server -g
          # now visit localhost:8080 in your browser to see the page

Shortlink buttons (in the top right hand corner of the main dashboards) will not work when running the site on local servers. This is because they are shortened with bit.ly, which doesn't allow local links.

### Submitting pull requests for the dashboard

For pull requests, it is recommended that you set up a live site hosting your branch. This makes it a lot easier for reviewers to check out the changes.

[GitHub Pages](https://pages.github.com/) is great for this, you can enable this in your forked repository under "Settings", "Github pages" and then share the link in your pull requests comments. The [Github help pages](https://help.github.com/categories/github-pages-basics/) have more information.

If you need more than one test site up at a time, try [Divshot](https://divshot.com/), a static website hosting service.

### Working on Telemetry.js

Telemetry.js (both versions) is pretty straightforward to work on. However, note that sites that use Telemetry.js generally hotlink to the source files - make sure to preserve API backwards compatibility wherever possible.
