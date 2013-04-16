#!/usr/bin/python
import sys
import os.path
import os
import mapreduce
import histogram_tools
try:
    import simplejson as json
    print "Using simplejson for faster json parsing"
except ImportError:
    import json


histogram_specs = {}

for h in histogram_tools.from_file(sys.argv[1]):
    try:
        buckets = map(str, h.ranges())
        bucket2index = {}
        for i in range(0, len(buckets)):
            bucket2index[buckets[i]] = i
        histogram_specs[h.name()] = bucket2index
    except:
        print "Could not figure out bucket range for %s" % h.name()


f = sys.stdin

class Context:
    def __init__(self):
        self.values = {}
        
    def write(self, key, value):
        ls = self.values.get(key, None)
        if ls == None:
            ls = []
            self.values[key] = ls
        ls.append(key)

    def summarize(self):
        print "%d values produced" % len(self.values)

context = Context()
while True:
    line = f.readline()
    if len(line) <= 1:
        if len(line) == 0:
            break;
        else:
            continue

    data = json.loads(line)
    mapreduce.map(0, data, histogram_specs, context)
context.summarize()
