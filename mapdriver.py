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

bytes_read = 0
try:
    from java.util import Date
    start = Date()
    jython = True
except ImportError:
    from datetime import datetime
    start = datetime.now()
    jython = False

while True:
    line = f.readline()
    l = len(line)
    if l <= 1:
        if l == 0:
            break;
        else:
            continue
    bytes_read += l
    data = json.loads(line)
    mapreduce.map(0, data, histogram_specs, context)

if jython:
    ms = (Date().getTime() - start.getTime())
else:
    delta = (datetime.now() - start)
    ms = delta.seconds * 1000 + delta.microseconds/1000

print str(1000*bytes_read/1024/1024/ms) + " MB/s %d bytes in %s seconds" % (bytes_read, ms/1000)
context.summarize()
