try:
    import simplejson as json
except ImportError:
    import json
from urllib2 import urlopen, HTTPError
from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
import math, sys, os, errno

from auxiliary import HistogramAggregator

def mkdirp(path):
    try:
        os.makedirs(path)
    except OSError as e:
        if e.errno != errno.EEXIST or not os.path.isdir(path):
            raise

def get_simple_measures_definition(measure):
    return {
        "kind":                     "exponential",
        "low":                      1,
        "high":                     30000,
        "n_buckets":                50,
        "extended_statistics_ok":   True,
        "description":              "Histogram aggregation for simple measure: %s" % measure[15:]
    }

class ChannelVersionManager:
    """ Manages data stored for a specific channel / version """
    def __init__(self, root_folder, channel, version, pretty_print):
        self.data_folder = os.path.join(root_folder, channel, version)
        mkdirp(self.data_folder)
        self.print_indent = None
        if pretty_print:
            self.print_indent = 2
        self.max_filter_id = None

        # Load filter-tree
        self.filter_tree = self.json_from_file(
            "filter-tree.json",
            {'_id': 0, 'name': 'reason'}
        )

        # Load histogram definitions
        self.histograms = self.json_from_file("histograms.json", {})

        # Load histogram revision meta-data
        self.revisions = self.json_from_file("revisions.json", {})

    def json_from_file(self, filename, fallback_value):
        """ Load json from file, return fallback_value if no file exists """
        path = os.path.join(self.data_folder, filename)
        if os.path.isfile(path):
            with open(path, 'r') as f:
                return json.load(f)
        return fallback_value

    def json_to_file(self, filename, value):
        """ Write JSON to file """
        path = os.path.join(self.data_folder, filename)
        with open(path, 'w') as f:
            json.dump(value, f, indent = self.print_indent)

    def get_next_filter_id(self):
        """ Get the next filter id available """
        if self.max_filter_id is None:
            def find_max(tree, maxid = 0):
                m = int(tree['_id'])
                if m > maxid:
                    maxid = m
                for subtree in tree.itervalues():
                    if type(subtree) is dict:
                        find_max(subtree, maxid)
                return maxid
            self.max_filter_id = find_max(self.filter_tree)
        self.max_filter_id += 1
        return self.max_filter_id

    def get_filter_id(self, filterPath):
        """ Get/create filter id for filterPath """
        filter_names = ['reason', 'appName', 'OS', 'osVersion', 'arch']
        parent = self.filter_tree
        for i in xrange(0, len(filterPath)):
            entry = filterPath[i]
            child = parent.get(entry, None)
            if child is None:
                child = {
                    '_id':      self.get_next_filter_id(),
                }
                if i < len(filter_names) - 1:
                    child['name'] = filter_names[i + 1]
                parent[entry] = child
            parent = child
        return parent['_id']

    def flush(self):
        """ Output cache values """
        # Output filter tree
        self.json_to_file('filter-tree.json', self.filter_tree)

        # Output histogram definitions
        self.json_to_file('histograms.json', self.histograms)

        # Output histogram revisions meta-data
        self.json_to_file('revisions.json', self.revisions)

    def fetch_histgram_definition(self, measure, revision):
        """ Fetch histogram definition from histogram.json server """
        if revision == 'simple-measures-hack':
            assert measure.startswith("SIMPLE_MEASURES_"), "simple measures should be prefixed!"
            return get_simple_measures_definition(measure)
        url = "http://localhost:9898/histograms?revision=%s" % revision
        try:
            request = urlopen(url)
        except HTTPError:
            print >> sys.stderr, "Failed to fetch revision: %s" % revision
            raise
        histograms = json.load(request)
        if histograms.has_key(measure):
            return histograms[measure]
        if measure.startswith("SIMPLE_MEASURES_"):
            return get_simple_measures_definition(measure)
        if measure.startswith("STARTUP_") and  histograms.has_key(measure[8:]):
            return histograms[measure[8:]]
        print >> sys.stderr, "Measure is not defined: %s" % measure
        return {}

    def merge_in_blob(self, measure, byDateType, blob):
        """
            Merge in a map on the form
            {filterPath: HistogramAggregator.dump()}
            to file <measure>-<byDateType> where <byDateType> is with
            "by-build-date" or "by-submission-date"
        """
        # Find most recent: revision, buildId and data-array-length
        metadata = self.revisions.get(measure, {})
        revision = metadata.get('revision', None)
        buildId  = metadata.get('buildId', '')
        length   = metadata.get('length', 0)

        # Look for a newer buildId
        update_definition = False
        purge_data = False
        for dump in blob.itervalues():
            if buildId < dump.get('buildId', ''):
                # Okay histogram definition needs to be updated
                update_definition = True
                # if we have a data-array length mismatch, then we purge existing data
                if length != len(dump['values']):
                    purge_data = True
                revision    = dump['revision']
                buildId     = dump['buildId']
                length      = len(dump['values'])

        # A newer buildId was found
        if update_definition:
            definition = self.fetch_histgram_definition(measure, revision)
            self.histograms[measure] = definition
            self.revisions[measure] = {
                'revision':     revision,
                'buildId':      buildId,
                'length':       length
            }

        # Delete files if lengths mismatched...
        if purge_data:
            byBuildDateFileName         = measure + "-by-build-date.json"
            bySubmissionDateFileName    = measure + "-by-submission-date.json"
            if os.path.isfile(bySubmissionDateFileName):
                os.remove(bySubmissionDateFileName)
            if os.path.isfile(byBuildDateFileName):
                os.remove(byBuildDateFileName)
            self.json_to_file(byBuildDateFileName, {})
            self.json_to_file(bySubmissionDateFileName, {})

        # Filename to merge blob into
        filename = measure + "-" + byDateType + ".json"

        # Get existing data
        dataset = self.json_from_file(filename, {})

        # Merge in loaded values
        for filterPath, dump in blob.iteritems():
            # Split filter path and get the date
            filterPath = filterPath.split('/')
            date = filterPath[0]
            filterPath = filterPath[1:]

            # Skip if there is a length mismatch
            if length != len(dump['values']):
                continue

            # Get data for a date
            data = dataset.setdefault(date, {})

            # Get filter id
            fid = str(self.get_filter_id(filterPath))

            # Get existing values, if any
            values = data.get(fid, None)

            # Merge in values, if we don't have any and
            if values != None:
                aggregator = HistogramAggregator(**dump)
                aggregator.merge(values, buildId, revision)
                values = aggregator.values
            else:
                values = dump['values']

            # Store values for filter id
            data[fid] = values

        # Store dataset
        self.json_to_file(filename, dataset)


def main():
    p = ArgumentParser(
        description = 'Merge analysis results to disk',
        formatter_class = ArgumentDefaultsHelpFormatter
    )
    p.add_argument(
        "-f", "--input-file",
        help = "Input file to merge to data folder",
        required = True
    )
    p.add_argument(
        "-o", "--output-folder",
        help = "Output folder to merge data into",
        required = True
    )
    p.add_argument(
        "-p", "--pretty-print",
        help = "Pretty print generated JSON",
        action = 'store_true'
    )
    cfg = p.parse_args()

    cache = {}
    with open(cfg.input_file, 'r') as f:
        for line in f:
            filePath, blob = line.split('\t')
            (channel, majorVersion, measure, byDateType) = filePath.split('/')
            blob = json.loads(blob)
            manager = cache.get((channel, majorVersion), None)
            if manager is None:
                manager = ChannelVersionManager(cfg.output_folder,
                                                channel, majorVersion,
                                                cfg.pretty_print)
                cache[(channel, majorVersion)] = manager
            manager.merge_in_blob(measure, byDateType, blob)
    for manager in cache.itervalues():
        manager.flush()

if __name__ == "__main__":
    sys.exit(main())