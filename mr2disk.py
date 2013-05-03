import sys, os
try:
    import simplejson as json
    sys.stderr.write("Using simplejson for faster json parsing\n")
except ImportError:
    import json
from datetime import datetime
import specgen

OUTDIR = sys.argv[1]

def time_delta(old):
    delta = (datetime.now() - old)
    ms = delta.seconds * 1000 + delta.microseconds/1000.0
    return ms

def split(str, sep):
    sep = str.find(sep)
    assert(sep != -1)
    return (str[:sep], str[sep+1:])

def readExisting(filename, default):
    try:
        f = open(filename)
        obj = json.loads(f.read())
        f.close()
        print "Read " + filename
        return obj
    except IOError:
        return default
def writeJSON(filename, obj):
    # try to make a directory if can't open a file for writing
    try:
        f = open(filename, 'w')
    except IOError:
        os.makedirs(os.path.dirname(filename))
        f = open(filename, 'w')
    f.write(json.dumps(obj))
    f.close()
    print "Wrote " + filename

def flush_histograms(histograms, (channel, version)):
    """If we read-in a file from disk, need to traverse the datastructure to fix the next id to continue from"""
    def findMaxId(tree, maxid):
        id = int(tree['_id'])
        if id > maxid:
            maxid = id
        for subtree in tree.values():
            if type(subtree) != dict:
                continue
            maxid = findMaxId(subtree, maxid)
        return maxid
    def getId(tree_args):
        assert(len(tree_args) == 5)
        atm = filters['root']
        i = 0
        for pvalue in tree_args:
            i = i + 1
            try:
                atm = atm[pvalue]
            except KeyError:
                # names for entries in filter tree
                key = ['reason', 'appName', 'OS', 'osVersion', 'arch']
                tmp = {'_id':filters['idcount']}
                if i < len(key):
                    tmp['name'] = key[i]
                filters['idcount'] += 1
                atm[pvalue] = tmp;
                atm = tmp
        return atm['_id']
    def indexFilterArray(hls):
        out = {}
        for i in range(0, len(hls)):
            h = hls[i]
            filterid = h[-1]
            out[filterid] = i
        return out

    def mergeFilteredHistograms(hls1, hls2):
        f1 = indexFilterArray(hls1)
        f2 = indexFilterArray(hls2)
        s1 = set(f1.keys())
        s2 = set(f2.keys())
        for f in s1.intersection(s2):
            h1 = hls1[f1[f]]
            h2 = hls2[f2[f]]
            #-1 cos last element is the filter id
            for i in range(0, len(h1) - 1):
                h1[i] += h2[i]


        for f in s2.difference(s2):
            h2 = hls2[f2[f]]
            hls1.append(h2)
        return hls1


    """merge h2 into h1"""
    def mergeAggHistograms(h1, h2):
        if h2 == None:
            return h1
        if h1['buckets'] != h2['buckets']:
            print ["old buckets:", h2['buckets']]
            print ["new buckets:", h1['buckets']]
            sys.exit(1);

        dates1 = set()
        dates2 = set()
        v1 = h1['values']
        v2 = h2['values']
        dates1.update(v1.keys())
        dates2.update(v2.keys())
        for date in dates2.difference(dates2):
            v1[date] = v2[date]
        for date in dates1.intersection(dates2):
            v1[date] = mergeFilteredHistograms(v1[date], v2[date])
        return h1

    def merge_histograms_filters_key(h1, h2):
        if h2 == None:
            return h1
        s1 = set(h1.keys());
        s2 = set(h2.keys());
        for name in s2.difference(s1):
            h1[name] = h2[name]

        for name in s1.intersection(s2):
            s = set(h1[name])
            s.update(h2[name])
            h1[name] = list(s)
        return h1

    outdir = "%s/%s/%s" % (OUTDIR, channel, version)
    filters = {}
    filters['root'] = readExisting("%s/filter.json" % outdir, {'_id':"0", 'name':'reason'})
    filters['idcount'] = findMaxId(filters['root'], 0) + 1
    # mapping of histogram to useful filter values(no point in showing filters that contain no data)
    histograms_filters_key = {}

    for h_name, h_body in histograms.iteritems():
        valid_filters = set()
        h_values = h_body['values']
        for date, values_by_filterpath in h_values.iteritems():
            filtered_values = []
            h_values[date] = filtered_values
            for filterpath,values in values_by_filterpath.iteritems():
                #['reason', 'appName', 'OS', 'osVersion', 'arch']
                ls = filterpath.split('/')
                id = getId(ls)
                values.append(id)
                filtered_values.append(values)
                # record that this histogram has data for this filter
                valid_filters.add(id)
        filename = "%s/%s.json" % (outdir, h_name)
        h_body = mergeAggHistograms(h_body, readExisting(filename, None))
        writeJSON(filename, h_body)
        histograms_filters_key[h_name] = list(valid_filters)
    histogramsfile = "%s/histograms.json" % outdir
    writeJSON(histogramsfile, 
              merge_histograms_filters_key(histograms_filters_key,
                                           readExisting(histogramsfile, None)))
    writeJSON("%s/filter.json" % outdir, filters['root'])


start = datetime.now()
bytes_read = 0

histograms = {}
current_release = None
outputdirs = {}
e = readExisting("%s/versions.json" % OUTDIR, None)
if e:
    for entry in e:
        outputdirs[entry] = 1

while True:
    line = sys.stdin.readline()
    l = len(line)
    if l == 0:
        flush_histograms(histograms, current_release)
        outputdirs["/".join(current_release)] = 1
        break
    bytes_read += l 
    (key, value) = split(line[:-1], '\t')
    [channel, version, histogram_name] = key.split('/')
    if (channel, version) != current_release:
        if current_release != None:
            flush_histograms(histograms, current_release)
            outputdirs["/".join(current_release)] = 1
        current_release = (channel, version)
        histograms = {}
    assert(not histogram_name in histograms)
    histogram = {}
    # mrHistogram = histogram from map/reduce job
    mrHistogram = json.loads(value)
    # todo, map/reduce job should output relevant buckets(or relevant info to generate them)
    histograms[histogram_name] = {'buckets':mrHistogram['buckets'], 'values':histogram}
    for key, values in mrHistogram['values'].iteritems():
        (date, filterpath) = split(key,'/')
        histogram_values_by_filterpath = histogram.get(date, None)
        if histogram_values_by_filterpath == None:
            histogram_values_by_filterpath = {}
            histogram[date] = histogram_values_by_filterpath
        assert(not filterpath in histogram_values_by_filterpath)
        histogram_values_by_filterpath[filterpath] = values

writeJSON("%s/versions.json" % OUTDIR, sorted(outputdirs.keys()))
ms = time_delta(start)
sys.stderr.write("read %s MB/s %d bytes in %s seconds\n" % (str(1000*bytes_read/1024/1024/ms), bytes_read, ms/1000))
