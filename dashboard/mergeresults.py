try:
    import simplejson as json
except ImportError:
    import json
from urllib2 import urlopen, HTTPError
from argparse import ArgumentParser, ArgumentDefaultsHelpFormatter
from boto.sqs import connect_to_region as sqs_connect
from multiprocessing import Process
import sys, os

from auxiliary import HistogramAggregator
from s3get import s3get, Downloader

class ResultContext:
    def __init__(self):
        self.cache = {}

    def merge_result_file(self, result_file):
        with open(result_file, 'r') as f:
            for line in f:
                filePath, blob = line.split('\t')
                blob = json.loads(blob)
                self.merge_blob(filePath, blob)

    def merge_blob(self, filePath, blob):
        existing_blob = self.cache.setdefault(filePath, {})
        for filterPath, dump in blob.iteritems():
            aggregator = existing_blob.get(filterPath, None)
            if aggregator is None:
                aggregator = HistogramAggregator(**dump)
                existing_blob[filterPath] = aggregator
            else:
                aggregator.merge(**dump)

    def output(self, result_file):
        with open(result_file, 'w') as f:
            for filePath, blob in self.cache.iteritems():
                for filterPath, aggregator in blob.iteritems():
                    blob[filterPath] = aggregator.dump()
                f.write(filePath + "\t")
                f.write(json.dumps(blob))
                f.write('\n')

class ResultMergingProcess(Process):
    def __init__(self, queue, path_set, result_path):
        super(ResultMergingProcess, self).__init__()
        self.queue = queue
        self.path_set = path_set
        self.result_path = result_path
        self.ctx = ResultContext()

    def run(self):
        while len(self.path_set) > 0:
            input_path = self.queue.get(timeout = 20 * 60)
            self.path_set.remove(input_path)
            self.ctx.merge_result_file(input_path)
            os.remove(input_path)
            print " - Merged result, % i left" % len(self.path_set)
        self.ctx.output(self.result_path)