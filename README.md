Telemetry Dashboard
===================

This repository contains the **source code for [telemetry.mozilla.org](https://telemetry.mozilla.org)**. The dashboards on this site can be used for everything from checking measure values to figuring out common causes of Firefox hangs.

The main dashboards on [telemetry.mozilla.org](https://telemetry.mozilla.org) consume data from Telemetry's v2 and v4 backends using Telemetry.js. For an overview of how all these systems fit together, see [Telemetry Demystified](https://anthony-zhang.me/blog/telemetry-demystified/).

The dashboards that do not use Telemetry.js generally use [scheduled analysis jobs](https://analysis.telemetry.mozilla.org/) that regularly publish data on S3. The source code for these can be found in their respective repositories.

This repository also contains the **source code for Telemetry.js** (all versions). The specific files can be found under the `v1/` and `v2/` directories.

We currently have two versions of the Histogram Dashboard and Evolution Dashboard - one for the v2 pipeline, and one for the v4 pipeline. The v4 versions live in the `new-pipeline/` directory. The v2 versions live in the project root.

Deploying Telemetry Dashboard
-----------------------------

The [telemetry.mozilla.org](https://telemetry.mozilla.org) site is hosted in [Github Pages](https://pages.github.com/), so it may also be accessed via [mozilla.github.io/telemetry-dashboard](https://mozilla.github.io/telemetry-dashboard/). In front of Github Pages, there is also the CloudFront CDN (managed by :whd).

Updates to the `gh-pages` branch (also the default branch) will be reflected on [telemetry.mozilla.org](https://telemetry.mozilla.org) after a few moments.

Using Telemetry.js
------------------

Check out the documentation!

* [Telemetry.js v1](https://telemetry.mozilla.org/docs.html)
* [Telemetry.js v2](https://github.com/mozilla/telemetry-dashboard/blob/master/v2/doc.md)

Adding Telemetry Probes
-----------------------

See this [MDN article](https://developer.mozilla.org/en-US/docs/Mozilla/Performance/Adding_a_new_Telemetry_probe), which outlines the process and details for adding new Telemetry probes to Firefox which can be used with the dashboards.

For setting histogram properties, make sure to check out the [histogram simulator](https://telemetry.mozilla.org/histogram-simulator/), which might help with designing histograms that fit the expected data well.

Hacking Telemetry Dashboard
---------------------------

This project is entirely open source, and licensed under the MPL to boot. Contributions welcome!

Some notes for working on the code:

* A local webserver is really helpful for running a version of the site on the same machine you're developing on.
  * This can be done as follows (requires Python):

          cd /PATH_TO_REPOSITORY_ROOT
          python -m SimpleHTTPServer
          # now visit localhost:8000 in your browser to see the page

  * Note that permalink buttons (in the top right hand corner of the main dashboards) will not work when running the site on local servers. This is because they are shortened with bit.ly, which doesn't allow local links.
* A remote webserver is really helpful for showing off your features and fixes to other people (especially for code review).
  * [GitHub Pages](https://pages.github.com/) is great for this - just push your local branch to the `gh-pages` branch on your GitHub fork of the repository, and the site will be live on `YOUR_USERNAME.github.io/telemetry-dashboard`.
  * If you need more than one test site up at a time, try [Divshot](https://divshot.com/), a static website hosting service.
  * For pull requests, it is recommended that you set up a live site hosting your branch. This makes it a lot easier for reviewers to check out the changes.

Telemetry.js (both versions) is pretty straightforward to work on. However, note that sites that use Telemetry.js generally hotlink to the source files - make sure to preserve API backwards compatibility wherever possible.
