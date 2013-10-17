import histogram_tools
import sys
import json


def get(filename):
    ret = {}
    for h in histogram_tools.from_file(filename):
        try:
            ret[h.name()] = h.ranges()
        except:
            sys.stderr.write("Could not figure out bucket range for %s\n"
                             % h.name())
    return ret


def mapping(filename):
    "returns a map name->bucket_range"
    histogram_specs = {}
    for name, ranges in get(filename).iteritems():
            buckets = map(str, ranges)
            bucket2index = {}
            for i in range(0, len(buckets)):
                bucket2index[buckets[i]] = i
            histogram_specs[name] = (bucket2index, ranges)
    return histogram_specs

"""Generate a python script we can import from map/reduce"""
if __name__ == '__main__':
    print "histograms = " + repr(mapping(sys.argv[1]))
