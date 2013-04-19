"""
Generate a datafile we can use from jydoop
"""
import histogram_tools
import sys
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
        sys.stderr.write("Could not figure out bucket range for %s\n" % h.name())
print json.dumps(histogram_specs)
