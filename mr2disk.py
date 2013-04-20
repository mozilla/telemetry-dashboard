import sys
try:
    import simplejson as json
    sys.stderr.write("Using simplejson for faster json parsing\n")
except ImportError:
    import json
from datetime import datetime

def time_delta(old):
    delta = (datetime.now() - old)
    ms = delta.seconds * 1000 + delta.microseconds/1000.0
    return ms

def split(str, sep):
    sep = str.find(sep)
    assert(sep != -1)
    return (str[:sep], str[sep+1:])

def flush_histograms(histograms, (channel, version)):
    print("flushing", channel, version)
    print histograms

start = datetime.now()
bytes_read = 0

histograms = {}
current_release = None
while True:
    line = sys.stdin.readline()
    l = len(line)
    if l == 0:
        flush_histograms(histograms, current_release)
        break
    bytes_read += l 
    (key, value) = split(line[:-1], '\t')
    [channel, version, histogram_name] = key.split('/')
    if (channel, version) != current_release:
        if current_release != None:
            flush_histograms(histograms, current_release)
        current_release = (channel, version)
        histograms = {}
    value = json.loads(value)
    assert(not histogram_name in histograms)
    histogram = {}
    histograms[histogram_name] = histogram
    for key, values in value.iteritems():
        (date, filterpath) = split(key,'/')
        histogram_values_by_filterpath = histogram.get(date, None)
        if histogram_values_by_filterpath == None:
            histogram_values_by_filterpath = {}
            histogram[date] = histogram_values_by_filterpath
        assert(not filterpath in histogram_values_by_filterpath)
        histogram_values_by_filterpath[filterpath] = values

ms = time_delta(start)
sys.stderr.write("read %s MB/s %d bytes in %s seconds\n" % (str(1000*bytes_read/1024/1024/ms), bytes_read, ms/1000))
