#!/usr/bin/env python
'''
Fetch /toolkit/components/telemetry/Histograms.json for various firefox
branches and store them in the local FS in `validation/[branch]/Histograms.json
'''

import os
import requests

build_map = {
    'aurora': 'releases/mozilla-aurora',
    'beta': 'releases/mozilla-beta',
    'nightly': 'integration/mozilla-inbound',
    'release': 'releases/mozilla-release',
    #'ux': 'projects/ux'
}


hg_template = ('https://hg.mozilla.org/{0}/raw-file/default/'
               'toolkit/components/telemetry/Histograms.json')


def main():
    for build, branch in build_map.iteritems():
        url = hg_template.format(branch)
        response = requests.get(url)
        if response.status_code is not 200:
            error_message = ("{0} could not be downloaded:"
                             "response code {1} from {2}")
            print error_message.format(build, response.status_code, url)
            continue
        try:
            directory_path = 'validation/{0}'.format(build)
            os.makedirs(directory_path)
        except OSError:
            print directory_path, "already exists. Overwriting."
        with open(directory_path + "/histogram_specs.json", 'w') as o:
            [o.write(x) for x in response.text]

if __name__ == '__main__':
    main()
